"""Read-only form monitor. Never submits a booking form."""
import argparse
import asyncio
import json
import os
from pathlib import Path
import random
import time
import urllib.request
from urllib.parse import urlparse

DATA = Path(os.environ.get('MONITOR_DATA_DIR', Path(__file__).resolve().parent / 'data'))
SERVICES = {'4705': 'Passaporto', '5967': 'CIE'}


def classify(url, status, text, fields):
    text = ' '.join(text.lower().split())
    if status in (403, 429) or any(s in text for s in (
        'verify you are human', 'verifica di essere umano', 'just a moment',
        'checking your browser', 'attention required')):
        return 'blocked'
    if status >= 400 or status == 0:
        return 'error'
    if 'login' in urlparse(url).path.lower() or 'password' in fields:
        return 'login_required'
    if any(s in text for s in ('al momento non ci sono date', 'nessuna disponibilità',
                               'non ci sono appuntamenti', 'no appointments available',
                               'non sono disponibili', 'non ci sono disponibilità')):
        return 'unavailable'
    if (urlparse(url).hostname == 'prenotami.esteri.it'
            and urlparse(url).path.rstrip('/') in (
                '/Services/Booking/4705', '/Services/Booking/5967')
            and 'avanti' in text and 'prenotazione singola' in text
            and fields.intersection({'text', 'file', 'select'})):
        return 'form_available'
    return 'unknown'


def save_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    temporary = path.with_suffix('.tmp')
    fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, 'w') as output:
        json.dump(value, output)
    temporary.replace(path)


def notify(message):
    token, chat = os.environ.get('TELEGRAM_BOT_TOKEN'), os.environ.get('TELEGRAM_CHAT_ID')
    if not token or not chat:
        raise RuntimeError('Configure TELEGRAM_BOT_TOKEN e TELEGRAM_CHAT_ID.')
    request = urllib.request.Request(
        f'https://api.telegram.org/bot{token}/sendMessage',
        data=json.dumps({'chat_id': chat, 'text': message}).encode(),
        headers={'Content-Type': 'application/json'}, method='POST')
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            if not json.load(response).get('ok'):
                raise RuntimeError('Telegram rejeitou o aviso.')
    except Exception:
        # HTTP exceptions may contain the token in the URL.
        raise RuntimeError('Falha ao enviar aviso ao Telegram.') from None


async def inspect(page, service):
    response = await page.goto(f'https://prenotami.esteri.it/Services/Booking/{service}',
                               wait_until='domcontentloaded', timeout=60000)
    await page.wait_for_timeout(2500)
    text = await page.locator('body').inner_text()
    fields = set(await page.locator('input, select').evaluate_all(
        "els => els.map(e => e.tagName === 'SELECT' ? 'select' : e.type)"))
    return classify(page.url, response.status if response else 0, text, fields)


async def main(args):
    from playwright.async_api import async_playwright
    os.umask(0o077)
    DATA.mkdir(parents=True, exist_ok=True, mode=0o700)
    session = DATA / 'session.json'
    if args.login:
        async with async_playwright() as p:
            # Dedicated profile: never open or copy the user's personal browser profile.
            context = await p.chromium.launch_persistent_context(
                str(DATA / 'login-profile'), headless=False,
                channel='chrome' if args.chrome else None)
            try:
                page = await context.new_page()
                await page.goto('https://prenotami.esteri.it/')
                await asyncio.to_thread(input, 'Faça login no navegador. Só depois de ver sua conta, volte aqui e pressione Enter: ')
                await page.goto('https://prenotami.esteri.it/Services', wait_until='domcontentloaded')
                await page.wait_for_timeout(2000)
                authenticated = await page.locator(
                    'a[href*="/Services/Booking/"], a[href*="Logout"], a[href*="LogOff"], a[href*="logout"]'
                ).count()
                if (urlparse(page.url).hostname != 'prenotami.esteri.it'
                        or await page.locator('input[type=password]').count()
                        or not authenticated):
                    raise RuntimeError('Login não confirmado. A janela deve mostrar sua conta antes de pressionar Enter. Sessão não foi salva.')
                save_json(session, await context.storage_state(indexed_db=True))
            finally:
                await context.close()
        print('Sessão salva. Trate data/session.json como uma senha.')
        return
    if not session.exists():
        raise RuntimeError('Sessão ausente. Execute python monitor.py --login em um computador com interface gráfica.')
    if not args.dry_run and (not os.environ.get('TELEGRAM_BOT_TOKEN') or not os.environ.get('TELEGRAM_CHAT_ID')):
        raise RuntimeError('Configure as variáveis do Telegram antes de iniciar.')
    state_path = DATA / 'state.json'
    state = json.loads(state_path.read_text()) if state_path.exists() else {}
    interval = max(300, int(os.environ.get('CHECK_INTERVAL_SECONDS', '600')))
    backoff = interval
    async with async_playwright() as p:
        browser = await p.chromium.launch(channel='chrome' if args.chrome else None)
        context = await browser.new_context(storage_state=str(session))
        page = await context.new_page()
        try:
            while True:
                results = {}
                for service, name in SERVICES.items():
                    try:
                        result = await inspect(page, service)
                    except Exception:
                        result = 'error'
                    results[service] = result
                    print(f'{time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())} {name}: {result}', flush=True)
                    if not args.dry_run and state.get(service) != result:
                        messages = {
                            'form_available': f'{name}: formulário acessível. Isso NÃO confirma vaga no calendário. https://prenotami.esteri.it/Services/Booking/{service}',
                            'login_required': f'{name}: sessão expirada/login necessário. Renove a sessão e reinicie o monitor.',
                            'blocked': f'{name}: consulta bloqueada/limitada; pode precisar de intervenção no navegador.',
                            'error': f'{name}: falha na consulta; disponibilidade desconhecida.',
                            'unknown': f'{name}: página não reconhecida; disponibilidade desconhecida.',
                        }
                        if result in messages:
                            try:
                                await asyncio.to_thread(notify, messages[result])
                            except RuntimeError:
                                print('Falha no Telegram; aviso será tentado na próxima consulta.', flush=True)
                                continue
                        state[service] = result
                        save_json(state_path, state)
                    if result in ('login_required', 'blocked'):
                        break
                    if service != list(SERVICES)[-1]:
                        await asyncio.sleep(5)
                save_json(session, await context.storage_state())
                if args.once:
                    break
                problem = any(s in ('blocked', 'error', 'unknown', 'login_required') for s in results.values())
                backoff = min(3600, backoff * 2) if problem else interval
                await asyncio.sleep(backoff + random.uniform(0, 30))
        finally:
            await browser.close()


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--login', action='store_true')
    parser.add_argument('--chrome', action='store_true', help='Usa o Google Chrome instalado no computador')
    parser.add_argument('--once', action='store_true')
    parser.add_argument('--dry-run', action='store_true', help='Sem avisos nem alterações no estado de notificações')
    args = parser.parse_args()
    try:
        asyncio.run(main(args))
    except (RuntimeError, ValueError) as error:
        parser.exit(1, f'{error}\n')
