// Native MV3 integration. Requires isolated Chrome :9223 launched with
// --remote-debugging-port=9223 --enable-unsafe-extension-debugging and npm run build.
// No Chrome extension APIs are mocked. Do not point this at a personal profile.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
const connections = [];
async function connect(url) {
  const ws = new WebSocket(url); connections.push(ws);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  let id = 0; const waiting = new Map();
  ws.onmessage = event => {
    const message = JSON.parse(event.data); const pending = waiting.get(message.id);
    if (!pending) return;
    waiting.delete(message.id); clearTimeout(pending.timer);
    if (message.error) pending.reject(Error(JSON.stringify(message.error))); else pending.resolve(message.result);
  };
  return { send: (method, params = {}) => new Promise((resolve, reject) => {
    const request = ++id;
    const timer = setTimeout(() => { waiting.delete(request); reject(Error(`CDP timeout: ${method}`)); }, 10000);
    waiting.set(request, { resolve, reject, timer }); ws.send(JSON.stringify({ id: request, method, params }));
  }) };
}
const wait = (ms = 150) => new Promise(resolve => setTimeout(resolve, ms));
const server = createServer((request, response) => {
  const xml = request.url === '/xhtml';
  response.setHeader('Content-Type', xml ? 'application/xhtml+xml' : 'text/html');
  if (request.url === '/csp') response.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'none'; style-src 'none'; require-trusted-types-for 'script'");
  response.end(xml ? '<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Font fixture</title></head><body><h1>Heading</h1></body></html>' : '<!doctype html><title>Font fixture</title><h1>Heading <span>nested text</span></h1><p>Paragraph</p>');
});
await new Promise(resolve => server.listen(4181, '127.0.0.1', resolve));
try {
  const version = await (await fetch('http://127.0.0.1:9223/json/version')).json();
  const browser = await connect(version.webSocketDebuggerUrl);
  const { id } = await browser.send('Extensions.loadUnpacked', { path: resolve('dist') });
  const pages = async () => (await (await fetch('http://127.0.0.1:9223/json')).json());
  const evaluate = async (connection, expression) => {
    const result = await connection.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  async function toolbar(url) {
    const targets = await browser.send('Target.getTargets', { filter: [{ type: 'tab', exclude: false }] });
    const tab = targets.targetInfos.find(target => target.url === url); assert.ok(tab, `Target missing: ${url}`);
    await browser.send('Extensions.triggerAction', { id, targetId: tab.targetId }); await wait(400);
    const ui = await connect((await pages()).find(page => page.url === `chrome-extension://${id}/index.html`).webSocketDebuggerUrl);
    await evaluate(ui, "document.getElementById('tab-fonts').click()"); await wait(); return ui;
  }
  async function activate(ui) {
    await evaluate(ui, "document.querySelector('.inspector-action').click()"); await wait(400);
    return evaluate(ui, "document.querySelector('.inspector-panel').textContent");
  }
  for (const path of ['/html', '/csp', '/xhtml']) {
    const url = `http://127.0.0.1:4181${path}`;
    await browser.send('Target.createTarget', { url }); await wait(400);
    const ui = await toolbar(url);
    assert.match(await activate(ui), /Inspection active/);
    await evaluate(ui, "[...document.querySelectorAll('button')].find(button=>button.textContent==='Cancel font inspection').click()"); await wait();
    const page = await connect((await pages()).find(page => page.type === 'page' && page.url === url).webSocketDebuggerUrl);
    assert.equal(await evaluate(page, "document.querySelectorAll('[data-design-inspector-font]').length"), 0);
    if (path === '/html') {
      await page.send('Page.navigate', { url: `${url}?navigation=1` }); await wait(400);
      assert.match(await activate(ui), /target page navigated/);
      const next = await toolbar(`${url}?navigation=1`); assert.match(await activate(next), /Inspection active/);
      await evaluate(next, "[...document.querySelectorAll('button')].find(button=>button.textContent==='Cancel font inspection').click()"); await wait();
    }
    console.log(`PASS native activation and cancellation: ${path}`);
  }
  console.log('PASS native same-origin navigation diagnosis and toolbar recapture/retry. Real MV3 grants, injection, messaging, background, and independent window.');
} finally {
  for (const connection of connections) connection.close();
  server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
}
