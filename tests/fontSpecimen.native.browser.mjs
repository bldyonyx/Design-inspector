// Isolated Chrome :9223. Build the separate experiment first. No extension API mocks.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { renderSpecimen } from '../src/font/renderSpecimen.ts';
const production = process.argv.includes('--production');
const selectLabel = production ? 'Inspect a font' : 'Select typography';
const renderLabel = production ? 'Preview with page fonts' : 'Render comparison';
const canvasCount = production ? 1 : 2;
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
const wait = (ms = 200) => new Promise(resolve => setTimeout(resolve, ms));
const font = await readFile('node_modules/@fontsource/cormorant-garamond/files/cormorant-garamond-latin-500-normal.woff2');
const italicFont = await readFile('node_modules/@fontsource/cormorant-garamond/files/cormorant-garamond-latin-500-italic.woff2');
const variable = await readFile('/usr/share/fonts/truetype/ubuntu/UbuntuSansMono[wght].ttf').catch(()=>null);
const requests = [];
const server = createServer((request,response)=>{
  requests.push(request.url); response.setHeader('Cache-Control','no-store');
  if(request.url.endsWith('.woff2')) {response.setHeader('Content-Type','font/woff2');response.end(request.url==='/italic.woff2'?italicFont:font);return;}
  if(request.url.endsWith('.ttf')) {response.setHeader('Content-Type','font/ttf');response.end(variable);return;}
  response.setHeader('Content-Type','text/html');
  response.setHeader('Content-Security-Policy',"default-src 'none'; style-src 'unsafe-inline'; font-src 'self'; script-src 'none'");
  const subset=request.url==='/subset';
  const family=request.url==='/system'?'serif':request.url==='/missing'?'"NoSuchFixtureFamily", serif':
    request.url==='/variable'?'"FixtureVariable", serif':request.url==='/stack'?'"NoSuchFixtureFamily", "FixtureWeb", serif':'"FixtureWeb", serif';
  const faces=subset?'@font-face{font-family:FixtureWeb;src:url(/subset-a.woff2);unicode-range:U+0041;font-weight:100 900}@font-face{font-family:FixtureWeb;src:url(/subset-b.woff2);unicode-range:U+0042-007A;font-weight:100 900}':
    '@font-face{font-family:FixtureWeb;src:url(/fixture.woff2);font-weight:100 900;font-style:normal}@font-face{font-family:FixtureWeb;src:url(/italic.woff2);font-weight:100 900;font-style:italic}@font-face{font-family:FixtureVariable;src:url(/variable.ttf);font-weight:100 900}';
  response.end('<!doctype html><style>'+faces+'h1{font: '+(request.url==='/italic-bold'?'italic 700':'500')+' 48px '+family+';font-stretch:87.5%;letter-spacing:1px}</style><h1>A</h1>');
});
await new Promise(resolve=>server.listen(4182,'127.0.0.1',resolve));
let browser, extensionId; const created=[];
try {
  const version=await(await fetch('http://127.0.0.1:9223/json/version')).json();console.log('Browser:',version.Browser);
  browser=await connect(version.webSocketDebuggerUrl);
  ({id:extensionId}=await browser.send('Extensions.loadUnpacked',{path:production ? process.cwd()+'/dist' : process.env.DESIGN_INSPECTOR_SPECIMEN_DIST || '/tmp/design-inspector-font-preview'}));
  const pages=async()=>await(await fetch('http://127.0.0.1:9223/json')).json();
  const evaluate=async(connection,expression)=>{
    const result=await connection.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
    if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));return result.result.value;
  };
  const click=async(ui,label)=>{await evaluate(ui,"[...document.querySelectorAll('button')].find(b=>b.textContent==="+JSON.stringify(label)+").click()");await wait();};
  const until=async(connection,expression)=>{for(let i=0;i<50;i++){if(await evaluate(connection,expression))return;await wait(100);}throw Error('Timed out: '+expression);};
  // Only hashes cross the test-control channel; no raster is logged/persisted.
  const digest="async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('')";
  const hashes=ui=>evaluate(ui,"Promise.all([...document.querySelectorAll('canvas')].map(c=>("+digest+")(c.getContext('2d').getImageData(0,0,c.width,c.height).data)))");
  const cases=['/system','/custom','/missing','/stack','/italic-bold',...(variable?['/variable']:[]),'/subset'];
  for(const path of cases){
    const url='http://127.0.0.1:4182'+path;
    const {targetId}=await browser.send('Target.createTarget',{url});created.push(targetId);await wait(300);
    const page=await connect((await pages()).find(p=>p.type==='page'&&p.url===url).webSocketDebuggerUrl);
    await evaluate(page,'document.fonts.ready.then(()=>true)');
    const tabs=await browser.send('Target.getTargets',{filter:[{type:'tab',exclude:false}]});
    await browser.send('Extensions.triggerAction',{id:extensionId,targetId:tabs.targetInfos.find(t=>t.url===url).targetId});await wait(300);
    const ui=await connect((await pages()).find(p=>p.url==='chrome-extension://'+extensionId+'/index.html').webSocketDebuggerUrl);
    if(production) {await evaluate(ui,"document.getElementById('tab-fonts').click()");await wait();}
    await click(ui,selectLabel);await until(ui,"document.body.textContent.includes('Inspection active')");
    await evaluate(page,"document.querySelector('h1').dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true}))");
    await until(ui,"document.querySelector('.font-details')!==null");
    const geometryExpression="[document.querySelectorAll('*').length,document.querySelector('h1').getBoundingClientRect().width,document.querySelector('h1').getBoundingClientRect().height]";
    const geometry=await evaluate(page,geometryExpression);const before=requests.length;
    assert.equal(await evaluate(ui,"document.querySelectorAll('canvas').length"),0,'No automatic raster');
    const fonts=await evaluate(page,"(()=>{const s=getComputedStyle(document.querySelector('h1'));return Object.fromEntries(['fontFamily','fontSize','fontWeight','fontStyle','fontStretch','lineHeight','letterSpacing','fontVariationSettings','fontFeatureSettings','fontOpticalSizing'].map(k=>[k,s[k]]))})()");
    await click(ui,renderLabel);await until(ui,"document.querySelectorAll('canvas').length==="+canvasCount);
    const initialHashes=await hashes(ui);
    const pageHash=initialHashes[0];
    const extensionHash=production ? await evaluate(ui,"(async()=>{const r=("+renderSpecimen.toString()+")({requestId:'control',pageUrl:location.href,fonts:"+JSON.stringify(fonts)+"});return ("+digest+")(Uint8Array.from(atob(r.pixels),c=>c.charCodeAt(0)))})()") : initialHashes[1];
    assert.equal(await evaluate(ui,"[...document.querySelectorAll('canvas')].every(c=>c.width===480&&c.height===144)"),true);
    assert.deepEqual(await evaluate(page,geometryExpression),geometry);
    assert.equal(await evaluate(page,"document.querySelectorAll('canvas,[data-design-inspector-font]').length"),0);
    await wait(300);
    const extra=requests.slice(before).filter(p=>p.endsWith('.woff2')||p.endsWith('.ttf'));
    if(path==='/subset'){
      assert.ok(extra.includes('/subset-b.woff2'),'Fixed strings should demonstrate a new subset request');
      await evaluate(page,'document.fonts.ready.then(()=>true)');
      if(production)await click(ui,'Use approximate preview');
      await click(ui,renderLabel);await until(ui,"document.querySelectorAll('canvas').length==="+canvasCount);
    } else {
      assert.equal(extra.length,0);
      if(path==='/system'||path==='/missing')assert.equal(pageHash,extensionHash,'System/fallback controls agree');
      else assert.notEqual(pageHash,extensionHash,'Page font differs from extension fallback');
    }
    const finalHashes=await hashes(ui);
    if(path==='/subset')assert.notEqual(finalHashes[0],pageHash,'Raster changes after the newly requested subset loads');
    const control=await evaluate(page,"(async()=>{const r=("+renderSpecimen.toString()+")({requestId:'control',pageUrl:location.href,fonts:"+JSON.stringify(fonts)+"});if(r.status!=='ok')throw Error(r.code);return ("+digest+")(Uint8Array.from(atob(r.pixels),c=>c.charCodeAt(0)))})()");
    assert.equal(finalHashes[0],control,'Isolated-world agrees with same-document main-world canvas');
    if(path==='/variable'){
      await evaluate(page,"document.querySelector('h1').style.fontWeight='800'");
      await click(ui,selectLabel);await until(ui,"document.body.textContent.includes('Inspection active')");
      await evaluate(page,"document.querySelector('h1').dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true}))");
      await until(ui,"document.querySelector('.font-details')!==null");await click(ui,renderLabel);await until(ui,"document.querySelectorAll('canvas').length==="+canvasCount);
      assert.notEqual((await hashes(ui))[0],finalHashes[0],'Variable weight changes raster');
    }
    if(production){
      await click(ui,'Use approximate preview');
      await evaluate(ui,"(()=>{const b=[...document.querySelectorAll('button')];b.find(e=>e.textContent==='Preview with page fonts').click();document.querySelector('.inspector-action').click()})()");
      await until(ui,"document.body.textContent.includes('Inspection active')");
      await click(ui,'Cancel font inspection');
    } else {
      await evaluate(ui,"(()=>{const b=[...document.querySelectorAll('button')];b.find(e=>e.textContent==='Render comparison').click();b.find(e=>e.textContent==='Cancel experiment').click()})()");
    }
    await wait(400);assert.equal(await evaluate(ui,"document.querySelectorAll('canvas').length"),0);
    console.log('PASS native '+(production?'production':'experiment')+' specimen:',path,JSON.stringify({pageEqualsExtension:pageHash===extensionHash,extraFontRequests:extra.length}));
  }
  if(!variable)console.log('SKIP optional local variable-font fixture.');
  console.log('PASS isolated-world raster transfer, main-world agreement, cancellation, no page layout changes.');
} finally {
  if(browser){
    if(extensionId)await browser.send('Extensions.uninstall',{id:extensionId}).catch(()=>{});
    for(const targetId of created)await browser.send('Target.closeTarget',{targetId}).catch(()=>{});
  }
  for(const c of connections)c.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
}
