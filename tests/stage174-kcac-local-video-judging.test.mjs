import assert from 'node:assert/strict';
import fs from 'node:fs';

const assessment = fs.readFileSync(new URL('../public/assessment/index.html', import.meta.url), 'utf8');
const rpc = fs.readFileSync(new URL('../functions/api/rpc.js', import.meta.url), 'utf8');

function functionSource(source, name) {
  const start = source.indexOf(`function ${name}(`);
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

assert.doesNotMatch(assessment, /id="kcac-submission-link(?:-wrap)?"/);
assert.doesNotMatch(assessment, /예선 제출 자료|원테이크 영상 1개와 FAST\/SLOW 스크린샷 확인용 URL/);
assert.doesNotMatch(assessment, /function kcacSubmissionUrl_|function onKcacSubmissionLinkInput_/);

const validation = functionSource(assessment, 'validateKcacBeforeSubmit_');
assert.doesNotMatch(validation, /제출 영상|자료 링크|kcacSubmissionUrl_/);

const submit = functionSource(assessment, 'kcacSubmitAll');
assert.doesNotMatch(submit, /kcacSubmissionUrl_|예선영상URL|제출영상URL|영상제출확인/);
assert.match(submit, /'', j\.comment \|\| ''/, 'legacy guide URL column must remain blank so existing positional score columns stay aligned');

assert.match(rpc, /'가이드URL'/, 'legacy KCAC header position must remain for old score compatibility');

process.stdout.write('Stage174 KCAC local-video judging tests passed.\n');
