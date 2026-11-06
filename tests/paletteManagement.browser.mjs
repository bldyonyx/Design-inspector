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

await evaluate("document.querySelector('#view-all-collections').click()");await wait();
assert.match(await evaluate("document.querySelector('.archive-empty').textContent"),/No palettes saved yet/);
await evaluate("document.querySelector('.history-view button').click()");await wait();
await evaluate(`localStorage.setItem('${paletteKey}',JSON.stringify(Array.from({length:300},(_,i)=>({id:'p'+i,name:'Palette '+i,colors:['#ABCDEF','#123456'],createdAt:1,updatedAt:i+1}))))`);
await send('Page.reload');await new Promise(r=>setTimeout(r,300));
assert.equal(await evaluate("document.querySelectorAll('.popup-footer .palette-preview').length"),3);
await pick('#FFFFFF');const historySnapshot=await evaluate(`localStorage.getItem('${historyKey}')`);
await evaluate("document.querySelector('.palette-picker > button').click()");await wait();
assert.equal(await evaluate("document.querySelector('.palette-picker select')"),null);
assert.ok(await evaluate("document.querySelector('.palette-options').scrollHeight>document.querySelector('.palette-options').clientHeight"));
await fill('.palette-picker input[type=search]','PALETTE 299');
assert.equal(await evaluate("document.querySelectorAll('.palette-option').length"),1);
const beforeSelect=await evaluate('storageWrites');
await send('Page.bringToFront');await evaluate("document.querySelector('.palette-option').focus()");
await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
await send('Input.dispatchKeyEvent',{type:'char',text:'\r',key:'Enter',windowsVirtualKeyCode:13});
await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});await wait();
assert.equal(await evaluate("document.querySelector('.palette-option').getAttribute('aria-pressed')"),'true');
assert.equal(await evaluate('storageWrites'),beforeSelect);
await evaluate("document.querySelector('.palette-picker .palette-primary').click()");await wait();
assert.match(await evaluate("document.querySelector('.palette-picker').textContent"),/Added to Palette 299/);
await fill('.palette-picker input[type=search]','no-matches');assert.match(await evaluate("document.querySelector('.palette-picker').textContent"),/No matching palettes/);
await evaluate("document.querySelector('#view-all-collections').click()");await wait();
assert.equal(await evaluate("document.querySelectorAll('.palette-preview').length"),300);
await fill('.history-view input[type=search]','pAlEtTe 299');
assert.equal(await evaluate("document.querySelectorAll('.palette-preview').length"),1);
await evaluate("document.querySelector('.palette-preview').click()");await wait();
const clickText=async text=>{await evaluate(`[...document.querySelectorAll('button')].find(e=>e.textContent===${JSON.stringify(text)}).click()`);await wait();};
await clickText('Rename palette');assert.equal(await evaluate("document.querySelector('.palette-create input').value"),'Palette 299');
await fill('.palette-create input','   ');await submit('.palette-create');
assert.equal(await evaluate("document.querySelector('.palette-create input').getAttribute('aria-invalid')"),'true');
await clickText('Cancel rename');assert.equal(await evaluate('document.activeElement.textContent'),'Rename palette');
await clickText('Rename palette');await fill('.palette-create input','  Renamed palette  ');await evaluate('failWrite=true');await submit('.palette-create');
assert.equal(await evaluate("document.querySelector('#palette-heading').textContent"),'Palette 299');
await evaluate('failWrite=false');await submit('.palette-create');assert.equal(await evaluate("document.querySelector('#palette-heading').textContent"),'Renamed palette');
await evaluate("document.querySelector('[aria-label=\"Copy HEX #ABCDEF\"]').click()");await wait();assert.equal(await evaluate('copied'),'#ABCDEF');assert.ok(await evaluate("!!document.querySelector('#palette-heading')"));
await evaluate("document.querySelector('[aria-label=\"Remove color #ABCDEF\"]').click()");await wait();
assert.equal(await evaluate("document.querySelectorAll('.palette-color-row').length"),2);
await evaluate("[...document.querySelectorAll('button')].find(e=>e.textContent.startsWith('Undo removal')).click()");await wait();
assert.equal(await evaluate("document.querySelectorAll('.palette-color-row').length"),3);
assert.equal(await evaluate(`localStorage.getItem('${historyKey}')`),historySnapshot);
await evaluate("document.querySelector('[aria-label=\"Inspect color #123456\"] .history-hex').click()");await wait();
assert.equal(await evaluate("document.querySelector('[aria-selected=true]').id"),'tab-colors');
assert.equal(await evaluate("document.querySelector('.color-value-row dd').textContent"),'#123456');
assert.equal(await evaluate("document.querySelector('.color-summary').getAttribute('aria-expanded')"),'true');
assert.equal(await evaluate(`localStorage.getItem('${historyKey}')`),historySnapshot);
await evaluate("document.querySelector('#view-all-collections').click()");await wait();await fill('.history-view input[type=search]','renamed');await evaluate("document.querySelector('.palette-preview').click()");await wait();
const beforeDelete=await evaluate(`localStorage.getItem('${paletteKey}')`);
await clickText('Delete palette');assert.equal(await evaluate('document.activeElement.textContent'),'Cancel deletion');assert.equal(await evaluate(`localStorage.getItem('${paletteKey}')`),beforeDelete);
await clickText('Cancel deletion');assert.equal(await evaluate('document.activeElement.textContent'),'Delete palette');
await clickText('Delete palette');await evaluate('failWrite=true');await clickText('Yes, delete palette');assert.ok(await evaluate("!!document.querySelector('#palette-heading')"));
assert.equal(await evaluate(`localStorage.getItem('${paletteKey}')`),beforeDelete);
await evaluate('failWrite=false');await clickText('Yes, delete palette');assert.ok(await evaluate("!!document.querySelector('#collections-page-heading')"));
assert.equal(await evaluate("document.querySelectorAll('.palette-preview').length"),299);
assert.equal(await evaluate(`localStorage.getItem('${historyKey}')`),historySnapshot);
await fill('.history-view input[type=search]','missing');assert.match(await evaluate("document.querySelector('.archive-empty').textContent"),/No matching palettes/);
await fill('.history-view input[type=search]','');
for(const width of [280,320,380,500,650,800]){await send('Emulation.setDeviceMetricsOverride',{width,height:300,deviceScaleFactor:1,mobile:false});assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);}
await evaluate('scrollTo(0,document.documentElement.scrollHeight)');assert.ok(await evaluate('scrollY>0'));
await clickText('Back to inspector');assert.equal(await evaluate("document.querySelector('.color-value-row dd').textContent"),'#123456');
await send('Page.reload');await new Promise(r=>setTimeout(r,300));assert.equal(await evaluate("document.querySelectorAll('.popup-footer .palette-preview').length"),3);
assert.equal(JSON.parse(await evaluate(`localStorage.getItem('${paletteKey}')`)).length,299);
console.log('PASS: 300-palette search/compact preview, bounded keyboard picker with explicit add, rename validation/cancel/failure/commit, remove/Undo, Copy isolation, inspect navigation without history writes, delete confirmation/cancel/failure/commit, reload, collections empty-search, 280–800px and natural scrolling. APIs mocked.');
await send('Page.removeScriptToEvaluateOnNewDocument',{identifier:injection.identifier});await evaluate(`localStorage.removeItem('${historyKey}');localStorage.removeItem('${paletteKey}')`);ws.close();
