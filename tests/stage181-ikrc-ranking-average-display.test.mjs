import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assessment = fs.readFileSync(path.join(root, 'public', 'assessment', 'index.html'), 'utf8');

function functionSource(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} function not found`);
  const open = source.indexOf('{', start);
  let depth = 0, quote = '', escaped = false;
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

const context = {};
vm.createContext(context);
['roundAverageDisplay_', 'fmtAverageScore_', 'usesAverageScoreDisplay_', 'fmtRankingScore_'].forEach(name => {
  if (name === 'fmtRankingScore_') context.fmtScore = value => `legacy:${value}`;
  vm.runInContext(functionSource(assessment, name), context);
});

assert.equal(context.usesAverageScoreDisplay_('IKRC', '공식 확정점수'), true, 'IKRC는 점수기준 문구와 관계없이 평균 표시를 사용해야 합니다.');
assert.equal(context.fmtRankingScore_(71.1, 2, 'IKRC', '공식 확정점수'), '71.1', '71.10 평균을 0.2단위인 71.20으로 바꾸면 안 됩니다.');

const ranking = functionSource(assessment, 'renderRanking');
assert.match(ranking, /isIkrcRank && item\.avgScore != null \? item\.avgScore/, 'IKRC 실시간 순위는 디브리핑과 동일한 총평균값을 표시해야 합니다.');
assert.match(ranking, /displayScoreBasis = isIkrcRank \? '심사위원 총평균'/, 'IKRC 실시간 순위 점수 기준을 명확히 표시해야 합니다.');

const detail = functionSource(assessment, 'renderRankingDetail');
assert.match(detail, /rankInfo\.avgScore != null \? rankInfo\.avgScore : res\.totalScore/, 'IKRC 순위 상세도 동일한 총평균값을 표시해야 합니다.');
assert.match(detail, /'심사위원 총평균'/, 'IKRC 순위 상세 총점 명칭을 평균으로 통일해야 합니다.');

process.stdout.write('Stage181 IKRC ranking average-display tests passed.\n');
