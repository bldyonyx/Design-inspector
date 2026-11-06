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
 set:async items=>{window.storageWrites++;if(window.failWrite)throw Error('Write failed');if(window.holdWrites)await new Promise(resolve=>window.finishWrite=resolve);for(const [key,value] of Object.entries(items))localStorage.setItem(key,JSON.stringify(value));}
}}}});
Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async value=>{window.copied=value;}}});
`});
await send('Page.navigate',{url:'http://127.0.0.1:4173/'});await new Promise(r=>setTimeout(r,500));
const wait=()=>new Promise(r=>setTimeout(r,40));



const historyKey='designInspector.colorHistory.v1';
const paletteKey='designInspector.savedPalettes.v1';
await evaluate(`localStorage.removeItem('${historyKey}');localStorage.removeItem('${paletteKey}')`);
await send('Page.reload');await new Promise(r=>setTimeout(r,300));
async function fill(selector,value){await evaluate(`Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(document.querySelector(${JSON.stringify(selector)}),${JSON.stringify(value)});document.querySelector(${JSON.stringify(selector)}).dispatchEvent(new Event('input',{bubbles:true}))`);await wait();}
async function submit(selector){await evaluate(`document.querySelector(${JSON.stringify(selector)}).requestSubmit()`);await wait();}
async function pick(hex){await evaluate("document.querySelector('.inspector-action').click()");await wait();await evaluate(`resolvePick({sRGBHex:'${hex}'})`);await wait();}
await pick('#112233');
await evaluate("document.querySelector('.palette-picker > button').click()");await wait();
assert.match(await evaluate("document.querySelector('.palette-empty').textContent"),/No palettes yet/);
assert.equal(await evaluate("document.querySelector('.palette-picker input[type=text]')"),null);
await evaluate("document.querySelector('.palette-empty button').click()");await wait();
assert.equal(await evaluate("document.querySelector('.palette-modes [aria-selected=true]').textContent"),'New palette');
await send('Page.bringToFront');
await send('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowLeft',code:'ArrowLeft',windowsVirtualKeyCode:37});await wait();
assert.equal(await evaluate('document.activeElement.textContent'),'Existing palette');
assert.equal(await evaluate("document.querySelector('.palette-picker input[type=text]')"),null);
await evaluate("document.querySelector('[aria-label=\"Close palette picker\"]').click()");await wait();
assert.equal(await evaluate('document.activeElement.textContent'),'Add to palette');
await evaluate("document.querySelector('.popup-footer .history-text-button').click()");await wait();
assert.equal(await evaluate("document.activeElement.tagName"),'INPUT');
await fill('.popup-footer input','   ');await submit('.popup-footer form');
assert.equal(await evaluate("document.querySelector('.popup-footer input').getAttribute('aria-invalid')"),'true');
assert.equal(await evaluate(`localStorage.getItem('${paletteKey}')`),null);
await fill('.popup-footer input','  Studio  ');await submit('.popup-footer form');
let palettes=JSON.parse(await evaluate(`localStorage.getItem('${paletteKey}')`));
assert.equal(palettes[0].name,'Studio');assert.deepEqual(palettes[0].colors,[]);
const firstId=palettes[0].id;
await pick('#112233');await pick('#C2E798');
const historyBefore=await evaluate(`localStorage.getItem('${historyKey}')`);
await evaluate("document.querySelector('.palette-picker > button').click()");await wait();
assert.equal(await evaluate('document.activeElement.textContent'),'Existing palette');
assert.equal(await evaluate("document.querySelector('.palette-picker input[type=text]')"),null);
await evaluate(`document.querySelector('[data-palette-choice="${firstId}"]').click()`);await wait();
await evaluate("[...document.querySelectorAll('.palette-picker button')].find(e=>e.textContent==='Add color to palette').click()");await wait();
assert.match(await evaluate("document.querySelector('.palette-picker').textContent"),/Added to Studio/);
const writes=await evaluate('storageWrites');
await evaluate("[...document.querySelectorAll('.palette-picker button')].find(e=>e.textContent==='Add color to palette').click()");await wait();
assert.equal(await evaluate('storageWrites'),writes);
assert.match(await evaluate("document.querySelector('.palette-picker').textContent"),/Already saved/);
await evaluate("[...document.querySelectorAll('.palette-modes button')].find(e=>e.textContent==='New palette').click()");await wait();
assert.equal(await evaluate("document.querySelector('.palette-picker select')"),null);
assert.equal(await evaluate("document.querySelector('.palette-picker input[type=text]').placeholder"),'e.g. Sunday morning');
await fill('.palette-picker input','   ');await submit('.palette-picker form');
assert.equal(await evaluate("document.querySelector('.palette-picker input[type=text]').getAttribute('aria-invalid')"),'true');
await fill('.palette-picker input','Second');await evaluate('failWrite=true');await submit('.palette-picker form');
assert.match(await evaluate("document.querySelector('.palette-picker').textContent"),/could not be saved/);
assert.doesNotMatch(await evaluate("document.querySelector('.palette-picker').textContent"),/Added to Second/);
await evaluate('failWrite=false;holdWrites=true');await submit('.palette-picker form');
assert.equal(await evaluate("document.querySelector('.palette-picker .palette-primary').disabled"),true);
assert.ok(await evaluate("[...document.querySelectorAll('.palette-modes button')].every(e=>e.disabled)"));
assert.doesNotMatch(await evaluate("document.querySelector('.palette-picker').textContent"),/Added to Second/);
await evaluate('holdWrites=false;finishWrite()');await wait();
palettes=JSON.parse(await evaluate(`localStorage.getItem('${paletteKey}')`));
assert.equal(palettes.length,2);assert.ok(palettes.every(p=>p.colors[0]==='#C2E798'));
for(const width of [280,320,380,500,650,800]){
 await send('Emulation.setDeviceMetricsOverride',{width,height:600,deviceScaleFactor:1,mobile:false});
 for(const modeLabel of ['Existing palette','New palette']){
  await evaluate(`[...document.querySelectorAll('.palette-modes button')].find(e=>e.textContent===${JSON.stringify(modeLabel)}).click()`);await wait();
  assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);
 }
}
console.log('PASS: separated modes, no-palette fallback, keyboard arrows, pending-state guards, persistence-gated feedback, and both modes at 280–800px.');

await send('Page.bringToFront');
await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await wait();
assert.equal(await evaluate("document.activeElement.textContent"),'Add to palette');
assert.equal(await evaluate("document.querySelector('.palette-picker > button').getAttribute('aria-expanded')"),'false');
await evaluate("document.querySelectorAll('.history-swatch')[1].click()");await wait();
await evaluate("document.querySelector('.palette-picker > button').click()");await wait();
await evaluate(`document.querySelector('[data-palette-choice="${firstId}"]').click()`);await wait();
await evaluate("[...document.querySelectorAll('.palette-picker button')].find(e=>e.textContent==='Add color to palette').click()");await wait();
assert.equal(await evaluate(`localStorage.getItem('${historyKey}')`),historyBefore);
assert.deepEqual(JSON.parse(await evaluate(`localStorage.getItem('${paletteKey}')`)).find(p=>p.id===firstId).colors,['#C2E798','#112233']);
await evaluate("document.querySelector('#tab-fonts').click()");await wait();
await evaluate(`document.querySelector('[data-palette-id="${firstId}"]').click()`);await wait();
assert.equal(await evaluate('document.activeElement.id'),'palette-heading');
assert.deepEqual(await evaluate("[...document.querySelectorAll('.palette-color-row .history-hex')].map(e=>e.textContent)"),['#C2E798','#112233']);
await evaluate("document.querySelector('.history-view button').click()");await wait();
await evaluate("document.querySelector('.history-view button').click()");await wait();
assert.equal(await evaluate("document.querySelector('[aria-selected=true]').id"),'tab-fonts');
assert.equal(await evaluate('document.activeElement.id'),'view-all-collections');
await evaluate("document.querySelector('#tab-colors').click()");await wait();
assert.equal(await evaluate("document.querySelector('.color-value-row dd').textContent"),'#112233');
await evaluate("document.querySelector('.popup-footer .history-text-button').click()");await wait();
await fill('.popup-footer input','Failed');await evaluate('failWrite=true');await submit('.popup-footer form');
assert.equal(JSON.parse(await evaluate(`localStorage.getItem('${paletteKey}')`)).length,2);
assert.match(await evaluate("document.querySelector('.popup-footer').textContent"),/could not be saved/);
assert.doesNotMatch(await evaluate("document.querySelector('.popup-footer').textContent"),/Created Failed/);
await evaluate('failWrite=false');await fill('.popup-footer input','W'.repeat(50));await submit('.popup-footer form');
for(const width of [280,320,380,500,650,800]){
 await send('Emulation.setDeviceMetricsOverride',{width,height:300,deviceScaleFactor:1,mobile:false});
 assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);
}
await evaluate('scrollTo(0,document.documentElement.scrollHeight)');assert.ok(await evaluate('scrollY>0'));
await evaluate("document.querySelector('.palette-preview').click()");await wait();
for(const width of [280,320,380,500,650,800]){
 await send('Emulation.setDeviceMetricsOverride',{width,height:300,deviceScaleFactor:1,mobile:false});
 assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);
}
await send('Page.reload');await new Promise(r=>setTimeout(r,300));
assert.equal(await evaluate("document.querySelectorAll('.palette-preview').length"),3);
await evaluate("document.querySelector('#view-all-colors').click()");await wait();
await evaluate("[...document.querySelectorAll('button')].find(e=>e.textContent==='Clear history').click()");await wait();
await evaluate("[...document.querySelectorAll('button')].find(e=>e.textContent==='Yes, clear history').click()");await wait();
assert.equal(JSON.parse(await evaluate(`localStorage.getItem('${paletteKey}')`)).length,3);
console.log('PASS: empty creation, validation, selected/historical color adding, duplicates, same color in multiple palettes, zero history changes, picker Escape/focus, read-only details, tab/color restoration, failures without success, reload persistence, history clear independence, 280–800px layout, document scrolling. Native APIs mocked.');
await send('Page.removeScriptToEvaluateOnNewDocument',{identifier:injection.identifier});
await evaluate(`localStorage.removeItem('${historyKey}');localStorage.removeItem('${paletteKey}')`);ws.close();
