# Monitor Prenot@mi

Monitora se os formulários de Passaporto (4705) e CIE (5967) estão acessíveis.
**Formulário acessível não significa vaga disponível.** Não preenche dados,
não anexa documentos e não confirma reservas.

## Preparação e login

Python 3.12+ em um computador com interface gráfica:

```sh
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python -m playwright install chromium
.venv/bin/python monitor.py --login
```

Faça login no navegador aberto e pressione Enter no terminal após concluir.
O arquivo `data/session.json` contém credenciais de sessão: não envie no chat,
não adicione ao Git e transfira ao servidor apenas por canal seguro (SSH/SCP).
Se expirar, repita o login, substitua o arquivo no servidor e reinicie o monitor.
Login automático fica para uma etapa futura; não há desvio de CAPTCHA/Cloudflare.

## Telegram e teste real

Crie um bot pelo BotFather no Telegram, abra o chat privado com ele e envie `/start`.
Configure o token e o identificador do seu chat privado em `.env` (copie `.env.example`).
Não publique esses valores. O monitor apenas envia ao chat configurado;
não escuta comandos de outros usuários.

```sh
set -a
. ./.env
set +a
.venv/bin/python monitor.py --once --dry-run
.venv/bin/python monitor.py --once
```

Sem dry-run, estados de atenção e formulário acessível disparam aviso ao mudar.
Falhas de envio não são marcadas como entregues. O estado persiste em
`data/state.json` para evitar duplicatas. `unknown` exige investigar o texto real
da página; HTTP 200 não é tratado como vaga. Os detectores ainda precisam ser
validados numa sessão autenticada real. Os logs não incluem o conteúdo da página.

## Servidor 24 horas com Docker Compose

Use um servidor Linux com Docker/Compose, saída HTTPS para `prenotami.esteri.it`
e `api.telegram.org`, `.env` configurado e `data/session.json` transferido.
O usuário do container precisa de permissão para ler e escrever `data/`;
ajuste o proprietário para o UID de `pwuser` da imagem, sem tornar o diretório público.

```sh
docker compose build
docker compose run --rm monitor python monitor.py --once --dry-run
docker compose up -d
docker compose logs --tail=50
```

Consulta sequencial dos dois serviços a cada 10 minutos, com mínimo de 5 minutos,
pequena variação e espera progressiva de até 1 hora em falhas/bloqueios.
Esses intervalos são uma configuração inicial, não limites oficialmente aprovados
pelo site. Observe as regras do serviço e interrompa se houver restrição.
Não garante aviso instantâneo. O servidor precisa permanecer ligado; este ambiente
de desenvolvimento não é, por si só, uma hospedagem permanente.

## Testes

```sh
.venv/bin/python -m unittest discover -s tests -v
```

## Segunda etapa (não implementada)

Preencher formulários e anexar documentos para consultar o calendário, após validar
o fluxo real, consentimentos e comportamento da proteção. Avisar sobre dias/horários
livres será um resultado diferente de detectar o formulário acessível.
