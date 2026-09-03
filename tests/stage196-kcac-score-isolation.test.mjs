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

const sliderSource = functionSource(assessment, 'buildKcacScoreSlider_');
assert.match(sliderSource, /data-kcac-jar-index/);
assert.match(sliderSource, /oninput="onKcacScore\([\s\S]*data-kcac-jar-index/);
assert.match(sliderSource, /onchange="normalizeRangeStepValue_\(this\);onKcacScore\([\s\S]*data-kcac-jar-index/);
assert.match(functionSource(assessment, 'saveKcacJarFromDOM'), /syncKcacScoresFromDOM_\(\)/);

const scoreValue = { textContent:'2.20' };
const scoreDesc = { textContent:'기준점' };
const context = {
  _kcac:{
    currentIdx:1,
    jars:[
      { patternType:'dynamic', scores:{ 완성도:3.0 }, scoreLocks:{} },
      { patternType:'controlled', scores:{ 완성도:2.2 }, scoreLocks:{} }
    ]
  },
  document:{
    getElementById:id => id === 'kcac-v-완성도' ? scoreValue : id === 'kcac-d-완성도' ? scoreDesc : null,
    querySelectorAll:()=>[]
  },
  quantizeScoreStep_:(value, step, min, max)=>Number(Math.max(min, Math.min(max, Math.round(Number(value) / step) * step)).toFixed(1)),
  fmtScore:value=>Number(value).toFixed(1),
  kcacGetDesc:()=> '점수 설명',
  scheduleKcacFinalUpdate_:()=>{},
  refreshKcacCommentReference_:()=>{},
  scheduleKcacCupNav:()=>{}
};
vm.createContext(context);
vm.runInContext(functionSource(assessment, 'kcacBoundJarIndex_'), context);
vm.runInContext(functionSource(assessment, 'onKcacScore'), context);

const delayedFastSlider = { value:'4.4', getAttribute:name => name === 'data-kcac-jar-index' ? '0' : name === 'data-score-step' ? '0.2' : '' };
context.onKcacScore('완성도', '4.4', true, delayedFastSlider, '0');
assert.equal(context._kcac.jars[0].scores['완성도'], 4.4, 'a delayed FAST event must update only the FAST cup that rendered it');
assert.equal(context._kcac.jars[1].scores['완성도'], 2.2, 'a delayed FAST event must never copy into the currently open SLOW cup');
assert.equal(scoreValue.textContent, '2.20', 'a stale FAST event must not redraw the visible SLOW score');

const slowSlider = { value:'2.8', getAttribute:name => name === 'data-kcac-jar-index' ? '1' : name === 'data-score-step' ? '0.2' : '' };
context.onKcacScore('완성도', '2.8', true, slowSlider, '1');
assert.equal(context._kcac.jars[0].scores['완성도'], 4.4);
assert.equal(context._kcac.jars[1].scores['완성도'], 2.8, 'SLOW must keep its own independently entered score');
assert.equal(scoreValue.textContent, '2.8');

const domFast = {
  value:'3.6',
  getAttribute:name => name === 'data-kcac-jar-index' ? '0' : name === 'data-kcac-score' ? '균형' : name === 'data-score-step' ? '0.2' : ''
};
context.document.querySelectorAll = () => [domFast];
vm.runInContext(functionSource(assessment, 'syncKcacScoresFromDOM_'), context);
context.syncKcacScoresFromDOM_();
assert.equal(context._kcac.jars[0].scores['균형'], 3.6, 'DOM synchronization must honor the slider-bound cup index');
assert.equal(context._kcac.jars[1].scores['균형'], undefined, 'DOM synchronization must not leak a FAST score into SLOW');

process.stdout.write('Stage196 KCAC FAST/SLOW score isolation tests passed.\n');
