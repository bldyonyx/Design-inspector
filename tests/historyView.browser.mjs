// Optional integration test. Requires Node 24+, a production preview at
// http://127.0.0.1:4173 and an isolated headless Chrome at debugging port 9222.
// Storage and native APIs are mocked; no extension/user data is touched.
import assert from 'node:assert/strict';
const targets=await (await fetch('http://127.0.0.1:9222/json')).json();
const ws=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl); await new Promise(r=>ws.onopen=r);
let id=0; const pending=new Map();ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){pending.get(m.id)(m.result);pending.delete(m.id)}};
const send=(method,params={})=>new Promise(r=>{pending.set(++id,r);ws.send(JSON.stringify({id,method,params}))});
const evaluate=async expression=>(await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true})).result.value;

await send('Page.enable');
const injection = await send('Page.addScriptToEvaluateOnNewDocument',{source: `
window.testOpens=0;window.storageWrites=0;
window.EyeDropper=class {open(){window.testOpens++;return new Promise((resolve,reject)=>{window.resolvePick=resolve;window.rejectPick=reject;});}};
Object.defineProperty(window,'chrome',{configurable:true,value:{storage:{local:{
 get:async key=>{if(window.failRead)throw Error('Read failed');return {[key]:JSON.parse(localStorage.getItem(key)||'[]')};},
 set:async items=>{window.storageWrites++;if(window.failWrite)throw Error('Write failed');for(const [key,value] of Object.entries(items))localStorage.setItem(key,JSON.stringify(value));}
}}}});
Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async value=>{window.copied=value;}}});
`});
await send('Page.navigate',{url:'http://127.0.0.1:4173/'});await new Promise(r=>setTimeout(r,500));
const wait=()=>new Promise(r=>setTimeout(r,40));


const key='designInspector.colorHistory.v1';
await evaluate(`localStorage.removeItem('${key}')`);
await send('Page.reload');await new Promise(r=>setTimeout(r,300));
async function pick(hex){await evaluate("document.querySelector('.inspector-action').click()");await wait();await evaluate(`resolvePick({sRGBHex:'${hex}'})`);await wait();}

await evaluate(`localStorage.setItem('${key}',JSON.stringify(Array.from({length:6},(_,i)=>({hex:'#'+(i+1).toString(16).padStart(6,'0'),capturedAt:100-i}))))`);
await send('Page.reload');await new Promise(r=>setTimeout(r,300));
await pick('#ABCDEF');
assert.equal(await evaluate("document.querySelectorAll('.history-swatch').length"),5);
await evaluate("document.querySelector('#view-all-colors').click()");await wait();
assert.equal(await evaluate("document.querySelectorAll('.history-row').length"),7);
assert.equal(await evaluate('document.activeElement.id'),'history-heading');
assert.equal(await evaluate('storageWrites'),1);
await evaluate(`document.querySelector('[aria-label="Copy HEX #ABCDEF"]').click()`);await wait();
assert.equal(await evaluate('copied'),'#ABCDEF');

assert.ok(await evaluate("!!document.querySelector('.history-view')")); // Copy stays in history.
const selectionSnapshot=await evaluate(`localStorage.getItem('${key}')`);
const selectionWrites=await evaluate('storageWrites');
await evaluate(`document.querySelector('[aria-label="Inspect color #000001"] .color-swatch').click()`);await wait();
assert.equal(await evaluate("document.querySelector('[aria-selected=true]').id"),'tab-colors');
assert.equal(await evaluate("document.querySelector('.color-value-row dd').textContent"),'#000001');
assert.equal(await evaluate("document.querySelector('.color-summary').getAttribute('aria-expanded')"),'true');
assert.ok(await evaluate("document.querySelector('.color-name-copy').textContent.includes('CLOSEST COLOR NAME')"));
assert.equal(await evaluate("document.activeElement.classList.contains('color-summary')"),true);
await evaluate("document.querySelector('.color-summary').click();document.querySelector('#view-all-colors').click()");await wait();
await evaluate(`document.querySelector('[aria-label="Inspect color #000001"] .history-hex').click()`);await wait();
assert.equal(await evaluate("document.querySelector('.color-summary').getAttribute('aria-expanded')"),'true');
await evaluate("document.querySelector('#view-all-colors').click()");await wait();
await send('Page.bringToFront');
await evaluate(`document.querySelector('[aria-label="Inspect color #ABCDEF"]').focus()`);
await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
await send('Input.dispatchKeyEvent',{type:'char',text:'\r',key:'Enter',windowsVirtualKeyCode:13});
await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});await wait();
assert.equal(await evaluate("document.querySelector('.color-value-row dd').textContent"),'#ABCDEF');
assert.equal(await evaluate(`localStorage.getItem('${key}')`),selectionSnapshot);
assert.equal(await evaluate('storageWrites'),selectionWrites);
await evaluate("document.querySelector('#view-all-colors').click()");await wait();
console.log('PASS: swatch/HEX/keyboard inspection, Colors tab, expanded details, focus, same-color reselect, unchanged order/timestamps and zero writes.');
await evaluate(`failWrite=true;document.querySelector('[aria-label="Delete color #ABCDEF"]').click()`);await wait();
assert.equal(await evaluate("document.querySelectorAll('.history-row').length"),7);
assert.match(await evaluate("document.querySelector('.history-view').textContent"),/could not be deleted/);
await evaluate(`failWrite=false;document.querySelector('[aria-label="Delete color #ABCDEF"]').click()`);await wait();
assert.equal(await evaluate("document.querySelectorAll('.history-row').length"),6);
assert.ok(await evaluate("!!document.querySelector('.history-view')")); // Delete stays in history.
await evaluate("[...document.querySelectorAll('button')].find(e=>e.textContent.startsWith('Undo deletion')).click()");await wait();
assert.equal(await evaluate("document.querySelectorAll('.history-row').length"),7);
assert.equal(await evaluate("document.querySelector('.history-row .history-hex').textContent"),'#ABCDEF');
await evaluate("[...document.querySelectorAll('button')].find(e=>e.textContent.includes('Back to inspector')).click()");await wait();
assert.equal(await evaluate("document.querySelector('[aria-selected=true]').id"),'tab-colors');
assert.equal(await evaluate("document.querySelector('.color-value-row dd').textContent"),'#ABCDEF');
assert.equal(await evaluate('document.activeElement.id'),'view-all-colors');
await evaluate("document.querySelector('#view-all-colors').click()");await wait();
for(const width of [280,320,380,500,650,800]){
 await send('Emulation.setDeviceMetricsOverride',{width,height:300,deviceScaleFactor:1,mobile:false});
 assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);
}
await evaluate('scrollTo(0,document.documentElement.scrollHeight)');assert.ok(await evaluate('scrollY>0'));
const before=await evaluate(`localStorage.getItem('${key}')`);
await evaluate("[...document.querySelectorAll('button')].find(e=>e.textContent==='Clear history').click()");await wait();
assert.equal(await evaluate(`localStorage.getItem('${key}')`),before);
assert.equal(await evaluate('document.activeElement.textContent'),'Cancel');
await evaluate("[...document.querySelectorAll('button')].find(e=>e.textContent==='Cancel').click()");await wait();
assert.equal(await evaluate(`localStorage.getItem('${key}')`),before);
assert.equal(await evaluate('document.activeElement.textContent'),'Clear history');
await evaluate("[...document.querySelectorAll('button')].find(e=>e.textContent==='Clear history').click()");await wait();
await evaluate("failWrite=true;[...document.querySelectorAll('button')].find(e=>e.textContent==='Yes, clear history').click()");await wait();
assert.equal(await evaluate("document.querySelectorAll('.history-row').length"),7);
assert.match(await evaluate("document.querySelector('.history-view').textContent"),/could not be cleared/);
await evaluate("failWrite=false;[...document.querySelectorAll('button')].find(e=>e.textContent==='Yes, clear history').click()");await wait();
assert.equal(await evaluate(`localStorage.getItem('${key}')`),'[]');
assert.equal(await evaluate("document.querySelectorAll('.history-row').length"),0);
assert.match(await evaluate("document.querySelector('.archive-empty').textContent"),/Nothing collected yet/);
await evaluate("[...document.querySelectorAll('button')].find(e=>e.textContent.includes('Back to inspector')).click()");await wait();
assert.equal(await evaluate('document.activeElement.id'),'tab-colors');
assert.equal(await evaluate("document.querySelector('.color-value-row dd').textContent"),'#ABCDEF');
assert.equal(await evaluate("document.querySelector('#view-all-colors')"),null);
await send('Page.reload');await new Promise(r=>setTimeout(r,300));
assert.equal(await evaluate("document.querySelectorAll('.history-swatch').length"),0);
console.log('PASS: preview limit, full list, copying, failed/successful deletion, Undo, inspector selection/tab preservation, focus return, clear requires confirmation, cancel, failed/successful clear, empty state, persisted reload, 280–800px overflow, document scroll. Storage and EyeDropper mocked.');
await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: injection.identifier });
await evaluate(`localStorage.removeItem('${key}')`);
ws.close();
