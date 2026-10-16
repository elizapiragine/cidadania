import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

function event() {
  const listeners = new Set();
  return {addListener: f => listeners.add(f), removeListener: f => listeners.delete(f),
    emit: (...args) => [...listeners].map(f => f(...args))};
}

test('start, notifications, deduplication, login pause and manual resume', async () => {
  const state = {};
  const notifications = [];
  const alarms = new Map();
  const tabs = new Map();
  const onUpdated = event();
  let snapshot = 'form';
  globalThis.chrome = {
    storage: {local: {
      get: async key => structuredClone(key ? {[key]: state[key]} : state),
      set: async value => Object.assign(state, structuredClone(value))
    }},
    notifications: {create: async (id, value) => notifications.push({id, ...value}), onClicked: event()},
    alarms: {create: async (id, value) => alarms.set(id, value), clear: async id => alarms.delete(id), onAlarm: event()},
    action: {setBadgeText: async () => {}, setBadgeBackgroundColor: async () => {}},
    tabs: {onUpdated, get: async id => {
      if (!tabs.has(id)) throw Error('closed');
      return tabs.get(id);
    }, create: async ({url}) => {
      const tab = {id: tabs.size + 1, url};
      tabs.set(tab.id, tab);
      return tab;
    }, update: async (id, changes) => {
      const tab = tabs.get(id);
      Object.assign(tab, changes);
      if (changes.url) queueMicrotask(() => onUpdated.emit(id, {status: 'complete'}, tab));
      return tab;
    }},
    scripting: {executeScript: async ({target}) => [{result: {
      url: snapshot === 'login' ? 'https://iam.esteri.it/signin/' : snapshot === 'unavailable' ? 'https://prenotami.esteri.it/Services' : tabs.get(target.tabId).url,
      text: snapshot === 'form' ? 'Prenotazione Singola AVANTI' : snapshot === 'unavailable' ? 'All appointments for this service are currently booked.' : 'Login',
      fields: snapshot === 'form' ? ['select', 'text'] : snapshot === 'unavailable' ? [] : ['password']
    }}]},
    runtime: {id: 'test-extension', onStartup: event(), onMessage: event()}
  };
  const originalTimeout = globalThis.setTimeout;
  globalThis.setTimeout = (fn, ms, ...args) => originalTimeout(fn, ms === 2000 ? 0 : ms, ...args);
  try {
    const source = (await readFile(new URL('../../extension/background.js', import.meta.url), 'utf8'))
      .replace("'./classify.mjs'", JSON.stringify(new URL('../../extension/classify.mjs', import.meta.url).href));
    await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
    const message = action => new Promise(resolve => chrome.runtime.onMessage.emit({action}, {id: chrome.runtime.id}, resolve));
    const done = async () => {
      for (let i = 0; i < 100; i++) {
        await new Promise(resolve => originalTimeout(resolve, 5));
        if (!state.checking) return;
      }
      assert.fail('check did not finish');
    };
    await message('start');
    await done();
    assert.equal(state.results['4705'].status, 'form_available');
    assert.equal(state.results['5967'].status, 'form_available');
    assert.equal(notifications.length, 2);
    assert.equal(alarms.get('check').periodInMinutes, 10);
    chrome.alarms.onAlarm.emit({name: 'check'});
    await done();
    assert.equal(notifications.length, 2, 'unchanged forms must not repeat alerts');
    snapshot = 'login';
    chrome.alarms.onAlarm.emit({name: 'check'});
    await done();
    assert.equal(state.enabled, false);
    assert.equal(alarms.has('check'), false);
    assert.equal(notifications.at(-1).id, 'attention');
    assert.equal(state.results['4705'].status, 'login_required');
    assert.ok(!JSON.stringify(state).includes('Prenotazione'), 'page text must not be stored');
    snapshot = 'form';
    await message('start');
    await done();
    assert.equal(state.enabled, true);
    assert.equal(notifications.length, 4, 'only changed service alerts on resume');
    snapshot = 'unavailable';
    chrome.alarms.onAlarm.emit({name: 'check'});
    await done();
    assert.equal(state.results['4705'].status, 'unavailable');
    assert.equal(state.results['5967'].status, 'unavailable', 'unavailable passport must not stop CIE check');
    assert.equal(state.enabled, true, 'unavailability must not pause monitoring');
    assert.equal(alarms.has('check'), true);
    assert.equal(notifications.length, 4, 'unavailability must not produce an availability alert');
    await message('test');
    assert.equal(notifications.at(-1).id, 'test');
    await message('pause');
    assert.equal(state.enabled, false);
    assert.equal(alarms.has('check'), false);
  } finally {
    globalThis.setTimeout = originalTimeout;
    delete globalThis.chrome;
  }
});
