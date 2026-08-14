import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const registry = fs.readFileSync(new URL('../public/registry/index.html', import.meta.url), 'utf8');
const rpc = fs.readFileSync(new URL('../functions/api/rpc.js', import.meta.url), 'utf8');
const migration = fs.readFileSync(new URL('../migrations/0008_kcac_2026_prelim_roster.sql', import.meta.url), 'utf8');

function functionSource(source, name) {
  const marker = `function ${name}(`;
  const asyncMarker = `async function ${name}(`;
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

assert.doesNotMatch(registry, /공통 일정 만들기|id="scheduleBuilder"|id="participantScheduleSelect"/);
for (const label of ['선수명','소속','참가번호','연락처','예선 일정']) assert.match(registry, new RegExp(label));
assert.match(registry, /id="bulkParticipantDate"/);
assert.match(functionSource(registry, 'bulkUpdateParticipantPrelimDate_'), /bulkUpdateParticipantPrelimDate[\s\S]*rowIndexes/);

const bulk = functionSource(rpc, 'bulkUpdateParticipantPrelimDate');
assert.match(bulk, /hasManageAccess/);
assert.match(bulk, /extra\['예선일'\] = date/);
assert.match(bulk, /UPDATE participants SET extra_json=/);
assert.doesNotMatch(bulk, /UPDATE scores|DELETE FROM/);

const updateBinds = [];
const bulkContext = {
  getActor:async()=>({ accountType:'ADMIN' }),
  strictCompetitionCode_:()=>({ code:'KCAC' }),
  hasManageAccess:()=>true,
  normalizeEffectiveDate_:(value)=>String(value || ''),
  safeStr:(value)=>String(value == null ? '' : value).trim(),
  parseJson:(value, fallback)=>{ try { return JSON.parse(value || '{}'); } catch { return fallback; } },
  nowIso:()=> '2026-08-14T00:00:00.000Z'
};
vm.createContext(bulkContext);
vm.runInContext(bulk, bulkContext);
const env = { DB:{
  prepare(sql) {
    return { bind(...args) {
      if (/^SELECT/.test(sql)) return { all:async()=>({ results:[{ id:7, competition_code:'KCAC', extra_json:'{"기존값":"유지","일정ID":"old"}' }] }) };
      updateBinds.push({ sql, args });
      return { run:async()=>({ success:true }) };
    } };
  },
  batch:async()=>[]
} };
const bulkResult = await bulkContext.bulkUpdateParticipantPrelimDate(env, {
  competitionCode:'KCAC', competitionDate:'2026-09-03', rowIndexes:[7]
}, {});
assert.equal(bulkResult.success, true);
assert.equal(updateBinds.length, 1);
const savedExtra = JSON.parse(updateBinds[0].args[0]);
assert.equal(savedExtra['기존값'], '유지');
assert.equal(savedExtra['일정ID'], undefined);
assert.equal(savedExtra['예선일'], '2026-09-03');

const official = [
  ['강혜림','1'],['임현아','2'],['정성윤','3'],['정해승','4'],['오하영','5'],['이은빈','6'],
  ['신가은','7'],['오수진','8'],['조동운','9'],['김서정','10'],['최지원','11'],['양미지','12'],
  ['민혜원','13'],['김상연','14'],['염정원','15'],['김지은','16'],['이지수','17'],['홍성문','18'],
  ['박성환','19'],['문갑수','20'],['위지성','21'],['홍성현','22']
];
for (const [name, number] of official) {
  assert.match(migration, new RegExp(`\\('${name}','${number}'`), `${name} must use participant number ${number}`);
}
assert.match(migration, /'오수진', '코알라커피아카데미'/);
assert.match(migration, /'최지원','11','M바리스타학원'/);
assert.doesNotMatch(migration, /UPDATE scores|DELETE FROM scores/);

process.stdout.write('Stage178 simple participant schedule and KCAC 22 roster tests passed.\n');
