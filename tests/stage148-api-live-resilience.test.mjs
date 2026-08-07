import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rpc = fs.readFileSync(path.join(root, 'functions', 'api', 'rpc.js'), 'utf8');
const shim = fs.readFileSync(path.join(root, 'public', 'assets', 'kcl-api-shim.js'), 'utf8');

assert.match(rpc, /isReadOnlyRpcAction_\(action\)\s*\? memoryRateLimit_/s);
assert.match(rpc, /function memoryRateLimit_/);
assert.match(rpc, /: await rateLimit_\(env, generalKey, 240, 60\)/);
assert.match(shim, /updateReviewRow/);
assert.match(shim, /updateReviewStatusBatch/);
assert.doesNotMatch(shim, /API 응답을 해석하지 못했습니다/);

for (const page of ['assessment', 'registry', 'debriefing', 'admin']) {
  const html = fs.readFileSync(path.join(root, 'public', page, 'index.html'), 'utf8');
  assert.match(html, /kcl-api-shim\.js\?v=stage154/);
}

process.stdout.write('Stage148 live API resilience tests passed.\n');
