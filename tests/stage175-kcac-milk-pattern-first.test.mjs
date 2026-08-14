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
assert.ok(participant >= 0 && participant < assignment && assignment < cupTitle, 'milk/pattern assignment must appear immediately after participant selection and before cup evaluation');
assert.match(assessment, /id="kcac-fast-milk"[\s\S]*FAST Rosetta 사용우유/);
assert.doesNotMatch(assessment, /id="kcac-slow-milk"/, 'SLOW must be assigned automatically from the one FAST milk selection');
assert.match(assessment, /SLOW는 자동 배정/);

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
  calcKcacLeafPenalty:()=>0,
  kcacCupFullLabel:()=>'',
  refreshKcacPatternChoiceUI_:()=>{},
  refreshKcacSmartTagSection_:()=>{},
  renderKcacLeafRuleBox:()=>{},
  refreshKcacCommentReference_:()=>{},
  syncKcacMilkPatternSelectors_:()=>{},
  updateKcacFinal:()=>{},
  renderKcacCupNav:()=>{}
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

context.setKcacQualMilkPattern_('controlled', '0');
assert.equal(context._kcac.jars[0].patternType, 'controlled');
assert.equal(context._kcac.jars[1].patternType, 'dynamic');

assert.match(functionSource(assessment, 'validateKcacBeforeSubmit_'), /!hasDynamic \|\| !hasControlled/);

process.stdout.write('Stage175 KCAC milk/pattern-first workflow tests passed.\n');
