// Optional integration test. Requires Node 24+, a production preview at
// http://127.0.0.1:4173 and an isolated headless Chrome at debugging port 9222.
// Storage and native APIs are mocked; no extension/user data is touched.
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
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
Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async value=>{if(window.failClipboard)throw Error('Denied');window.copied=value;}}});
`});
await send('Page.navigate',{url:'http://127.0.0.1:4173/'});await new Promise(r=>setTimeout(r,500));
const wait=()=>new Promise(r=>setTimeout(r,40));




const historyKey='designInspector.colorHistory.v1', paletteKey='designInspector.savedPalettes.v1';
const palette={id:'export',name:'Crème Brûlée 🎨',colors:['#6A4D5B','#E8D8CB','#B9C89B','#6B4D5B'],createdAt:1,updatedAt:2};
await evaluate(`localStorage.setItem('${paletteKey}',JSON.stringify([${JSON.stringify(palette)},{id:'empty',name:'Empty',colors:[],createdAt:1,updatedAt:1}]));localStorage.setItem('${historyKey}',JSON.stringify([{hex:'#FFFFFF',capturedAt:1}]))`);
await send('Page.reload');await new Promise(r=>setTimeout(r,300));
const paletteBefore=await evaluate(`localStorage.getItem('${paletteKey}')`),historyBefore=await evaluate(`localStorage.getItem('${historyKey}')`);
await evaluate("document.querySelector('[data-palette-id=export]').click()");await wait();
const beforeSize=await evaluate("({width:document.querySelector('.palette-export .palette-primary').offsetWidth,height:document.querySelector('.palette-export .palette-primary').offsetHeight})");
await evaluate("document.querySelector('.palette-export .palette-primary').click()");await wait();
const expected=':root {\n  --dusty-plum-1: #6A4D5B;\n  --warm-linen: #E8D8CB;\n  --sand: #B9C89B;\n  --dusty-plum-2: #6B4D5B;\n}\n';
assert.equal(await evaluate('copied'),expected);
assert.match(await evaluate("document.querySelector('.palette-export .palette-primary').textContent"),/Copied!/);
assert.deepEqual(await evaluate("({width:document.querySelector('.palette-export .palette-primary').offsetWidth,height:document.querySelector('.palette-export .palette-primary').offsetHeight})"),beforeSize);
assert.deepEqual(await evaluate("(()=>{const sheet=new CSSStyleSheet();sheet.replaceSync(copied);const rule=sheet.cssRules[0];return [rule.selectorText,rule.style.getPropertyValue('--dusty-plum-1'),rule.style.length]})()"),[':root','#6A4D5B',4]);
await new Promise(r=>setTimeout(r,2100));assert.match(await evaluate("document.querySelector('.palette-export .palette-primary').textContent"),/Copy CSS/);
await evaluate("failClipboard=true;document.querySelector('.palette-export .palette-primary').click()");await wait();
assert.doesNotMatch(await evaluate("document.querySelector('.palette-export .palette-primary').textContent"),/Copied!/);
assert.match(await evaluate("document.querySelector('.palette-export [role=status]').textContent"),/Could not copy CSS/);
const directory=await mkdtemp('/tmp/design-inspector-exports-');
await send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:directory});
for(const format of ['CSS','JSON']){
 await evaluate(`[...document.querySelectorAll('.palette-export button')].find(e=>e.textContent.trim()==='Download ${format}').click()`);await new Promise(r=>setTimeout(r,500));
 assert.equal(await evaluate("document.querySelector('.palette-export [role=status]').textContent"),`${format} downloaded!`);
 const contents=await readFile(`${directory}/creme-brulee.${format.toLowerCase()}`,'utf8');
 if(format==='CSS')assert.equal(contents,expected);else assert.deepEqual(JSON.parse(contents),{name:palette.name,colors:palette.colors});
}
await evaluate("window.originalCreateObjectURL=URL.createObjectURL;URL.createObjectURL=()=>{throw Error('Unavailable')};[...document.querySelectorAll('.palette-export button')].find(e=>e.textContent.trim()==='Download CSS').click()");await wait();
assert.match(await evaluate("document.querySelector('.palette-export [role=status]').textContent"),/Could not start the download/);
await evaluate('URL.createObjectURL=originalCreateObjectURL');
for(const width of [280,320,380,500,650,800]){await send('Emulation.setDeviceMetricsOverride',{width,height:300,deviceScaleFactor:1,mobile:false});assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);}
await evaluate('scrollTo(0,document.documentElement.scrollHeight)');assert.ok(await evaluate('scrollY>0'));
assert.equal(await evaluate(`localStorage.getItem('${paletteKey}')`),paletteBefore);assert.equal(await evaluate(`localStorage.getItem('${historyKey}')`),historyBefore);assert.equal(await evaluate('storageWrites'),0);
await evaluate("document.querySelector('.history-view > button').click()");await wait();await evaluate("document.querySelector('[data-palette-id=empty]').click()");await wait();
assert.equal(await evaluate("[...document.querySelectorAll('.palette-export button')].every(e=>e.disabled)"),true);assert.match(await evaluate("document.querySelector('.palette-export').textContent"),/Add a color/);
console.log('PASS: exact Copy CSS, valid parsed CSS, confirmation/reset/failure and stable dimensions, real headless Chrome Blob CSS/JSON files with correct contents, download failure feedback, empty controls, no storage writes, 280–800px and document scrolling. Extension storage/clipboard mocked; native download exercised on preview page. Files: '+directory);
await send('Page.removeScriptToEvaluateOnNewDocument',{identifier:injection.identifier});await evaluate(`localStorage.removeItem('${paletteKey}');localStorage.removeItem('${historyKey}')`);ws.close();
