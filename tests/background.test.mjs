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
  const chrome = {
    runtime: {
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
  const restart = () => vm.runInNewContext(source, { chrome, console: { error: (...args) => errors.push(args) } });
  restart();
  return {
    windows, errors, restart,
    click: () => click(),
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

test('rediscovers window after service worker restart without storage', async () => {
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
