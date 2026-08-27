import assert from 'node:assert/strict';
import fs from 'node:fs';

const assessment = fs.readFileSync(new URL('../public/assessment/index.html', import.meta.url), 'utf8');
const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

// Desktop에서는 새로고침 버튼이 100% 너비를 차지해 제목 영역을 한 글자 폭으로
// 압축하지 않아야 하며, 모바일에서는 사용량 지표가 한 열로 자연스럽게 전환됩니다.
assert.match(assessment, /\.d1-usage-head>div\{flex:1 1 auto;min-width:0\}/);
assert.match(assessment, /\.d1-usage-refresh\{width:auto!important;min-width:96px/);
assert.match(assessment, /\.d1-usage-grid\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
assert.match(assessment, /@media\(max-width:560px\)\{\.d1-usage-head\{display:block\}/);
assert.match(assessment, /\.d1-usage-grid\{grid-template-columns:1fr\}/);
assert.match(assessment, /font-size:clamp\(16px,1\.6vw,20px\)/);
assert.match(pkg.scripts.posttest, /stage192-d1-responsive-layout\.test\.mjs/);

process.stdout.write('Stage192 D1 responsive layout tests passed.\n');
