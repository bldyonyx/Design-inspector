import test from 'node:test';
import assert from 'node:assert/strict';
import { startSelection, cancelSelection, checkSelection, selectionResult } from '../src/font/selectionSession.ts';
import { startPageSelection } from '../src/font/pageSelection.ts';
const fonts = { fontFamily: 'Georgia', fontSize: '23px', fontWeight: '700', lineHeight: '31px', letterSpacing: '1px' };
function browser() {
  const target = { id: 12, windowId: 2, url: 'https://example.com/', token: 'first' };
  const state = { target, closed: false, denied: false, calls: [], sent: [] };
  const api = {
    runtime: { id: 'test', sendMessage: async () => ({ ok: true, target: state.target }) },
    tabs: { get: async () => { if (state.closed) throw Error('No tab with id: 12'); return { ...target, status: 'complete' }; },
      sendMessage: async (id, message, options) => { state.sent.push({ id, message, options }); return { ok: true }; } },
    scripting: { executeScript: async options => { if (state.denied) throw Error('Denied'); state.calls.push(options); return [{ frameId: 0, result: { started: options.args[0].sessionId } }]; } },
  };
  return { target, state, api };
}

test('activation uses the captured target, fixed controller and session identifier', async () => {
  const b = browser();
  const session = await startSelection(b.api, 'session-one');
  assert.equal(session.target.id, 12); assert.equal(b.state.calls[0].func, startPageSelection);
  assert.deepEqual(b.state.calls[0].target, { tabId: 12, frameIds: [0] });
  assert.equal(b.state.calls[0].world, 'ISOLATED'); assert.equal(b.state.calls[0].args[0].url, b.target.url);
  await checkSelection(b.api, session);
  assert.equal(b.state.sent[0].message.type, 'designInspector.fontSelection.heartbeat');
  await cancelSelection(b.api, session);
  assert.equal(b.state.sent[1].message.type, 'designInspector.fontSelection.cancel');
});

test('closed, restricted, changed and permission-denied targets fail without fallback', async () => {
  const b = browser(); b.state.closed = true; await assert.rejects(startSelection(b.api, 'one'), /closed/);
  const c = browser(); c.target.url = 'chrome://settings'; await assert.rejects(startSelection(c.api, 'one'), /cannot be inspected/);
  const d = browser(); d.state.denied = true; await assert.rejects(startSelection(d.api, 'one'), error => error.code === 'INJECTION_FAILED');
  const e = browser(); const session = await startSelection(e.api, 'one'); e.state.target = { ...e.target, token: 'new' };
  await assert.rejects(checkSelection(e.api, session), /target page navigated/);
});

test('validated completion and cancellation require matching extension, tab, frame, URL and session', () => {
  const b = browser(), session = { id: 'one', target: b.target };
  const sender = { id: 'test', tab: { id: 12 }, frameId: 0, url: b.target.url };
  const message = { type: 'designInspector.fontSelection.result', sessionId: 'one', pageUrl: b.target.url, status: 'selected', fonts };
  assert.deepEqual(selectionResult(message, sender, session, 'test'), { status: 'selected', fonts });
  for (const changes of [{ id: 'other' }, { tab: { id: 99 } }, { frameId: 1 }, { url: 'https://other.example/' }]) {
    assert.equal(selectionResult(message, { ...sender, ...changes }, session, 'test'), null);
  }
  assert.equal(selectionResult({ ...message, sessionId: 'old' }, sender, session, 'test'), null);
  assert.equal(selectionResult({ ...message, status: 'unknown' }, sender, session, 'test'), null);
  assert.throws(() => selectionResult({ ...message, fonts: {} }, sender, session, 'test'));
  assert.deepEqual(selectionResult({ ...message, status: 'cancelled' }, sender, session, 'test'), { status: 'cancelled' });
});


test('cancellation before target resolution completes prevents injection', async () => {
  const b = browser();
  await assert.rejects(startSelection(b.api, 'cancelled', () => false), /cancelled before activation/);
  assert.equal(b.state.calls.length, 0);
});

test('selection transports extended typography and rejects malformed new fields', () => {
 const b = browser();
 const session = {id:'one', target:b.target};
 const sender = {id:'test',tab:{id:b.target.id},frameId:0,url:b.target.url};
 const extended = {...fonts, fontStyle:'italic', fontStretch:'100%', fontVariationSettings:'normal', fontFeatureSettings:'"liga" 0', fontOpticalSizing:'none'};
 const message = {type:'designInspector.fontSelection.result',sessionId:'one',status:'selected',pageUrl:b.target.url,fonts:extended};
 assert.deepEqual(selectionResult(message,sender,session,'test'), {status:'selected',fonts:extended});
 assert.throws(()=>selectionResult({...message,fonts:{...extended,fontStyle:'inherit; color:red'}},sender,session,'test'));
});
