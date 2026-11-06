// Same isolated Chrome (9222) and production preview (4173) setup as other browser tests.
import assert from 'node:assert/strict';
const targets = await (await fetch('http://127.0.0.1:9222/json')).json();
const ws = new WebSocket(targets.find(target => target.type === 'page').webSocketDebuggerUrl);
await new Promise(resolve => { ws.onopen = resolve; });
let id = 0;
const pending = new Map();
ws.onmessage = event => { const message = JSON.parse(event.data); if (message.id) { pending.get(message.id)(message.result); pending.delete(message.id); } };
const send = (method, params = {}) => new Promise(resolve => { pending.set(++id, resolve); ws.send(JSON.stringify({ id, method, params })); });
const evaluate = async expression => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result.value;
await send('Page.enable');
const injection = await send('Page.addScriptToEvaluateOnNewDocument', { source: `
window.fontTarget={id:123,windowId:50,url:'http://127.0.0.1:4173/font-fixture',token:'first'};
window.chrome={runtime:{sendMessage:async()=>({ok:true,target:window.fontTarget})},
 storage:{local:{get:async()=>({}),set:async()=>{throw Error('Unexpected write')}}},
 tabs:{get:async id=>{if(window.closedTarget)throw Error('No tab with id: 123');return {...window.fontTarget,id,status:'complete'}}},
 scripting:{executeScript:async options=>{
   window.fontCalls=(window.fontCalls||0)+1;
   if(options.target.tabId!==123)throw Error('Wrong target');
   if(window.denyInjection)throw Error('Permission denied');
   if(window.invalidFont)return [{frameId:0,result:{pageUrl:fontTarget.url,fonts:{}}}];
   const frame=document.getElementById('font-fixture');
   const result=frame.contentWindow.eval('('+options.func.toString()+')()');
   return [{frameId:0,result}];
 }}};
` });
await send('Page.navigate', { url: 'http://127.0.0.1:4173/' });
await new Promise(resolve => setTimeout(resolve, 500));
await evaluate(`(async()=>{
 const frame=document.createElement('iframe');frame.id='font-fixture';frame.style.cssText='position:fixed;left:-10000px;top:0;width:500px;height:300px';
 await new Promise(resolve=>{frame.onload=resolve;frame.src='/font-fixture';document.body.append(frame)});
 frame.contentDocument.body.innerHTML='<form><h1>Excluded form text</h1><input value="never read"></form><p contenteditable="true">Excluded editable</p><h1 style="font-family: Georgia, serif; font-size: 23px; font-weight: 700; line-height: 31px; letter-spacing: 1.5px">Fixture heading</h1>';
})()`);
// The off-screen fixture has its own layout viewport; the injected function reads only its computed properties.
await evaluate("document.getElementById('tab-fonts').click()");
const wait = () => new Promise(resolve => setTimeout(resolve, 80));
await wait();
await evaluate("document.querySelector('.font-development').open=true;document.querySelector('.font-test button').click()");await wait();
assert.deepEqual(await evaluate("[...document.querySelectorAll('.font-test-results dd')].map(element=>element.textContent)"), ['Georgia, serif','23px','700','31px','1.5px']);
assert.equal(await evaluate('fontCalls'), 1);
await evaluate("denyInjection=true;document.querySelector('.font-test button').click()");await wait();
assert.match(await evaluate("document.querySelector('.font-test [role=status]').textContent"), /browser reports that page access/);
assert.equal(await evaluate("document.querySelector('.font-test-results')"), null);
await evaluate("denyInjection=false;invalidFont=true;document.querySelector('.font-test button').click()");await wait();
assert.match(await evaluate("document.querySelector('.font-test [role=status]').textContent"), /incomplete/);
await evaluate("invalidFont=false;closedTarget=true;document.querySelector('.font-test button').click()");await wait();
assert.match(await evaluate("document.querySelector('.font-test [role=status]').textContent"), /closed/);
for (const width of [280,320,380,500,650,800]) {
 await send('Emulation.setDeviceMetricsOverride', { width, height:300, deviceScaleFactor:1, mobile:false });
 assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'), true);
}
await evaluate('scrollTo(0,document.documentElement.scrollHeight)');assert.ok(await evaluate('scrollY>0'));
console.log('PASS: bundled injection function executes standalone against real fixture DOM; form/editable skipped; computed properties reach React; permission/invalid/closed errors; widths 280–800 and scrolling. Chrome grant/messaging/scripting mocked.');
await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: injection.identifier });
ws.close();
