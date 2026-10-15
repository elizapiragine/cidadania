import {classify} from './classify.mjs';

const SERVICES = {'4705': 'Passaporto', '5967': 'CIE'};
const INTERVAL = 10;
let busy = false;
const urlFor = id => `https://prenotami.esteri.it/Services/Booking/${id}`;

async function tell(id, message) {
  await chrome.notifications.create(id, {
    type: 'basic', iconUrl: 'icon.png', title: 'Monitor Prenotami', message
  });
}

async function stop(reason) {
  await chrome.storage.local.set({enabled: false, pauseReason: reason, checking: false});
  await chrome.alarms.clear('check');
  await chrome.action.setBadgeText({text: '!'});
  await chrome.action.setBadgeBackgroundColor({color: '#b45309'});
  await tell('attention', reason);
}

async function monitorTab() {
  const {tabId} = await chrome.storage.local.get('tabId');
  if (tabId) {
    try {
      const tab = await chrome.tabs.get(tabId);
      const host = new URL(tab.url || tab.pendingUrl).hostname;
      // Do not overwrite a tab the user has repurposed.
      if (['prenotami.esteri.it', 'iam.esteri.it', 'validate.perfdrive.com'].includes(host)) return tabId;
    } catch { /* Closed or repurposed tab: create a dedicated one. */ }
  }
  const tab = await chrome.tabs.create({url: 'about:blank', active: false});
  await chrome.storage.local.set({tabId: tab.id});
  return tab.id;
}

function navigate(tabId, url) {
  return new Promise((resolve, reject) => {
    let timer;
    const cleanup = () => {
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(listener);
    };
    const listener = (id, change) => {
      if (id === tabId && change.status === 'complete') {
        cleanup();
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
    timer = setTimeout(() => {cleanup(); reject(new Error('timeout'));}, 20000);
    chrome.tabs.update(tabId, {url}).catch(error => {cleanup(); reject(error);});
  });
}

async function check() {
  if (busy) return;
  const {enabled} = await chrome.storage.local.get('enabled');
  if (!enabled) return;
  busy = true;
  await chrome.storage.local.set({checking: true});
  try {
    const tabId = await monitorTab();
    for (const [id, name] of Object.entries(SERVICES)) {
      if (!(await chrome.storage.local.get('enabled')).enabled) break;
      await navigate(tabId, urlFor(id));
      // Let document scripts render messages before reading the page.
      await new Promise(resolve => setTimeout(resolve, 2000));
      const [result] = await chrome.scripting.executeScript({
        target: {tabId},
        func: () => ({url: location.href, text: document.body.innerText,
          fields: [...document.querySelectorAll('input,select')].map(e =>
            e.tagName === 'SELECT' ? 'select' : e.type)})
      });
      if (!(await chrome.storage.local.get('enabled')).enabled) break;
      const status = classify(result.result, id);
      const {results = {}} = await chrome.storage.local.get('results');
      const previous = results[id]?.status;
      // Store only the classification/time. No HTML, URLs, cookies or personal fields.
      results[id] = {status, time: Date.now()};
      if (status === 'form_available' && previous !== status) {
        await tell(`service-${id}`, `${name}: formulário acessível! Isso não confirma vaga no calendário.`);
      }
      await chrome.storage.local.set({results});
      if (['blocked', 'login_required', 'unknown'].includes(status)) {
        const reasons = {
          blocked: 'Consulta pausada: proteção do site. Abra a aba do monitor e resolva manualmente antes de retomar.',
          login_required: 'Consulta pausada: login necessário. Entre pela aba do monitor e depois clique em Iniciar / retomar.',
          unknown: 'Consulta pausada: página não reconhecida. Verifique a aba do monitor; isso não significa ausência de vagas.'
        };
        await stop(reasons[status]);
        break;
      }
    }
  } catch {
    await stop('Consulta pausada: falha de conexão ou leitura. Verifique a aba do monitor e retome quando resolvido.');
  } finally {
    busy = false;
    await chrome.storage.local.set({checking: false});
  }
}

chrome.alarms.onAlarm.addListener(alarm => {if (alarm.name === 'check') check();});
chrome.runtime.onStartup.addListener(async () => {
  if ((await chrome.storage.local.get('enabled')).enabled) {
    await chrome.alarms.create('check', {delayInMinutes: 1, periodInMinutes: INTERVAL});
  }
});
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (sender.id !== chrome.runtime.id) return;
  (async () => {
    if (message.action === 'start') {
      await chrome.storage.local.set({enabled: true, pauseReason: ''});
      await chrome.action.setBadgeText({text: 'ON'});
      await chrome.action.setBadgeBackgroundColor({color: '#166534'});
      await chrome.alarms.create('check', {delayInMinutes: INTERVAL, periodInMinutes: INTERVAL});
      check();
    } else if (message.action === 'pause') {
      await chrome.storage.local.set({enabled: false, checking: false, pauseReason: 'Pausado por você.'});
      await chrome.alarms.clear('check');
      await chrome.action.setBadgeText({text: ''});
    } else if (message.action === 'test') {
      await tell('test', 'Avisos funcionando! Este é um teste, não uma disponibilidade.');
    }
    reply({ok: true});
  })().catch(() => reply({ok: false}));
  return true;
});
chrome.notifications.onClicked.addListener(async id => {
  const {tabId} = await chrome.storage.local.get('tabId');
  if (id.startsWith('service-')) {
    const service = id.slice('service-'.length);
    if (SERVICES[service]) await chrome.tabs.create({url: urlFor(service)});
  } else if (tabId) {
    try {await chrome.tabs.update(tabId, {active: true});} catch { /* tab was closed */ }
  }
});
