import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync(new URL('../public/debriefing/index.html',import.meta.url),'utf8');
const extract=name=>{const start=html.indexOf('function '+name+'(');assert.ok(start>=0);return html.slice(start,html.indexOf('\nfunction ',start+1));};
const ctx=vm.createContext({});vm.runInContext(['isSmartTagLabel','isCommentLabel','kbcPresentationPublicLabel_','isPublicScoreKey','scoreMaxForLabel'].map(extract).join('\n'),ctx);
test('KBC canonical and legacy presentation scores, including zero, are eligible for the public report',()=>{
  for(const key of ['Service Professionalism(서비스의 전문성)','Service Professionalism','Presentation','Presentation & Service(프레젠테이션과 서비스 전문성)','프레젠테이션']){
    assert.equal(ctx.isPublicScoreKey(key,'KBC'),true,key);assert.equal(ctx.scoreMaxForLabel(key,'KBC'),5);assert.match(ctx.kbcPresentationPublicLabel_(key),/프레젠테이션/);
  }
  assert.equal(ctx.isPublicScoreKey('Presentation','MOC'),false,'scope stays KBC only');
});
test('presentation comments and smart tags keep their own sections, and private fields stay hidden',()=>{
  for(const key of ['Service Professionalism 코멘트','Presentation Comment','Service Professionalism 스마트태그','Presentation participantName','Presentation 연락처'])assert.equal(ctx.isPublicScoreKey(key,'KBC'),false,key);
  assert.match(ctx.kbcPresentationPublicLabel_('Service Professionalism 코멘트'),/코멘트/);assert.match(ctx.kbcPresentationPublicLabel_('Service Professionalism 스마트태그'),/스마트태그/);
});

test('KBC machine/equipment points and authored feedback have public labels and the correct five-point scale',()=>{
  const h='Machine & Equipment Professionalism(머신 및 기물 운용 전문성)';assert.equal(ctx.isPublicScoreKey(h,'KBC'),true);assert.equal(ctx.scoreMaxForLabel(h,'KBC'),5);assert.match(ctx.kbcPresentationPublicLabel_(h),/머신 및 기물 운용 전문성/);
  assert.equal(ctx.isPublicScoreKey('Machine & Equipment participantName','KBC'),false);assert.match(ctx.kbcPresentationPublicLabel_('Machine & Equipment 코멘트'),/운용 코멘트/);assert.match(ctx.kbcPresentationPublicLabel_('Machine & Equipment 스마트태그'),/운용 스마트태그/);
});
