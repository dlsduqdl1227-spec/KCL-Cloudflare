import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const assessment = fs.readFileSync(new URL('../public/assessment/index.html', import.meta.url), 'utf8');

function functionSource(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} function missing`);
  let depth = 0;
  let bodyStarted = false;
  for (let i = start; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '{') { depth += 1; bodyStarted = true; }
    if (ch === '}' && bodyStarted && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`${name} function incomplete`);
}

const participant = assessment.indexOf('id="kcac-participant-select"');
const assignment = assessment.indexOf('id="kcac-milk-pattern-setup"');
const cupTitle = assessment.indexOf('id="kcac-cup-title"');
assert.ok(participant >= 0 && participant < assignment && assignment < cupTitle, 'pattern assignment must appear immediately after participant selection and before cup evaluation');
assert.match(assessment, /id="kcac-milk-button-grid"/);
assert.doesNotMatch(assessment, /<select[^>]+id="kcac-fast-milk"/);
assert.match(assessment, /kcac-milk-choice-btn/);
assert.match(assessment, /FAST Rosetta[\s\S]*SLOW Rosetta/);
assert.doesNotMatch(assessment, /id="kcac-slow-milk"/);
assert.match(assessment, /한 잔을 선택하면 다른 잔은 반대 로제타로 자동 배정됩니다/);
const selectorSource = functionSource(assessment, 'syncKcacMilkPatternSelectors_');
assert.match(selectorSource, /1번 잔|kcacQualCupNumberLabel_/);
assert.ok(selectorSource.includes("setKcacQualMilkPattern_(\\'dynamic\\'"));
assert.ok(selectorSource.includes("setKcacQualMilkPattern_(\\'controlled\\'"));
assert.doesNotMatch(selectorSource, /milkProduct|milkType|멸균|오트|대체우유|사용할 우유/);

assert.match(functionSource(assessment, 'applyParticipantSelect_'), /KCAC'[\s\S]*onKcacParticipantSelected_\(\)/);
assert.match(functionSource(assessment, 'applyParticipantNumberInput_'), /KCAC'[\s\S]*onKcacParticipantSelected_\(\)/);
assert.match(functionSource(assessment, 'onKcacParticipantSelected_'), /hasParticipant[\s\S]*showMilkSetup[\s\S]*setup\.style\.display = showMilkSetup/);

const context = {
  _kcac: {
    jars: [
      { type:'qual', milkProduct:'매일멸균우유', patternType:'', leafCount:'', smartTags:{} },
      { type:'qual', milkProduct:'어메이징 오트바리스타', patternType:'', leafCount:'', smartTags:{} }
    ],
    currentIdx:0
  },
  KCAC_QUAL_ATTRS:[],
  document:{ getElementById:()=>({ textContent:'' }) },
  kcacCleanPatternSpecificSmartTags_:()=>{},
  syncKcacLeafCountFromDOM_:()=>{},
  calcKcacLeafPenalty:()=>0,
  kcacCupFullLabel:()=>'',
  refreshKcacPatternChoiceUI_:()=>{},
  refreshKcacSmartTagSection_:()=>{},
  renderKcacLeafRuleBox:()=>{},
  refreshKcacCommentReference_:()=>{},
  syncKcacMilkPatternSelectors_:()=>{},
  updateKcacFinal:()=>{},
  renderKcacCupNav:()=>{},
  loadKcacJar:(idx)=>{ context._kcac.currentIdx = idx; }
};
vm.createContext(context);
vm.runInContext([
  functionSource(assessment, 'kcacOppositePatternType_'),
  functionSource(assessment, 'kcacQualMilkEntries_'),
  functionSource(assessment, 'setKcacQualMilkPattern_')
].join('\n'), context);

context.setKcacQualMilkPattern_('dynamic', '0');
assert.equal(context._kcac.jars[0].patternType, 'dynamic');
assert.equal(context._kcac.jars[1].patternType, 'controlled');
assert.equal(context._kcac.currentIdx, 0, 'FAST로 배정한 실제 우유 잔이 즉시 열려야 합니다');

context.setKcacQualMilkPattern_('controlled', '0');
assert.equal(context._kcac.jars[0].patternType, 'controlled');
assert.equal(context._kcac.jars[1].patternType, 'dynamic');

assert.match(functionSource(assessment, 'validateKcacBeforeSubmit_'), /!hasDynamic \|\| !hasControlled/);

process.stdout.write('Stage175 KCAC milk/pattern-first workflow tests passed.\n');
