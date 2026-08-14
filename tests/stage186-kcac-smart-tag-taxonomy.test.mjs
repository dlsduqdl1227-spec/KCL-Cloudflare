import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const assessment = fs.readFileSync(new URL('../public/assessment/index.html', import.meta.url), 'utf8');

function functionSource(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} function missing`);
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

const dataStart = assessment.indexOf('var KCAC_SMART_TAGS =');
const dataEnd = assessment.indexOf('function startKcac()', dataStart);
assert.ok(dataStart >= 0 && dataEnd > dataStart, 'KCAC smart-tag data block missing');
const context = { KCL_SENSORY_SMART_TAGS:{ milkTasteBalance:{}, mouthfeel:{} } };
vm.createContext(context);
vm.runInContext(assessment.slice(dataStart, dataEnd), context);

const qual = context.KCAC_SMART_TAGS.qual;
assert.ok(qual['완성도']['보완'].includes('언더필'));
assert.deepEqual(Array.from(qual['표면']['긍정']), ['기포 없음','광택 유지']);
assert.ok(!qual['표면']['긍정'].includes('크레마 경계 선명'));
assert.ok(!qual['표면']['긍정'].includes('라인 번짐 없음'));
for (const tag of ['크레마 경계 선명','라인 번짐 없음','크레마 얼룩 없음']) assert.ok(qual['선명도']['긍정'].includes(tag));
assert.ok(qual['선명도']['보완'].includes('크레마 얼룩 있음'));
assert.doesNotMatch(assessment, /['"]레마 얼룩있음['"]/);

const migrationContext = { smartTagDedupeList_:items=>Array.from(new Set(items)) };
vm.createContext(migrationContext);
vm.runInContext(functionSource(assessment, 'kcacMigrateQualSmartTagAssignments_'), migrationContext);
const jar = { type:'qual', smartTags:{
  표면:['기포 없음 또는 극소','크레마 경계 선명','라인 번짐 없음','광택 유지'],
  선명도:['라인 분리 확인']
} };
migrationContext.kcacMigrateQualSmartTagAssignments_(jar);
assert.deepEqual(Array.from(jar.smartTags['표면']), ['기포 없음','광택 유지']);
assert.ok(jar.smartTags['선명도'].includes('크레마 경계 선명'));
assert.ok(jar.smartTags['선명도'].includes('라인 번짐 없음'));

const cleaner = functionSource(assessment, 'kcacCleanPatternSpecificSmartTags_');
assert.match(cleaner, /kcacMigrateQualSmartTagAssignments_\(j\)/);

process.stdout.write('Stage186 KCAC smart-tag taxonomy and draft migration tests passed.\n');
