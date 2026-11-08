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
assert.match(await evaluate("document.querySelector('.font-preview-empty').textContent"), /Aa Bb Cc/);
assert.equal(await evaluate("document.querySelector('.font-development')"), null);
await activate();
assert.match(await evaluate("document.querySelector('.font-preview-empty').textContent"), /Choose text/);
const fonts={fontFamily:'"Unavailable Preview Face '+ 'VeryLongName'.repeat(30)+'", serif',fontSize:'99999px',fontWeight:'700',lineHeight:'0px',letterSpacing:'9999px'};
await evaluate(`for(const listener of uiListeners)listener({type:'designInspector.fontSelection.result',sessionId:lastStart.sessionId,status:'selected',pageUrl:fontTarget.url,fonts:${JSON.stringify(fonts)}},{id:'test',tab:{id:123},frameId:0,url:fontTarget.url})`);await wait();
assert.equal(await evaluate("document.querySelector('.font-preview-note').textContent"),'Preview may use a fallback font.');
assert.equal(await evaluate("document.querySelector('.font-specimen').style.fontSize"),'64px');
assert.equal(await evaluate("document.querySelector('.font-specimen').style.lineHeight"),'1.2');
assert.equal(await evaluate("document.querySelector('.font-specimen').style.letterSpacing"),'3px');
assert.equal(await evaluate("document.querySelector('.font-details').open"),false);
await send('Page.bringToFront');
await evaluate("document.querySelector('.font-details summary').focus()");
await send('Input.dispatchKeyEvent',{type:'keyDown',key:' ',code:'Space',windowsVirtualKeyCode:32});
await send('Input.dispatchKeyEvent',{type:'keyUp',key:' ',code:'Space',windowsVirtualKeyCode:32});await wait();
assert.equal(await evaluate("document.querySelector('.font-details').open"),true);
assert.deepEqual(await evaluate("[...document.querySelectorAll('.font-details dd')].map(e=>e.textContent)"),[fonts.fontFamily,fonts.fontSize,fonts.fontWeight,'Unavailable','Unavailable',fonts.lineHeight,fonts.letterSpacing,'Unavailable','Unavailable','Unavailable']);
for(const width of [280,320,380,500,650,800]){
 await send('Emulation.setDeviceMetricsOverride',{width,height:300,deviceScaleFactor:1,mobile:false});
 assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);
 assert.equal(await evaluate("document.querySelector('.font-specimen').scrollWidth<=document.querySelector('.font-specimen').clientWidth"),true);
}
// Extended values and long axis lists survive messaging and wrap in the same details.
const extended={...fonts,fontStyle:'italic',fontStretch:'87.5%',fontVariationSettings:Array(35).fill('"wght" 425.5').join(', '),fontFeatureSettings:'"liga" 0, "ss01" 1',fontOpticalSizing:'auto'};
await activate();
await evaluate(`for(const listener of uiListeners)listener({type:'designInspector.fontSelection.result',sessionId:lastStart.sessionId,status:'selected',pageUrl:fontTarget.url,fonts:${JSON.stringify(extended)}},{id:'test',tab:{id:123},frameId:0,url:fontTarget.url})`);await wait();
assert.equal(await evaluate("document.querySelector('.font-specimen').style.fontStyle"),'italic');
assert.equal(await evaluate("document.querySelector('.font-specimen').style.fontStretch"),'87.5%');
assert.equal(await evaluate("document.querySelector('.font-specimen').style.fontOpticalSizing"),'none');
await evaluate("document.querySelector('.font-details').open=true");
assert.deepEqual(await evaluate("[...document.querySelectorAll('.font-details dt')].map(e=>e.textContent)"),['CSS font family','Font size','Font weight','Font style','Font stretch','Line height','Letter spacing','Variation settings','Feature settings','Optical sizing']);
assert.deepEqual(await evaluate("[...document.querySelectorAll('.font-details dd')].map(e=>e.textContent)"),[extended.fontFamily,extended.fontSize,extended.fontWeight,extended.fontStyle,extended.fontStretch,extended.lineHeight,extended.letterSpacing,extended.fontVariationSettings,extended.fontFeatureSettings,extended.fontOpticalSizing]);
for(const width of [280,320,380,500,650,800]){
 await send('Emulation.setDeviceMetricsOverride',{width,height:300,deviceScaleFactor:1,mobile:false});
 assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);
 assert.equal(await evaluate("[...document.querySelectorAll('.font-details dd')].every(e=>e.scrollWidth<=e.clientWidth)"),true);
}
await evaluate('scrollTo(0,document.documentElement.scrollHeight)');assert.ok(await evaluate('scrollY>0'));
await activate();await evaluate("[...document.querySelectorAll('button')].find(e=>e.textContent==='Cancel font inspection').click()");await wait();
assert.match(await evaluate("document.querySelector('.inspector-panel').textContent"),/cancelled/);
await evaluate("denyInjection=true;document.querySelector('.inspector-action').click()");await wait();
assert.match(await evaluate("document.querySelector('.inspector-panel').textContent"),/could not inject/);
await send('Emulation.clearDeviceMetricsOverride');
await send('Page.removeScriptToEvaluateOnNewDocument',{identifier:injection.identifier});ws.close();
console.log('PASS: empty/active/selected preview, fallback notice, keyboard details, intact values, extreme sizing, long family, widths 280–800, scrolling, cancellation and error.');
