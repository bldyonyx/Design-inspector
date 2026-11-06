import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../public/background.js', import.meta.url), 'utf8');
const url = 'chrome-extension://test/index.html';

function browser() {
  const windows = new Map();
  const errors = [];
  let nextId = 1;
  let creates = 0;
  let focused;
  let click;
  let failCreate = false;
  let update, remove, message;
  let sessionFails = false;
  const session = {};
  const defaultTab = { id: 90, windowId: 80, url: 'https://example.com/' };
  const chrome = {
    storage: { session: {
      get: async key => { if (sessionFails) throw Error('Unavailable'); return { [key]: session[key] }; },
      set: async values => Object.assign(session, values),
      remove: async key => { if (sessionFails) throw Error('Unavailable'); delete session[key]; },
    } },
    tabs: {
      onUpdated: { addListener: listener => { update = listener; } },
      onRemoved: { addListener: listener => { remove = listener; } },
    },
    runtime: {
      id: 'test',
      onMessage: { addListener: listener => { message = listener; } },
      getURL: () => url,
      getContexts: async (filter) => {
        assert.equal(filter.documentUrls[0], url);
        return [...windows.values()].map(window => ({ windowId: window.id }));
      },
    },
    action: { onClicked: { addListener: listener => { click = listener; } } },
    windows: {
      get: async id => {
        if (!windows.has(id)) throw new Error('Window closed');
        return windows.get(id);
      },
      update: async (id, options) => {
        if (!windows.has(id)) throw new Error('Window closed');
        Object.assign(windows.get(id), options);
        focused = id;
      },
      create: async options => {
        if (failCreate) throw new Error('Creation failed');
        assert.equal(options.url, url);
        assert.equal(options.type, 'popup');
        const window = { ...options, id: nextId++ };
        windows.set(window.id, window);
        creates++;
        return window;
      },
    },
  };
  const restart = () => vm.runInNewContext(source, { chrome, URL, console: { error: (...args) => errors.push(args) } });
  restart();
  return {
    windows, errors, restart,
    click: (tab = defaultTab) => click(tab),
    session,
    getTarget: (sender = { id: 'test', url, frameId: 0 }) => new Promise(resolve => message({ type: 'designInspector.fontTarget.get' }, sender, resolve)),
    set sessionFails(value) { sessionFails = value; },
    update: async (id, change) => { update(id, change); await new Promise(resolve => setImmediate(resolve)); },
    closeTab: async id => { remove(id); await new Promise(resolve => setImmediate(resolve)); },
    get creates() { return creates; },
    get focused() { return focused; },
    set failCreate(value) { failCreate = value; },
  };
}

test('creates once, focuses, restores minimized window, and reopens after close', async () => {
  const b = browser();
  await Promise.all([b.click(), b.click(), b.click()]);
  assert.equal(b.creates, 1);
  b.windows.get(1).state = 'minimized';
  await b.click();
  assert.equal(b.focused, 1);
  assert.equal(b.windows.get(1).state, 'normal');
  assert.equal(b.creates, 1);
  b.windows.clear();
  await b.click();
  assert.equal(b.creates, 2);
});

test('rediscovers window after service worker restart without local storage', async () => {
  const b = browser();
  await b.click();
  b.restart();
  await b.click();
  assert.equal(b.creates, 1);
  assert.equal(b.focused, 1);
});

test('handles failed creation and permits a later retry', async () => {
  const b = browser();
  b.failCreate = true;
  await b.click();
  assert.equal(b.errors.length, 1);
  b.failCreate = false;
  await b.click();
  assert.equal(b.creates, 1);
});


test('captures the clicked tab across windows and worker restarts, never inspector focus', async () => {
  const b = browser(); const key = 'designInspector.fontTarget.session.v1';
  await b.click({ id: 12, windowId: 1, url: 'https://one.example/' });
  assert.equal(b.session[key].id, 12);
  b.restart(); assert.equal(b.session[key].id, 12);
  await b.click({ id: 24, windowId: 2, url: 'https://two.example/' });
  assert.equal(b.session[key].id, 24); assert.equal(b.session[key].windowId, 2);
  assert.equal(b.creates, 1);
});

test('invalidates on target navigation/close, ignores unrelated tabs, clears invalid toolbar clicks', async () => {
  const b = browser(); const key = 'designInspector.fontTarget.session.v1';
  await b.click(); await b.update(999, { status: 'loading' }); assert.ok(b.session[key]);
  await b.update(90, { status: 'loading' }); assert.equal((await b.getTarget()).code, 'TARGET_NAVIGATED');
  await b.update(90, { url: 'https://other.example/' }); assert.equal((await b.getTarget()).code, 'TARGET_NAVIGATED_ORIGIN');
  await b.click(); await b.closeTab(90); assert.equal((await b.getTarget()).code, 'TARGET_CLOSED');
  await b.click(); await b.click({}); assert.equal(b.session[key], undefined);
});


test('target messages wait for pending capture, reject page senders, and fail closed on session errors', async () => {
  const b = browser();
  const clicked = b.click({ id: 24, windowId: 2, url: 'https://two.example/' });
  const response = await b.getTarget(); await clicked;
  assert.equal(response.ok, true); assert.equal(response.target.id, 24);
  assert.equal((await b.getTarget({ id: 'test', url: 'https://two.example/', frameId: 0 })).ok, false);
  b.sessionFails = true; await b.click();
  assert.equal((await b.getTarget()).ok, false);
  assert.equal(b.creates, 1); // Color UI still opens/focuses when session targeting fails.
});
