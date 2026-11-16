import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync('public/debriefing/index.html','utf8');
const context={isSmartTagLabel:key=>/스마트태그|smart\s*tags?/i.test(key),kcrPublicTagLabels_:values=>values};
vm.createContext(context);
vm.runInContext(source.slice(source.indexOf('function normalizePublicTag_('),source.indexOf('function ikrcAggregateJudgeCount_(')),context);
const tags={};vm.createContext(tags);
for(const asset of ['kcr-sensory-tags.js','kcr-sensory-comments.js'])vm.runInContext(fs.readFileSync('public/assets/'+asset,'utf8'),tags);

test('public comments preserve authored particles, observations, spacing and paragraphs without automatic wording substitutions',()=>{
 const original='오렌지가 첫인상을 이룹니다.  발효된 과일같은 향미가 느껴집니다.\n\n여운은 길게 남습니다... 직접 작성한 원문입니다.';
 for(const code of ['KBC','MOC','MOB','KCR','IKRC','KTCC','KCAC']){
  assert.equal(context.cleanupPublicCommentText_('종합코멘트',original,{},code),original,code);
  assert.equal(context.cleanupPublicCommentText_('Flavor 코멘트',original.replaceAll('\n','\r\n'),{},code),original,code+' CRLF');
 }
});

test('missing-overall summaries include acidity, sweetness and clean-cup-only observations without inventing absent aromas',()=>{
 for(const [header,term]of [['Acidity 스마트태그','레몬'],['Sweetness 스마트태그','캐러멜'],['Clean Cup 스마트태그','정돈된']]){
  const summary=context.buildProfessionalOverallComment_({[header]:term},'IKRC');
  assert.ok(summary.includes(term),header);
  assert.doesNotMatch(summary,/첫 향미|기록 없음|향미 표현이 선명|연결성|균형 속/);
 }
 const aftertaste=context.buildProfessionalOverallComment_({'Aftertaste Flavor Reference 스마트태그':'레몬'},'KCR');
 assert.match(aftertaste,/에프터테이스트에서는 레몬/);
 assert.doesNotMatch(aftertaste,/플레이버에서는/,'an aftertaste aroma reference must not become a separate flavor observation');
});

test('display-only fallback uses each competition scale and does not turn a tied score into a high/low claim',()=>{
 const low=context.buildProfessionalOverallComment_({'Flavor(플레이버) ×3':6,'Acidity(산미)':6},'IKRC');
 assert.doesNotMatch(low,/선명|상대적으로 높|비교적 낮/);
 const original={'Flavor(플레이버) ×3':7,'Clean Cup(클린컵) ×2':6,'Flavor 스마트태그':'오렌지'};
 const before=JSON.stringify(original);context.buildProfessionalOverallComment_(original,'IKRC');assert.equal(JSON.stringify(original),before);
 assert.equal(context.buildProfessionalOverallComment_(original,'KCAC'),'');
});

test('new KCR attribute comments retain every selected descriptor after a preset three-tag combination',()=>{
 const mouthfeel=['mouthfeel_silky','mouthfeel_juicy','mouthfeel_round','mouthfeel_rough'];
 const comment=tags.KcrSensoryComments.generateMouthfeelComment(mouthfeel);
 for(const id of mouthfeel)assert.ok(comment.includes(tags.KcrSensoryTags.get(id).labelKo),id+' must remain in generated text');
 const aftertaste=['aftertaste_bitter','aftertaste_dry','aftertaste_astringent','aftertaste_papery'];
 const finish=tags.KcrSensoryComments.generateAftertasteComment(aftertaste);
 assert.match(finish,/쓴맛/);assert.match(finish,/드라이/);assert.match(finish,/수렴감/);assert.match(finish,/종이/);
 const custom='심사위원이 직접 쓴 원문';
 assert.equal(tags.KcrSensoryComments.syncState({customComment:custom,commentTouched:true},'mouthfeel',mouthfeel,{}).customComment,custom);
});
