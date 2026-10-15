const labels = {form_available: 'Formulário acessível (vaga não confirmada)',
  unavailable: 'Mensagem de indisponibilidade', login_required: 'Login necessário',
  blocked: 'Proteção do site', unknown: 'Página não reconhecida'};
async function render() {
  const {enabled, checking, pauseReason, results = {}} = await chrome.storage.local.get(null);
  document.querySelector('#state').textContent = enabled ? (checking ? 'Consultando…' : 'Ativo — intervalo de 10 minutos') : 'Pausado';
  document.querySelector('#reason').textContent = pauseReason || '';
  const list = document.querySelector('#results');
  list.replaceChildren();
  for (const [id, name] of Object.entries({'4705': 'Passaporto', '5967': 'CIE'})) {
    const li = document.createElement('li');
    li.textContent = results[id] ? `${name}: ${labels[results[id].status] || 'Erro'} — ${new Date(results[id].time).toLocaleString()}` : `${name}: ainda não consultado`;
    list.append(li);
  }
}
for (const action of ['start', 'pause', 'test']) {
  document.getElementById(action).addEventListener('click', async () => {
    try {
      const response = await chrome.runtime.sendMessage({action});
      document.querySelector('#error').textContent = response?.ok ? (action === 'test' ? 'Aviso enviado ao Chrome. Se não apareceu, confira as notificações do macOS.' : '') : 'Não foi possível executar. Tente novamente.';
      await render();
    } catch {document.querySelector('#error').textContent = 'Falha na extensão. Abra novamente este painel.';}
  });
}
chrome.storage.onChanged.addListener(render);
render();
