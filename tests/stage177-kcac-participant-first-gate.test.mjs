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
const evaluationBody = assessment.indexOf('id="kcac-evaluation-body"');
const milkSetup = assessment.indexOf('id="kcac-milk-pattern-setup"');
const photo = assessment.indexOf('id="kcac-cam-wrap"');
assert.ok(
  participant >= 0 && participant < evaluationBody && evaluationBody < milkSetup && milkSetup < photo,
  'KCAC must select a participant before milk assignment, photo, and evaluation controls'
);
assert.match(assessment, /id="kcac-evaluation-body" style="display:none"/);
assert.match(assessment, /id="kcac-cup-nav" style="display:none"/);

const elements = {
  'kcac-milk-pattern-setup': { style:{} },
  'kcac-evaluation-body': { style:{} },
  'kcac-cup-nav': { style:{} },
  'kcac-num': { value:'' },
  'kcac-participant-complete': { style:{} }
};
let syncCount = 0;
const context = {
  _selComp: { currentRound:'예선' },
  document: { getElementById:(id)=>elements[id] || null },
  normalizeKcacRoundDisplay_:(round)=>round,
  participantAssignmentByNumber_:()=>null,
  syncKcacMilkPatternSelectors_:()=>{ syncCount += 1; }
};
vm.createContext(context);
vm.runInContext(functionSource(assessment, 'onKcacParticipantSelected_'), context);

context.onKcacParticipantSelected_();
assert.equal(elements['kcac-evaluation-body'].style.display, 'none');
assert.equal(elements['kcac-cup-nav'].style.display, 'none');
assert.equal(elements['kcac-milk-pattern-setup'].style.display, 'none');
assert.equal(syncCount, 0);

elements['kcac-num'].value = '1';
context.onKcacParticipantSelected_();
assert.equal(elements['kcac-evaluation-body'].style.display, '');
assert.equal(elements['kcac-cup-nav'].style.display, '');
assert.equal(elements['kcac-milk-pattern-setup'].style.display, 'block');
assert.equal(syncCount, 1);

context._selComp.currentRound = '결선';
context.onKcacParticipantSelected_();
assert.equal(elements['kcac-evaluation-body'].style.display, '');
assert.equal(elements['kcac-cup-nav'].style.display, '');
assert.equal(elements['kcac-milk-pattern-setup'].style.display, 'none');
assert.equal(syncCount, 1);

process.stdout.write('Stage177 KCAC participant-first evaluation gate tests passed.\n');
