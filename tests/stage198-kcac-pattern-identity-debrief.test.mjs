import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const assessment = fs.readFileSync(new URL('../public/assessment/index.html', import.meta.url), 'utf8');
const debriefing = fs.readFileSync(new URL('../public/debriefing/index.html', import.meta.url), 'utf8');

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

const fieldsMatch = assessment.match(/var KCAC_JAR_EVALUATION_STATE_FIELDS_\s*=\s*(\[[\s\S]*?\]);/);
assert.ok(fieldsMatch, 'KCAC evaluation state field list missing');
const context = {
  _kcac:{
    currentIdx:1,
    jars:[
      { type:'qual', patternType:'controlled', scores:{완성도:2.4}, scoreLocks:{완성도:true}, leafCount:'8', smartTags:{완성도:['SLOW 평가']} },
      { type:'qual', patternType:'dynamic', scores:{완성도:4.2}, scoreLocks:{완성도:false}, leafCount:'16', smartTags:{완성도:['FAST 평가']} }
    ]
  }
};
vm.createContext(context);
vm.runInContext(`var KCAC_JAR_EVALUATION_STATE_FIELDS_ = ${fieldsMatch[1]};`, context);
vm.runInContext(functionSource(assessment, 'kcacSwapJarEvaluationState_'), context);
vm.runInContext(functionSource(assessment, 'kcacBoundJarIndex_'), context);

// 물리적인 잔 배정을 뒤집어도 평가 내용은 FAST/SLOW 정체성을 따라갑니다.
context.kcacSwapJarEvaluationState_(context._kcac.jars[0], context._kcac.jars[1]);
context._kcac.jars[0].patternType = 'dynamic';
context._kcac.jars[1].patternType = 'controlled';
assert.equal(context._kcac.jars[0].scores.완성도, 4.2);
assert.equal(context._kcac.jars[0].leafCount, '16');
assert.deepEqual(Array.from(context._kcac.jars[0].smartTags.완성도), ['FAST 평가']);
assert.equal(context._kcac.jars[1].scores.완성도, 2.4);
assert.equal(context._kcac.jars[1].leafCount, '8');

// 배정 변경 후 늦게 도착한 모바일 이벤트도 원래 렌더링된 FAST/SLOW 잔으로 갑니다.
const staleFastElement = { getAttribute:name => name === 'data-kcac-jar-index' ? '1' : name === 'data-kcac-pattern-type' ? 'dynamic' : '' };
assert.equal(context.kcacBoundJarIndex_('1', staleFastElement, 'dynamic'), 0);
assert.equal(context.kcacBoundJarIndex_('1', null, 'controlled'), 1);

const assignmentSource = functionSource(assessment, 'setKcacQualMilkPattern_');
assert.match(assignmentSource, /syncKcacScoresFromDOM_\(\)/);
assert.match(assignmentSource, /kcacSwapJarEvaluationState_\(target, existing\.jar\)/);
assert.match(functionSource(assessment, 'buildKcacScoreSlider_'), /data-kcac-pattern-type/);
assert.match(functionSource(assessment, 'syncKcacLeafCountFromDOM_'), /kcacBoundJarIndex_/);

const scoreCardSource = functionSource(debriefing, 'buildScoreCard');
assert.match(scoreCardSource, /isKcac/);
assert.match(scoreCardSource, /라떼아트 평가 결과/);
assert.ok(scoreCardSource.indexOf('if (isKcac)') < scoreCardSource.indexOf('/technical|테크|기술/'), 'KCAC title must take priority over generic role wording');
const introSource = functionSource(debriefing, 'buildReportIntro');
assert.match(introSource, /라떼아트 공식 평가 결과/);
assert.match(introSource, /FAST·SLOW 로제타/);

process.stdout.write('Stage198 KCAC pattern identity and debrief tests passed.\n');
