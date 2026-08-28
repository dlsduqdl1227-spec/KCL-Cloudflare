import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const assessment = fs.readFileSync(new URL('../public/assessment/index.html', import.meta.url), 'utf8');
const rpc = fs.readFileSync(new URL('../functions/api/rpc.js', import.meta.url), 'utf8');
const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

function functionSource(source, name) {
  const marker = `function ${name}(`;
  const start = source.indexOf(marker);
  assert.ok(start >= 0, `${name} function missing`);
  const brace = source.indexOf('{', start);
  let depth = 0;
  for (let i = brace; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`Could not read ${name}`);
}

const elements = {
  'ktcc-end-min': { value: '8' },
  'ktcc-end-sec': { value: '0' },
  'ktcc-end-centi': { value: '5' }
};
const ctx = {
  Math, Number, String, parseInt, parseFloat, isFinite,
  document: { getElementById: (id) => elements[id] || null }
};
vm.createContext(ctx);
vm.runInContext([
  functionSource(assessment, 'pad2_'),
  functionSource(assessment, 'parseElapsedSeconds_'),
  functionSource(assessment, 'parseKtccTimeSeconds_'),
  functionSource(assessment, 'formatKtccElapsedTime_'),
  functionSource(assessment, 'normalizeKtccElapsedTimeDisplay_'),
  functionSource(assessment, 'setKtccSplitTimeInputs_'),
  functionSource(assessment, 'isKtccTimeOverLimit_'),
  functionSource(assessment, 'getKtccEndTimeValue_')
].join('\n'), ctx);

assert.equal(ctx.parseKtccTimeSeconds_('08분 00.05초'), 480.05);
assert.equal(ctx.parseKtccTimeSeconds_('08분 00초 05'), 480.05);
assert.equal(ctx.formatKtccElapsedTime_(480.05), '08분 00.05초');
assert.equal(ctx.normalizeKtccElapsedTimeDisplay_('8:00.05'), '08분 00.05초');
assert.equal(ctx.getKtccEndTimeValue_(), '08분 00.05초');
assert.equal(ctx.isKtccTimeOverLimit_('08분 00.00초'), false);
assert.equal(ctx.isKtccTimeOverLimit_('08분 00.01초'), true);
ctx.setKtccSplitTimeInputs_('07분 12.34초');
assert.equal(elements['ktcc-end-min'].value, '7');
assert.equal(elements['ktcc-end-sec'].value, '12');
assert.equal(elements['ktcc-end-centi'].value, '34');

const rpcCtx = { Number, String, Math, safeStr: (value) => String(value == null ? '' : value).trim() };
vm.createContext(rpcCtx);
vm.runInContext([
  functionSource(rpc, 'itemEndTimeSeconds_'),
  functionSource(rpc, 'formatKtccEndTime_')
].join('\n'), rpcCtx);
assert.equal(rpcCtx.itemEndTimeSeconds_({ '종료시간': '08분 00.05초' }), 480.05);
assert.equal(rpcCtx.formatKtccEndTime_(480.05), '08분 00.05초');

assert.match(assessment, /id="ktcc-end-centi"/);
assert.match(assessment, /분·초·1\/100초까지 입력/);
assert.match(assessment, /normalizeKtccElapsedTimeDisplay_\(el\.value\)/);
assert.match(rpc, /function formatKtccEndTime_/);
assert.match(pkg.scripts.posttest, /stage193-ktcc-centisecond-time\.test\.mjs/);

process.stdout.write('Stage193 KTCC centisecond time tests passed.\n');
