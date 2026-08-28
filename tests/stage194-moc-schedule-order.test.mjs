import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const rpc = fs.readFileSync(new URL('../functions/api/rpc.js', import.meta.url), 'utf8');
const registry = fs.readFileSync(new URL('../public/registry/index.html', import.meta.url), 'utf8');
const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

function functionSource(source, name) {
  const marker = `function ${name}(`;
  const start = source.indexOf(marker);
  assert.ok(start >= 0, `${name} function missing`);
  const open = source.indexOf('{', start);
  let depth = 0; let quote = ''; let escaped = false;
  for (let i = open; i < source.length; i += 1) {
    const ch = source[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === quote) quote = '';
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') { quote = ch; continue; }
    if (ch === '{') depth += 1;
    if (ch === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`${name} function incomplete`);
}

const serverCtx = { String, Number, Math, Date, JSON, safeStr: value => String(value == null ? '' : value).trim(), parseJson: (value, fallback = {}) => { try { return value ? JSON.parse(value) : fallback; } catch { return fallback; } } };
vm.createContext(serverCtx);
vm.runInContext([
  functionSource(rpc, 'normalizeEffectiveDate_'),
  functionSource(rpc, 'participantScheduleSortMeta_'),
  functionSource(rpc, 'sortParticipantRowsForCompetition_')
].join('\n'), serverCtx);

const rows = [
  { id: 1, competition_code: 'MOC', extra_json: JSON.stringify({ '대회일': '2026-09-02', '운영일차': '2일차', '경연순서': '1' }) },
  { id: 2, competition_code: 'MOC', extra_json: JSON.stringify({ '대회일': '2026-09-01', '운영일차': '1일차', '경연순서': '2' }) },
  { id: 3, competition_code: 'MOC', extra_json: JSON.stringify({ '대회일': '2026-09-01', '운영일차': '1일차', '경연순서': '1' }) }
];
assert.deepEqual(serverCtx.sortParticipantRowsForCompetition_(rows, 'MOC').map(row => row.id), [3, 2, 1]);
const operatingDayOnly = [
  { id: 1, competition_code: 'MOC', extra_json: JSON.stringify({ '운영일차': '2일차', '경연순서': '1' }) },
  { id: 2, competition_code: 'MOC', extra_json: JSON.stringify({ '운영일차': '1일차', '경연순서': '2' }) },
  { id: 3, competition_code: 'MOC', extra_json: JSON.stringify({ '운영일차': '1일차', '경연순서': '1' }) }
];
assert.deepEqual(serverCtx.sortParticipantRowsForCompetition_(operatingDayOnly, 'MOC').map(row => row.id), [3, 2, 1]);

const clientCtx = { String, Number, Array };
vm.createContext(clientCtx);
vm.runInContext([
  functionSource(registry, 'participantPrimaryNumber_'),
  functionSource(registry, 'participantPrelimDate_'),
  functionSource(registry, 'participantOperatingDaySort_'),
  functionSource(registry, 'participantNaturalCompare_'),
  functionSource(registry, 'sortParticipantRowsForRegistry_')
].join('\n'), clientCtx);
assert.deepEqual(clientCtx.sortParticipantRowsForRegistry_('MOC', [
  { rowIndex: 1, competitionCode: 'MOC', uniqueNo: '1', competitionDate: '2026-09-02', operatingDay: '2일차', performanceOrder: '1' },
  { rowIndex: 2, competitionCode: 'MOC', uniqueNo: '2', competitionDate: '2026-09-01', operatingDay: '1일차', performanceOrder: '2' },
  { rowIndex: 3, competitionCode: 'MOC', uniqueNo: '3', competitionDate: '2026-09-01', operatingDay: '1일차', performanceOrder: '1' }
], 'schedule').map(row => row.rowIndex), [3, 2, 1]);

assert.match(rpc, /aCode === 'MOB' \|\| aCode === 'KBC' \|\| aCode === 'MOC'/);
assert.match(rpc, /if \(am\.operatingDay !== bm\.operatingDay\)/);
assert.match(registry, /function setParticipantDefaultSortForCode_\(code\)/);
assert.match(registry, /code==='MOC'\)\{select\.value='schedule'/);
assert.match(pkg.scripts.posttest, /stage194-moc-schedule-order\.test\.mjs/);

process.stdout.write('Stage194 MOC day and schedule ordering tests passed.\n');
