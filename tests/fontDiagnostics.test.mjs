import test from 'node:test';
import assert from 'node:assert/strict';
import { browserFontError, diagnoseFontError } from '../src/font/errors.ts';
import { readTarget, verifyTarget } from '../src/font/targetTab.ts';
import { startSelection, checkSelection } from '../src/font/selectionSession.ts';
const target = { id: 12, windowId: 2, url: 'https://example.com/a', token: 'first' };
function browser() {
  const state = { response: { ok: true, target }, result: { started: 'one' }, injected: 0, cancelled: 0, injectionError: null, heartbeatError: null };
  const api = {
    runtime: { sendMessage: async () => state.response },
    tabs: { get: async () => ({ ...target, status: 'complete' }), sendMessage: async (id, message) => {
      if (message.type.endsWith('.cancel')) state.cancelled++;
      if (state.heartbeatError) throw state.heartbeatError;
      return { ok: true };
    } },
    scripting: { executeScript: async () => { state.injected++; if (state.injectionError) throw state.injectionError; return [{ frameId: 0, result: state.result }]; } },
  };
  return { state, api };
}
const code = expected => error => error.code === expected;

test('no target, background transport failure, invalidation reason and restricted pages remain distinct', async () => {
  const b = browser(); b.state.response = { ok: true, target: null }; await assert.rejects(readTarget(b.api), code('NO_TARGET'));
  b.api.runtime.sendMessage = async () => { throw Error('Could not establish connection.'); };
  await assert.rejects(readTarget(b.api), code('BACKGROUND_MESSAGE_FAILED'));
  for (const reason of ['TARGET_CLOSED','TARGET_NAVIGATED','TARGET_NAVIGATED_ORIGIN']) {
    const c = browser(); c.state.response = { ok: false, code: reason }; await assert.rejects(readTarget(c.api), code(reason));
  }
  const c = browser(); c.state.response = { ok: true, target: { ...target, url: 'opera://settings/' } };
  await assert.rejects(readTarget(c.api), code('RESTRICTED_PAGE'));
});

test('same-origin and cross-origin navigation, loading, moved and missing tabs are classified without guessing', async () => {
  for (const [changes, expected] of [[{url:'https://example.com/b'},'TARGET_NAVIGATED'],[{url:'https://elsewhere.example/'},'TARGET_NAVIGATED_ORIGIN'],[{status:'loading'},'TARGET_LOADING'],[{windowId:9},'TARGET_MOVED'],[{url:undefined},'TARGET_UNAVAILABLE']]) {
    const b = browser(); b.api.tabs.get = async () => ({ ...target, ...changes }); await assert.rejects(verifyTarget(b.api,target),code(expected));
  }
  const b = browser(); b.api.tabs.get = async () => { throw Error('No tab with id: 12'); }; await assert.rejects(verifyTarget(b.api,target),code('TARGET_CLOSED'));
});

test('only recognized browser permission evidence is classified as permission failure; URLs are redacted', () => {
  const fault = browserFontError(Error('Cannot access contents of url "https://private.example/token?secret=1". Extension manifest must request permission to access this host.'),'injection','INJECTION_FAILED');
  assert.equal(fault.code,'PERMISSION_UNAVAILABLE'); assert.doesNotMatch(fault.message,/private|secret/); assert.doesNotMatch(fault.diagnostic,/private|secret/);
  assert.equal(browserFontError(Error('Internal renderer failure'),'injection','INJECTION_FAILED').code,'INJECTION_FAILED');
  assert.equal(browserFontError(Error('The extensions gallery cannot be scripted.'),'injection','INJECTION_FAILED').code,'RESTRICTED_PAGE');
  assert.equal(diagnoseFontError(new TypeError('Unexpected'),'activation').code,'INTERNAL_ERROR');
});

test('injection and initialization failures always attempt cleanup and permit successful retry', async () => {
  const b = browser(); b.state.injectionError = Error('Renderer failure');
  await assert.rejects(startSelection(b.api,'one'),code('INJECTION_FAILED')); assert.equal(b.state.cancelled,1);
  b.state.injectionError = null; b.state.result = { failure: { code:'CONTROLLER_INIT_FAILED',stage:'shadow-root' } };
  await assert.rejects(startSelection(b.api,'one'),error=>error.code==='CONTROLLER_INIT_FAILED'&&error.stage==='shadow-root'); assert.equal(b.state.cancelled,2);
  b.state.result = undefined; await assert.rejects(startSelection(b.api,'one'),code('CONTROLLER_INIT_FAILED')); assert.equal(b.state.cancelled,3);
  b.state.result = { started:'one' }; assert.equal((await startSelection(b.api,'one')).id,'one');
});

test('controller heartbeat failure is not mislabeled as expired activeTab permission', async () => {
  const b = browser(); b.state.heartbeatError = Error('Could not establish connection. Receiving end does not exist.');
  await assert.rejects(checkSelection(b.api,{id:'one',target}),code('CONTROLLER_LOST'));
});


test('activation failure is announced before cancellation cleanup can mask its cause', async () => {
  const b = browser(); b.state.result = undefined; const order = [];
  b.api.tabs.sendMessage = async () => { order.push('cleanup'); return { ok:true }; };
  await assert.rejects(startSelection(b.api,'one',undefined,()=>order.push('failure')),code('CONTROLLER_INIT_FAILED'));
  assert.deepEqual(order,['failure','cleanup']);
});
