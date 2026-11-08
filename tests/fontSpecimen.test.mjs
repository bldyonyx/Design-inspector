import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { renderSpecimen } from '../src/font/renderSpecimen.ts';
import { requestSpecimen, validateRaster, RASTER_BASE64_LENGTH } from '../src/font/specimenSession.ts';

const fonts = {fontFamily:'Missing, serif',fontSize:'99999px',fontWeight:'700',fontStyle:'italic',fontStretch:'87.5%',lineHeight:'24px',letterSpacing:'999px'};
const target = {id:12,windowId:2,url:'https://example.com/',token:'first'};
const payload = (requestId = 'one') => ({type:'designInspector.fontSpecimen.v1',requestId,pageUrl:target.url,status:'ok',width:480,height:144,format:'rgba8',pixels:'A'.repeat(RASTER_BASE64_LENGTH),stretchApplied:true,spacingApplied:true});

test('detached canvas uses only fixed strings, bounded styles and releases its store', () => {
  const oldDocument = Object.getOwnPropertyDescriptor(globalThis,'document');
  const oldLocation = Object.getOwnPropertyDescriptor(globalThis,'location');
  const calls = [];
  const context = {fontStretch:'normal',letterSpacing:'0px',fillRect:()=>{},fillText:(...args)=>calls.push({args,font:context.font,spacing:context.letterSpacing,stretch:context.fontStretch}),getImageData:()=>({data:new Uint8ClampedArray(480*144*4)})};
  let mode = 'ok';
  const canvas = {width:0,height:0,getContext:()=>{if(mode==='throw')throw Error('Failure');return mode==='null'?null:context;}};
  try {
    Object.defineProperty(globalThis,'document',{configurable:true,value:{createElementNS:()=>canvas}});
    Object.defineProperty(globalThis,'location',{configurable:true,value:{href:target.url}});
    const request = {requestId:'one',pageUrl:target.url,fonts};
    const result = renderSpecimen(request);
    assert.equal(validateRaster(result,'one',target.url).pixels.length,RASTER_BASE64_LENGTH);
    assert.deepEqual(calls.map(c=>c.args),[['Aa Bb Cc',16,68],['The quick brown fox jumps over the lazy dog.',16,116]]);
    assert.match(calls[0].font,/italic 700 64px/); assert.match(calls[1].font,/24px/);
    assert.equal(calls[0].spacing,'3px'); assert.equal(calls[0].stretch,'semi-condensed');
    assert.equal(canvas.width,0); assert.equal(canvas.height,0);
    delete context.fontStretch; delete context.letterSpacing;
    const unsupported = renderSpecimen(request);
    assert.equal(unsupported.stretchApplied,false); assert.equal(unsupported.spacingApplied,false);
    mode='null'; assert.equal(renderSpecimen(request).code,'canvas-unavailable');
    mode='throw'; assert.equal(renderSpecimen(request).code,'render-failed');
    assert.equal(renderSpecimen({...request,pageUrl:'https://elsewhere.example/'}).code,'document-changed');
    assert.equal(canvas.width,0);
  } finally {
    if(oldDocument)Object.defineProperty(globalThis,'document',oldDocument);else delete globalThis.document;
    if(oldLocation)Object.defineProperty(globalThis,'location',oldLocation);else delete globalThis.location;
  }
});

test('raster boundary rejects wrong shape, size, content, frame envelope and stale identifiers', () => {
  assert.equal(validateRaster(payload(),'one',target.url).width,480);
  for(const patch of [{width:481},{height:100000},{format:'png'},{pixels:'A'.repeat(RASTER_BASE64_LENGTH+1)},{pixels:'!'.repeat(RASTER_BASE64_LENGTH)},
    {pixels:'data:image/png;base64,AAAA'},{requestId:'old'},{pageUrl:'https://elsewhere.example/'},{extra:'x'},{stretchApplied:'yes'},{status:'selected'}]) {
    assert.throws(()=>validateRaster({...payload(),...patch},'one',target.url));
  }
  for(const value of [null,[],{},'x'])assert.throws(()=>validateRaster(value,'one',target.url));
  assert.throws(()=>validateRaster(payload(),'one','x'.repeat(8193)),/too large/);
  assert.throws(()=>validateRaster({type:payload().type,requestId:'one',pageUrl:target.url,status:'error',code:'canvas-unavailable'},'one',target.url),/canvas-unavailable/);
});

function browser() {
  const state={target:{...target},calls:[],after:()=>{},hold:null};
  const api={runtime:{sendMessage:async()=>({ok:true,target:state.target})},tabs:{get:async()=>({...target,status:'complete'})},scripting:{executeScript:async options=>{
    state.calls.push(options); if(state.hold)await state.hold;state.after();return [{frameId:0,result:payload(options.args[0].requestId)}];
  }}};
  return {state,api};
}
test('one-shot isolated main-frame transport validates typography and cancels stale returns', async () => {
  const b=browser();const controller=new AbortController();
  assert.equal((await requestSpecimen(b.api,target,fonts,controller.signal)).width,480);
  assert.deepEqual(b.state.calls[0].target,{tabId:12,frameIds:[0]});
  assert.equal(b.state.calls[0].world,'ISOLATED');assert.equal(b.state.calls[0].func,renderSpecimen);
  const aborted=browser();controller.abort();await assert.rejects(requestSpecimen(aborted.api,target,fonts,controller.signal),/abort/i);assert.equal(aborted.state.calls.length,0);
  const c=browser();const cancel=new AbortController();c.state.after=()=>cancel.abort();
  await assert.rejects(requestSpecimen(c.api,target,fonts,cancel.signal),/abort/i);
  const d=browser();d.state.after=()=>{d.state.target.token='replaced';};
  await assert.rejects(requestSpecimen(d.api,target,fonts,new AbortController().signal),/target changed/);
  const e=browser();await assert.rejects(requestSpecimen(e.api,target,{...fonts,fontStyle:'url(x)'},new AbortController().signal));assert.equal(e.state.calls.length,0);
  const f=browser();f.api.scripting.executeScript=async()=>[{frameId:1,result:payload()}];
  await assert.rejects(requestSpecimen(f.api,target,fonts,new AbortController().signal),/frame/);
  const g=browser();await assert.rejects(requestSpecimen(g.api,{...target,url:'x'.repeat(8193)},fonts,new AbortController().signal),/too long/);assert.equal(g.state.calls.length,0);
});

test('target identity changes and invalidated documents fail before rendering', async () => {
  for (const patch of [{token:'next'}, {id:13}, {windowId:3}, {url:'https://example.com/next'}, {invalidated:'TARGET_NAVIGATED'}]) {
    const b=browser();b.state.target={...target,...patch};
    await assert.rejects(requestSpecimen(b.api,target,fonts,new AbortController().signal));
    assert.equal(b.state.calls.length,0);
  }
  const closed=browser();closed.api.tabs.get=async()=>{throw Error('No tab with id: 12');};
  await assert.rejects(requestSpecimen(closed.api,target,fonts,new AbortController().signal),/closed/);
  assert.equal(closed.state.calls.length,0);
  const navigated=browser();navigated.state.after=()=>{navigated.state.target.invalidated='TARGET_NAVIGATED';};
  await assert.rejects(requestSpecimen(navigated.api,target,fonts,new AbortController().signal),/navigated/);
});

test('replaced operation can finish first without accepting the aborted predecessor', async () => {
  const b=browser();let finish; b.state.hold=new Promise(resolve=>{finish=resolve;});
  const first=new AbortController();const old=requestSpecimen(b.api,target,fonts,first.signal);
  while(!b.state.calls.length)await new Promise(resolve=>setTimeout(resolve,0));
  first.abort();b.state.hold=null;
  assert.equal((await requestSpecimen(b.api,target,fonts,new AbortController().signal)).height,144);
  finish();await assert.rejects(old,/abort/i);
});

test('shared specimen code preserves permissions and has no remote/font/text/screenshot APIs', async () => {
  const manifest=JSON.parse(await readFile(new URL('../public/manifest.json',import.meta.url),'utf8'));
  assert.deepEqual(manifest.permissions,['storage','activeTab','scripting']);assert.equal(manifest.host_permissions,undefined);
  const main=await readFile(new URL('../src/main.tsx',import.meta.url),'utf8');assert.doesNotMatch(main,/experiments/);
  for(const path of ['font/renderSpecimen.ts','font/specimenSession.ts','experiments/font-preview/Experiment.tsx','hooks/usePageFontPreview.ts']) {
    const source=await readFile(new URL('../src/'+path,import.meta.url),'utf8');
    assert.doesNotMatch(source,/\bfetch\s*\(|XMLHttpRequest|captureVisibleTab|queryLocalFonts|cssRules|textContent|innerText|\.value\b|storage\.|console\./);
  }
});
