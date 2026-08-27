import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const rpc = fs.readFileSync(new URL('../functions/api/rpc.js', import.meta.url), 'utf8');
const registry = fs.readFileSync(new URL('../public/registry/index.html', import.meta.url), 'utf8');
const assessment = fs.readFileSync(new URL('../public/assessment/index.html', import.meta.url), 'utf8');
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

const ctx = {
  String,
  Object,
  Array,
  safeStr: value => String(value == null ? '' : value).trim(),
  firstNonEmpty: values => (values || []).map(value => String(value == null ? '' : value).trim()).find(Boolean) || '',
};
vm.createContext(ctx);
vm.runInContext([
  functionSource(rpc, 'ktccMemberName_'),
  functionSource(rpc, 'ktccMemberNames_'),
  functionSource(rpc, 'normalizeKtccParticipant_'),
  functionSource(rpc, 'ktccMemberSummaryFromRow_'),
].join('\n'), ctx);

const normalized = ctx.normalizeKtccParticipant_({
  competitionCode: 'KTCC',
  name: '',
  teamName: '위커피',
  affiliation: '위커피',
  extra: { '팀장 성명': '신예림', '팀원1 성명': '심소현', '팀원2 성명': 45900 }
});
assert.equal(normalized.name, '위커피');
assert.equal(normalized.teamName, '위커피');
assert.equal(normalized.affiliation, '신예림, 심소현');
assert.equal(normalized.extra['팀원 이름'], '신예림, 심소현');
assert.equal(ctx.ktccMemberSummaryFromRow_({ affiliation: '기존 소속' }, { '팀장 성명': '신예림', '팀원1 성명': '심소현' }), '신예림, 심소현');

assert.match(rpc, /const displayAff = hideIdentity \? '' : \(code === 'KTCC' \? ktccMemberSummaryFromRow_/);
assert.match(rpc, /code === 'KTCC' \? '팀원 ' : ''/);
assert.match(registry, /code==='KTCC'\?'팀원 이름':'소속'/);
assert.match(registry, /var nameLabel=ktcc\?'팀명':'선수명';var affiliationLabel=ktcc\?'팀원':'소속';var numberLabel=ktcc\?'팀번호':'참가번호'/);
assert.match(registry, /function ktccTeamMembers_/);
assert.match(assessment, /팀번호를 선택하면 팀명과 팀원 이름이 함께 표시됩니다/);
assert.match(pkg.scripts.posttest, /stage191-ktcc-team-roster\.test\.mjs/);

process.stdout.write('Stage191 KTCC team roster tests passed.\n');
