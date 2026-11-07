import test from 'node:test';
import assert from 'node:assert/strict';
import { previewStyle } from '../src/font/previewStyle.ts';
const fonts = {fontFamily:'Georgia, serif',fontSize:'23px',fontWeight:'700',lineHeight:'31px',letterSpacing:'1.5px'};
test('preview preserves family/weight, scales line height and leaves source intact',()=>{
 const original={...fonts};const style=previewStyle(fonts);
 assert.equal(style.fontFamily,fonts.fontFamily);assert.equal(style.fontWeight,'700');
 assert.equal(style.fontSize,'40px');assert.equal(style.lineHeight,31/23);
 assert.equal(style.letterSpacing,'1.5px');assert.deepEqual(fonts,original);
 assert.equal(previewStyle(fonts,false).fontSize,'23px');
});
test('extreme sizes, spacing, zero size and normal metrics stay readable',()=>{
 for(const fontSize of ['0px','0.001px','999999px']){
  const style=previewStyle({...fonts,fontSize,lineHeight:'999999px',letterSpacing:'-99999px'});
  assert.ok(parseFloat(style.fontSize)>=40&&parseFloat(style.fontSize)<=64);
  assert.ok(style.lineHeight>=1.2&&style.lineHeight<=1.8);assert.equal(style.letterSpacing,'0px');
 }
 assert.equal(previewStyle({...fonts,letterSpacing:'99999px'}).letterSpacing,'3px');
 assert.equal(previewStyle({...fonts,lineHeight:'normal',letterSpacing:'normal'}).lineHeight,1.4);
});
