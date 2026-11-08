// Uses isolated Chrome :9222 + production preview :4173. Transport/grants mocked;
// the actual bundled selection controller runs in a real fixture document.
import assert from 'node:assert/strict';
const targets=await (await fetch('http://127.0.0.1:9222/json')).json();
const ws=new WebSocket(targets.find(target=>target.type==='page').webSocketDebuggerUrl);
await new Promise(resolve=>{ws.onopen=resolve;});let id=0;const pending=new Map();
ws.onmessage=event=>{const message=JSON.parse(event.data);if(message.id){pending.get(message.id)(message.result);pending.delete(message.id);}};
const send=(method,params={})=>new Promise(resolve=>{pending.set(++id,resolve);ws.send(JSON.stringify({id,method,params}));});
const evaluate=async expression=>{const response=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(response.exceptionDetails)throw Error(response.exceptionDetails.text+JSON.stringify(response.exceptionDetails.exception));return response.result.value;};
const wait=(ms=100)=>new Promise(resolve=>setTimeout(resolve,ms));
await send('Page.enable');
const injection=await send('Page.addScriptToEvaluateOnNewDocument',{source:`
window.fontTarget={id:123,windowId:50,url:'http://127.0.0.1:4173/font-fixture',token:'first'};
window.uiListeners=new Set();window.pageListeners=new Set();window.lastSelection=null;window.fontCalls=0;window.previewCalls=0;
window.chrome={runtime:{id:'test',sendMessage:async()=>({ok:true,target:window.fontTarget}),onMessage:{addListener:f=>uiListeners.add(f),removeListener:f=>uiListeners.delete(f)}},
 storage:{local:{get:async()=>({}),set:async()=>{throw Error('Unexpected write')}}},
 tabs:{get:async()=>{if(window.closedTarget)throw Error('No tab with id: 123');return {...fontTarget,status:'complete'}},update:async id=>{window.focusedTarget=id;},sendMessage:async(id,message)=>{
 if(window.dropHeartbeat&&message.type.endsWith('.heartbeat'))return {ok:true};
 let response;for(const listener of pageListeners)listener(message,{id:'test',url:'chrome-extension://test/index.html',frameId:0},value=>response=value);
 if(!response)throw Error('No receiver');return response;
 }},windows:{update:async id=>{window.focusedWindow=id;}},
 scripting:{executeScript:async options=>{fontCalls++;window.lastStart=options.args[0];if(window.holdStart)await new Promise(resolve=>window.finishStart=resolve);if(window.denyInjection)throw Error('Denied');
 const frame=document.getElementById('font-fixture');
 if(options.args[0].requestId){
  previewCalls++;window.previewRequest=options;
  if(window.holdPreview)await new Promise(resolve=>window.releasePreview=resolve);
  if(window.failPreview)throw Error('Unsupported canvas');
  const result=frame.contentWindow.eval('('+options.func.toString()+')('+JSON.stringify(options.args[0])+')');
  if(window.badRaster)result.pixels='not pixels';
  if(window.wrongRequest)result.requestId='old';
  if(window.wrongUrl)result.pageUrl='https://elsewhere.example/';
  return [{frameId:window.wrongFrame?1:0,result}];
 }

 frame.contentWindow.chrome={runtime:{id:'test',getURL:()=> 'chrome-extension://test/index.html',onMessage:{addListener:f=>{if(window.failControllerListener)throw Error('Listener failure');pageListeners.add(f)},removeListener:f=>pageListeners.delete(f)},sendMessage:async message=>{
 window.lastSelection=message;for(const listener of uiListeners)listener(message,{id:'test',tab:{id:123},frameId:0,url:'http://127.0.0.1:4173/font-fixture'});return {};
 }}};
 const result=frame.contentWindow.eval('('+options.func.toString()+')('+JSON.stringify(options.args[0])+')');return [{frameId:0,result:window.dropAck?undefined:result}];
 }}};
`});
await send('Page.navigate',{url:'http://127.0.0.1:4173/'});await wait(500);
await evaluate(`(async()=>{const frame=document.createElement('iframe');frame.id='font-fixture';frame.style.cssText='position:fixed;left:-10000px;top:0;width:600px;height:400px';
await new Promise(resolve=>{frame.onload=resolve;frame.src='/font-fixture';document.body.append(frame)});
const child=frame.contentWindow;const native=child.Element.prototype.attachShadow;child.Element.prototype.attachShadow=function(options){if(parent.failShadow)throw new child.DOMException('Fixture setup failure','NotSupportedError');const shadow=native.call(this,options);child.testShadow=shadow;return shadow;};
child.document.body.innerHTML='<h1 id="heading" style="font-family:Georgia,serif;font-size:23px;font-weight:700;line-height:31px;letter-spacing:1.5px">Fixture heading</h1><p id="paragraph">Fixture paragraph</p><a id="link" href="/never"><span>Fixture link</span></a><form><input id="secret" type="password"><p id="form-text">Form text</p></form><p id="editable" contenteditable="true">Editable</p><div id="decorative" style="height:20px;background:red"></div><div style="height:1500px"></div>';
child.linkClicks=0;child.document.querySelector('#link').addEventListener('click',()=>child.linkClicks++);
window.fixture=frame;
})()`);
await evaluate("document.getElementById('tab-fonts').click()");await wait();
const activate=async()=>{await evaluate("document.querySelector('.inspector-action').click()");await wait();assert.match(await evaluate("document.querySelector('.inspector-action').textContent"),/Inspection active/);};
const click=async label=>{await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent==="+JSON.stringify(label)+").click()");await wait();};
const choose=async()=>{
 await activate();
 await evaluate("fixture.contentDocument.querySelector('#heading').dispatchEvent(new fixture.contentWindow.MouseEvent('click',{bubbles:true,cancelable:true}))");
 await wait();
 assert.equal(await evaluate("document.querySelectorAll('.font-details dd').length"),10);
};
const generate=()=>click('Preview with page fonts');
await choose();
assert.equal(await evaluate('previewCalls'),0);
assert.match(await evaluate("document.querySelector('.font-preview-note').textContent"),/Approximate preview/);
assert.match(await evaluate("document.getElementById('page-font-preview-note').textContent"),/additional font subsets/);
// Activate using the keyboard and verify the existing visible focus treatment.
await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent==='Preview with page fonts').focus()");
await send('Page.bringToFront');
await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent==='Preview with page fonts').focus()");
assert.notEqual(await evaluate("getComputedStyle(document.activeElement).outlineStyle"),'none');
await send('Input.dispatchKeyEvent',{type:'keyDown',key:' ',code:'Space',windowsVirtualKeyCode:32});
await send('Input.dispatchKeyEvent',{type:'keyUp',key:' ',code:'Space',windowsVirtualKeyCode:32});await wait();
assert.equal(await evaluate('previewCalls'),1,await evaluate("document.querySelector('.font-preview-note').textContent"));
assert.equal(await evaluate("document.querySelectorAll('.font-page-specimen').length"),1);
assert.equal(await evaluate("document.querySelector('.font-specimen')===null"),true);
assert.match(await evaluate("document.querySelector('.font-preview-note').textContent"),/Page-font preview available/);
assert.equal(await evaluate("pageListeners.size"),0);
assert.deepEqual(await evaluate("[previewRequest.target,previewRequest.world]"),[{tabId:123,frameIds:[0]},'ISOLATED']);
for(const width of [280,320,380,500,650,800]){
 await send('Emulation.setDeviceMetricsOverride',{width,height:300,deviceScaleFactor:1,mobile:false});
 assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);
 assert.equal(await evaluate("document.querySelector('canvas').getBoundingClientRect().width<=document.querySelector('.font-preview').clientWidth"),true);
}
await click('Use approximate preview');
assert.equal(await evaluate("document.querySelectorAll('canvas').length"),0);
assert.equal(await evaluate('previewCalls'),1,await evaluate("document.querySelector('.font-preview-note').textContent"));
// Failures always retain the current approximate specimen and original details.
for(const flag of ['failPreview','badRaster','wrongRequest','wrongUrl','wrongFrame']){
 await evaluate(flag+'=true');await generate();
 assert.match(await evaluate("document.querySelector('.font-preview-note').textContent"),/Page preview unavailable/);
 assert.equal(await evaluate("document.querySelector('.font-specimen')!==null"),true);
 assert.equal(await evaluate("document.querySelectorAll('.font-details dd').length"),10);
 await evaluate(flag+'=false');
}
// A canvas unavailable in the receiving extension must also fall back safely.
await evaluate("window.originalContext=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=()=>null");
await generate();
assert.match(await evaluate("document.querySelector('.font-preview-note').textContent"),/Page preview unavailable/);
await evaluate("HTMLCanvasElement.prototype.getContext=originalContext");
await evaluate('holdPreview=true');await generate();
assert.match(await evaluate("document.querySelector('.font-preview-note').textContent"),/Generating page preview/);
assert.equal(await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent==='Preview with page fonts').disabled"),true);
const heldCalls=await evaluate('previewCalls');
await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent==='Preview with page fonts').click()");
assert.equal(await evaluate('previewCalls'),heldCalls);
await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent==='Cancel page preview').focus()");
await click('Cancel page preview');
assert.equal(await evaluate('document.activeElement.textContent'),'Preview with page fonts');
await evaluate('holdPreview=false;releasePreview()');await wait();
assert.equal(await evaluate("document.querySelectorAll('canvas').length"),0);
assert.match(await evaluate("document.querySelector('.font-preview-note').textContent"),/Approximate preview/);
// Post-injection checks reject navigation, retargeting, and closure.
for(const change of ['fontTarget={...fontTarget,token:"new-generation"}','fontTarget={...fontTarget,url:"http://127.0.0.1:4173/navigated"}','closedTarget=true']){
 await choose();await evaluate('holdPreview=true');await generate();
 await evaluate(change+';holdPreview=false;releasePreview()');await wait();
 assert.equal(await evaluate("document.querySelectorAll('canvas').length"),0);
 assert.match(await evaluate("document.querySelector('.font-preview-note').textContent"),/Page preview unavailable/);
 await evaluate('closedTarget=false;fontTarget={id:123,windowId:50,url:"http://127.0.0.1:4173/font-fixture",token:crypto.randomUUID()}');
}
// A new selection, even with identical typography, invalidates the old request.
await choose();await evaluate('holdPreview=true');await generate();
await choose();await evaluate('holdPreview=false;releasePreview()');await wait();
assert.equal(await evaluate("document.querySelectorAll('canvas').length"),0);
assert.match(await evaluate("document.querySelector('.font-preview-note').textContent"),/Approximate preview/);
await evaluate('holdPreview=true');await generate();
await evaluate("document.getElementById('tab-colors').click()");await wait();
await evaluate('holdPreview=false;releasePreview()');await wait();
await evaluate("document.getElementById('tab-fonts').click()");await wait();
assert.equal(await evaluate("document.querySelectorAll('canvas').length"),0);
assert.match(await evaluate("document.querySelector('.font-preview-note').textContent"),/Approximate preview/);
await generate();
assert.equal(await evaluate("document.querySelectorAll('canvas').length"),1);
await evaluate("window.dispatchEvent(new Event('pagehide'))");await wait();
assert.equal(await evaluate("document.querySelectorAll('canvas').length"),0);
await send('Emulation.clearDeviceMetricsOverride');
await send('Page.removeScriptToEvaluateOnNewDocument',{identifier:injection.identifier});ws.close();
console.log('PASS production optional preview: explicit keyboard activation, no automatic drawing, mode switch, fallback, malformed replies, cancellation, navigation/retarget/close, identical new selection, mode/pagehide cleanup, 280–800px, unchanged details.');
