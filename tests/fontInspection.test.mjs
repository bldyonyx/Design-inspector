import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectFont } from '../src/font/inspectFont.ts';
import { inspectPageFont } from '../src/font/inspectPageFont.ts';
import { validateFontResult } from '../src/font/types.ts';
const fonts = { fontFamily: 'Arial, sans-serif', fontSize: '16px', fontWeight: '400', lineHeight: '24px', letterSpacing: 'normal' };
function browser() {
  let target = { id: 12, windowId: 2, url: 'https://example.com/article', token: 'first' };
  let tab = { ...target, status: 'complete' };
  const state = { target, tab, calls: [], result: { pageUrl: target.url, fonts }, fail: false, closed: false, navigate: false, retarget: false };
  const api = {
    runtime: { sendMessage: async message => { assert.equal(message.type, 'designInspector.fontTarget.get'); return { ok: true, target: state.target }; } },
    tabs: { get: async id => { assert.equal(id, 12); if (state.closed) throw Error('No tab with id: 12'); return state.tab; } },
    scripting: { executeScript: async injection => {
      state.calls.push(injection); if (state.fail) throw Error('Permission denied');
      if (state.navigate) state.tab = { ...state.tab, url: 'https://elsewhere.example/' };
      if (state.retarget) state.target = { ...state.target, token: 'second' };
      return [{ frameId: 0, result: state.result }];
    } },
  };
  return { state, api };
}

test('targets captured tab ID and returns validated properties via one fixed isolated main-frame function', async () => {
  const { state, api } = browser();
  assert.deepEqual(await inspectFont(api), { fonts, source: 'example.com' });
  assert.equal(state.calls.length, 1);
  assert.deepEqual(state.calls[0].target, { tabId: 12, frameIds: [0] });
  assert.equal(state.calls[0].world, 'ISOLATED'); assert.equal(state.calls[0].func, inspectPageFont);
});

test('missing/closed tabs and revoked permissions fail safely without guessing another tab', async () => {
  const { state, api } = browser(); state.target = null;
  await assert.rejects(inspectFont(api), /No target tab/); assert.equal(state.calls.length, 0);
  const b = browser(); b.state.closed = true; await assert.rejects(inspectFont(b.api), /closed/);
  const c = browser(); c.state.tab.url = undefined; await assert.rejects(inspectFont(c.api), /URL is unavailable/);
  const d = browser(); d.state.fail = true; await assert.rejects(inspectFont(d.api), /browser reports that page access/);
});

test('rejects browser/extension pages, wrong windows and loading/navigation races', async () => {
  for (const url of ['chrome://settings/', 'opera://settings/', 'chrome-extension://id/index.html', 'file:///tmp/a.html']) {
    const b = browser(); b.state.target.url = url; await assert.rejects(inspectFont(b.api), /cannot be inspected/); assert.equal(b.state.calls.length, 0);
  }
  const b = browser(); b.state.tab.windowId = 99; await assert.rejects(inspectFont(b.api), /moved/);
  const c = browser(); c.state.tab.status = 'loading'; await assert.rejects(inspectFont(c.api), /still loading/);
  const d = browser(); d.state.navigate = true; await assert.rejects(inspectFont(d.api), /another origin/);
  const e = browser(); e.state.retarget = true; await assert.rejects(inspectFont(e.api), /target changed/);
});

test('invalid/incomplete results and pages without suitable text are not displayed as success', async () => {
  for (const result of [undefined, {}, { pageUrl: 'https://other.example/', fonts }, { pageUrl: 'https://example.com/article', fonts: {} }]) {
    const b = browser(); b.state.result = result; await assert.rejects(inspectFont(b.api));
  }
  const b = browser(); b.state.result = null; await assert.rejects(inspectFont(b.api), /No suitable/);
  for (const result of [null, {}, { ...fonts, fontSize: 16 }, { ...fonts, fontSize: 'bad' }, { ...fonts, fontFamily: 'x'.repeat(513) }]) assert.throws(() => validateFontResult(result));
  assert.deepEqual(validateFontResult({ ...fonts, ignored: 'not returned' }), fonts);
  assert.equal(validateFontResult({ ...fonts, fontWeight: '425.5' }).fontWeight, '425.5');
});


test('unavailable messaging and malformed targets do not inject anything', async () => {
  for (const target of [{}, { id: -1, windowId: 2, url: 'https://example.com/', token: 'x' }, { id: 12, windowId: 2, url: 'invalid', token: 'x' }]) {
    const b = browser(); b.state.target = target; await assert.rejects(inspectFont(b.api)); assert.equal(b.state.calls.length, 0);
  }
  const b = browser(); b.api.runtime.sendMessage = async () => { throw Error('Worker unavailable'); };
  await assert.rejects(inspectFont(b.api), /background worker/); assert.equal(b.state.calls.length, 0);
});
