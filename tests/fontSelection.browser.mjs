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
window.uiListeners=new Set();window.pageListeners=new Set();window.lastSelection=null;window.fontCalls=0;
window.chrome={runtime:{id:'test',sendMessage:async()=>({ok:true,target:window.fontTarget}),onMessage:{addListener:f=>uiListeners.add(f),removeListener:f=>uiListeners.delete(f)}},
 storage:{local:{get:async()=>({}),set:async()=>{throw Error('Unexpected write')}}},
 tabs:{get:async()=>{if(window.closedTarget)throw Error('No tab with id: 123');return {...fontTarget,status:'complete'}},update:async id=>{window.focusedTarget=id;},sendMessage:async(id,message)=>{
 if(window.dropHeartbeat&&message.type.endsWith('.heartbeat'))return {ok:true};
 let response;for(const listener of pageListeners)listener(message,{id:'test',url:'chrome-extension://test/index.html',frameId:0},value=>response=value);
 if(!response)throw Error('No receiver');return response;
 }},windows:{update:async id=>{window.focusedWindow=id;}},
 scripting:{executeScript:async options=>{fontCalls++;window.lastStart=options.args[0];if(window.holdStart)await new Promise(resolve=>window.finishStart=resolve);if(window.denyInjection)throw Error('Denied');
 const frame=document.getElementById('font-fixture');
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
const hover=async selector=>{await evaluate(`(()=>{const child=fixture.contentWindow,element=child.document.querySelector(${JSON.stringify(selector)}),rect=element.getBoundingClientRect();child.dispatchEvent(new child.PointerEvent('pointermove',{clientX:rect.left+Math.min(rect.width/2,20),clientY:rect.top+Math.min(rect.height/2,10)}));})()`);await wait();};
const cleanup=async()=>{
 assert.equal(await evaluate("fixture.contentDocument.querySelectorAll('[data-design-inspector-font]').length"),0);
 assert.equal(await evaluate('pageListeners.size'),0);
 assert.equal(await evaluate("'__designInspectorFontSelection' in fixture.contentWindow"),false);
};
await evaluate("holdStart=true;document.querySelector('.inspector-action').click()");await wait();
await evaluate("[...document.querySelectorAll('button')].find(e=>e.textContent==='Cancel font inspection').click();holdStart=false;finishStart()");await wait();await cleanup();
assert.equal(await evaluate("document.querySelector('.inspector-action').disabled"),false);
for(const flag of ['failShadow','failControllerListener','dropAck']){
 await evaluate(`window[${JSON.stringify(flag)}]=true;document.querySelector('.inspector-action').click()`);await wait();await cleanup();
 assert.match(await evaluate("document.querySelector('.inspector-panel').textContent"),/could not initialize/);
 await evaluate(`window[${JSON.stringify(flag)}]=false`);
}
await activate();assert.equal(await evaluate("fixture.contentDocument.querySelectorAll('[data-design-inspector-font]').length"),1);
assert.equal(await evaluate('focusedTarget'),123);assert.equal(await evaluate('focusedWindow'),50);
const firstCalls=await evaluate('fontCalls');
await evaluate("document.querySelector('.inspector-action').click()");await wait();assert.equal(await evaluate('fontCalls'),firstCalls);
await evaluate("for(const listener of pageListeners)listener({type:'designInspector.fontSelection.cancel',sessionId:lastStart.sessionId},{id:'test',url:fontTarget.url,frameId:0},()=>{})");await wait();
assert.equal(await evaluate("fixture.contentDocument.querySelectorAll('[data-design-inspector-font]').length"),1);

for(const selector of ['#secret','#form-text','#editable','#decorative']){await hover(selector);assert.equal(await evaluate("fixture.contentWindow.testShadow.firstChild.style.display"),'none');}
await hover('#heading');assert.equal(await evaluate("fixture.contentWindow.testShadow.firstChild.style.display"),'block');
await evaluate("fixture.style.width='400px'");await wait();
assert.equal(await evaluate("fixture.contentWindow.testShadow.firstChild.style.width"),await evaluate("fixture.contentDocument.querySelector('#heading').getBoundingClientRect().width+'px'"));
await evaluate('fixture.contentWindow.scrollTo(0,20)');await wait();
assert.equal(await evaluate("fixture.contentWindow.testShadow.firstChild.style.top"),await evaluate("fixture.contentDocument.querySelector('#heading').getBoundingClientRect().top+'px'"));
await evaluate("fixture.contentDocument.querySelector('#heading').dispatchEvent(new fixture.contentWindow.MouseEvent('click',{bubbles:true,cancelable:true}))");await wait();await cleanup();
assert.deepEqual(await evaluate("[...document.querySelectorAll('[aria-label=\"Selected typography\"] dd')].map(e=>e.textContent)"),['Georgia, serif','23px','700','31px','1.5px']);
assert.deepEqual(await evaluate('Object.keys(lastSelection.fonts)'),['fontFamily','fontSize','fontWeight','lineHeight','letterSpacing']);
assert.equal(await evaluate("'text' in lastSelection"),false);
await activate();await hover('#link');
await evaluate("fixture.contentDocument.querySelector('#link span').dispatchEvent(new fixture.contentWindow.MouseEvent('click',{bubbles:true,cancelable:true}))");await wait();await cleanup();assert.equal(await evaluate('fixture.contentWindow.linkClicks'),0);
const oldMessage=await evaluate('lastSelection');
await activate();await evaluate(`for(const listener of uiListeners)listener(${JSON.stringify(oldMessage)},{id:'test',tab:{id:123},frameId:0,url:fontTarget.url})`);await wait();
assert.match(await evaluate("document.querySelector('.inspector-action').textContent"),/Inspection active/);
await evaluate("fixture.contentWindow.dispatchEvent(new fixture.contentWindow.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}))");await wait();await cleanup();
assert.match(await evaluate("document.querySelector('.inspector-panel').textContent"),/cancelled/);
await activate();await evaluate("[...document.querySelectorAll('button')].find(e=>e.textContent==='Cancel font inspection').click()");await wait();await cleanup();
await activate();await evaluate("document.getElementById('tab-colors').click()");await wait();await cleanup();
await evaluate("document.getElementById('tab-fonts').click()");await wait();await activate();await evaluate('fontTarget={...fontTarget,token:"new"}');await wait(1200);await cleanup();
assert.match(await evaluate("document.querySelector('.inspector-panel').textContent"),/target page navigated/);
await activate();await evaluate("fixture.contentWindow.dispatchEvent(new fixture.contentWindow.Event('pagehide'))");await wait();await cleanup();
await activate();await evaluate('closedTarget=true');await wait(1200);await cleanup();await evaluate('closedTarget=false');
await activate();await evaluate("fixture.contentWindow.savedComputedStyle=fixture.contentWindow.getComputedStyle;fixture.contentWindow.getComputedStyle=()=>{throw Error('Style failure')}");await hover('#paragraph');await cleanup();
await evaluate("fixture.contentWindow.getComputedStyle=fixture.contentWindow.savedComputedStyle");
assert.match(await evaluate("document.querySelector('.inspector-panel').textContent"),/Font selection failed/);
await evaluate("denyInjection=true;document.querySelector('.inspector-action').click()");await wait();await cleanup();assert.match(await evaluate("document.querySelector('.inspector-panel').textContent"),/could not inject/);await evaluate('denyInjection=false');
await activate();await evaluate('dropHeartbeat=true');await wait(6200);await cleanup();await evaluate('dropHeartbeat=false');
for(const width of [280,320,380,500,650,800]){await send('Emulation.setDeviceMetricsOverride',{width,height:300,deviceScaleFactor:1,mobile:false});assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);}
console.log('PASS: real bundled controller hover filtering/alignment, heading/link selection and suppression, five-property result, stale rejection, Escape/UI/unmount cancellation, repeated activation, retarget/closed/permission errors, lease cleanup, 280–800px. Native Chrome grants and transport mocked.');
await send('Page.removeScriptToEvaluateOnNewDocument',{identifier:injection.identifier});ws.close();
