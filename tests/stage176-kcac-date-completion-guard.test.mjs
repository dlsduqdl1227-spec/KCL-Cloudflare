import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const assessment = fs.readFileSync(new URL('../public/assessment/index.html', import.meta.url), 'utf8');
const rpc = fs.readFileSync(new URL('../functions/api/rpc.js', import.meta.url), 'utf8');

function functionSource(source, name) {
  const asyncMarker = `async function ${name}(`;
  const marker = `function ${name}(`;
  let start = source.indexOf(asyncMarker);
  if (start < 0) start = source.indexOf(marker);
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

const unitContext = { safeStr:(value)=>String(value == null ? '' : value).trim() };
vm.createContext(unitContext);
vm.runInContext(functionSource(rpc, 'normalizeKcacParticipantUnit_'), unitContext);
assert.equal(unitContext.normalizeKcacParticipantUnit_('001'), '1');
assert.equal(unitContext.normalizeKcacParticipantUnit_(' 21 '), '21');

const dedupeContext = {
  safeStr:(value)=>String(value == null ? '' : value).trim(),
  parseJson:(value, fallback)=>{ try { return JSON.parse(value || '{}'); } catch { return fallback; } },
  normalizePhone:(value)=>String(value || '').replace(/\D/g, ''),
  normalizeRoundForCompetition_:(_code, round)=>round || '예선'
};
vm.createContext(dedupeContext);
vm.runInContext([
  functionSource(rpc, 'participantRoundNumber_'),
  functionSource(rpc, 'normalizeKcacParticipantUnit_'),
  functionSource(rpc, 'kcacParticipantSourcePriority_'),
  functionSource(rpc, 'dedupeKcacParticipantRows_')
].join('\n'), dedupeContext);
const deduped = dedupeContext.dedupeKcacParticipantRows_([
  { id:1, prelim_cup_no:'1', name:'공식 참가자', affiliation:'공식 소속', phone:'01012345678', extra_json:'{"원본시트":"KCAC","원본행":3}' },
  { id:2, prelim_cup_no:'001', name:'테스트 참가자', affiliation:'테스트', phone:'1234', extra_json:'{}' }
], '예선');
assert.equal(deduped.length, 1);
assert.equal(deduped[0].id, 1, 'official KCAC roster row must win over a duplicate test number');

const assignments = functionSource(rpc, 'getParticipantAssignments');
assert.match(assignments, /dedupeKcacParticipantRows_/);
assert.match(assignments, /scoreOwnedByActor_\(scoreRow, actor\)/);
assert.match(assignments, /evaluationCompleted/);
assert.match(assignments, /✓ 평가완료/);
assert.match(assignments, /evaluationCompletionScope:\s*\(code === 'KCAC' \|\| code === 'KBC'\) \? 'currentJudge'/);

const submit = functionSource(rpc, 'submitScores');
assert.match(submit, /x\.code === 'KCAC'[\s\S]*normalizeKcacParticipantUnit_\(x\.unit\)/);
assert.match(submit, /existingKcacRows[\s\S]*scoreOwnedByActor_\(row, auth\.actor\)/);
assert.match(submit, /이미 평가완료된 KCAC 참가자입니다/);

assert.match(assessment, /id="kcac-participant-complete"[^>]*>✓ 평가완료</);
assert.match(functionSource(assessment, 'renderParticipantControl_'), /a\.evaluationCompleted[\s\S]*✓ 평가완료/);
assert.match(functionSource(assessment, 'onKcacParticipantSelected_'), /evaluationCompleted[\s\S]*inline-flex/);
assert.match(functionSource(assessment, 'kcacSubmitAll'), /selectedAssignment\.evaluationCompleted[\s\S]*중복 제출/);

process.stdout.write('Stage176 KCAC date, completion badge, and duplicate guard tests passed.\n');
