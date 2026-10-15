# Monitor Prenot@mi

Monitora se os formulários de Passaporto (4705) e CIE (5967) estão acessíveis.
**Formulário acessível não significa vaga disponível.** Não preenche dados,
não anexa documentos e não confirma reservas.

## Opção recomendada para testar no Mac: extensão do Chrome

Usa a sessão do seu Chrome normal, sem exportar cookies ou abrir o navegador do
Playwright. Não precisa de Python nem Telegram. A versão inicial envia avisos pelo
Chrome/macOS. Não há garantia de que o site permitirá essas consultas; se houver
restrição, a extensão pausa e pede intervenção, sem contornar a proteção.

1. Baixe este repositório em **Code → Download ZIP** e descompacte.
2. No Chrome em que você já está logada no Prenotami, abra `chrome://extensions`.
3. Ative **Modo do desenvolvedor** no canto superior direito.
4. Clique em **Carregar sem compactação** (ou **Load unpacked**).
5. Selecione a pasta **extension**, dentro de `cidadania-main` (não o ZIP nem a pasta raiz).
6. No ícone de quebra-cabeça do Chrome, fixe **Prenotami — alertas de formulário**.
7. Abra a extensão e clique em **Testar aviso no Mac**. Se necessário, permita
   notificações do Google Chrome nos Ajustes do Sistema → Notificações e confira
   o modo Foco/Não Perturbe.
8. Clique em **Iniciar / retomar**. Uma aba dedicada será criada; deixe-a aberta.

A primeira consulta ocorre ao iniciar; as próximas, a cada 10 minutos, sequencialmente
para os dois serviços. O Chrome precisa estar aberto e o Mac acordado/conectado.
Fechar o popup não para o monitor. Para parar, use **Pausar**. Consultas que já estão
carregando podem terminar, mas não geram novos avisos após a pausa.

Ao detectar login, bloqueio, erro de leitura ou página desconhecida, pausa as próximas
consultas e avisa. Resolva manualmente na aba dedicada e só então retome pela extensão.
Não use essa aba para outras tarefas. Se você fechá-la com o monitor ativo, uma nova
será criada na próxima consulta. Ao reiniciar o Chrome, um monitor anteriormente ativo
volta a consultar após cerca de um minuto; pausas por bloqueio permanecem pausadas.

Um aviso de formulário é enviado na primeira detecção e quando o estado muda para
formulário acessível. Formulário continuamente acessível não dispara avisos repetidos.
Os textos de indisponibilidade e seletores precisam de validação nas páginas reais.
O painel mostra o resultado e o horário de cada serviço; um resultado antigo não é
evidência de disponibilidade atual.

Privacidade: sem senha, token, extração de cookies ou envio de dados a terceiros.
A leitura acontece somente nos três domínios declarados no manifesto, na aba do
monitor. O corpo da página é classificado em memória; apenas estado e horário são
persistidos localmente. O acesso a IAM e à página de proteção permite identificar
quando parar. A extensão não preenche nem envia formulários. Não promete detecção
instantânea, execução 24h ou vagas no calendário. Permissões são limitadas ao fluxo.

Testes da extensão (Node.js): `node --test tests/extension/*.test.mjs`.

## Alternativa Python (login automatizado ainda bloqueado no teste real)

O teste no Mac identificou uma página de proteção seguida de HTTP 404 no serviço
de identidade. Os passos abaixo são para desenvolvimento/diagnóstico e não representam
um fluxo autenticado confirmado. Prefira testar a extensão acima.

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

Se o login funcionar no seu navegador habitual mas falhar no Chromium do monitor,
experimente o Google Chrome instalado no computador:

```sh
.venv/bin/python monitor.py --login --chrome
```

Esse modo usa um perfil exclusivo em `data/login-profile`, sem acessar seu perfil
pessoal. Aguarde sua conta abrir antes de pressionar Enter no terminal. Use também
`--chrome` nas consultas locais se optar por esse navegador. É uma alternativa para
diagnóstico; ainda precisa de validação no Mac e não contorna proteções do site.

Se o login normal funcionar, mas o monitor terminar em “Not Found”, execute uma
única tentativa de diagnóstico:

```sh
.venv/bin/python monitor.py --diagnose-login --chrome
```

Complete o CAPTCHA manualmente se solicitado. Ao ver o resultado (conta ou erro),
volte ao terminal e pressione Enter, mantendo a janela aberta até esse momento.
Compartilhe somente as linhas `[diagnostico]`. Esse modo registra apenas códigos
HTTP de navegações da janela e rótulos de domínio/caminho permitidos; omite parâmetros,
fragmentos, caminhos desconhecidos e URLs embutidas. Não registra formulários,
senhas, cookies, corpos de resposta ou screenshots, nem exporta a sessão. O perfil
local `data/login-profile` ainda pode armazenar cookies: mantenha-o privado.
Não repita tentativas quando o serviço continuar bloqueando o acesso.

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
