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

const versions = new Set();
for (const page of ['assessment', 'registry', 'debriefing', 'admin']) {
  const html = fs.readFileSync(path.join(root, 'public', page, 'index.html'), 'utf8');
  const matches = [...html.matchAll(/kcl-api-shim\.js\?v=stage(\d+)/g)];
  assert.equal(matches.length, 1, page + ' uses one versioned API client');
  assert.ok(Number(matches[0][1]) >= 154);
  versions.add(matches[0][1]);
}
assert.equal(versions.size, 1, 'every page must use the same API recovery implementation');

process.stdout.write('Stage148 live API resilience tests passed.\n');
