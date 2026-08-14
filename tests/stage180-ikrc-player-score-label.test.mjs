import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const debriefing = fs.readFileSync(path.join(root, 'public', 'debriefing', 'index.html'), 'utf8');

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

const rankBox = functionSource(debriefing, 'buildRankBox');
assert.doesNotMatch(rankBox, /가산점 반영 최종 점수/);
assert.match(rankBox, /var scoreCells = isIkrc\s*\? ''/);
assert.match(debriefing, /IKRC 심사위원 평균/, '선수에게 보여줄 심사위원 평균점수는 유지해야 합니다.');

process.stdout.write('Stage180 IKRC player score-label visibility tests passed.\n');
