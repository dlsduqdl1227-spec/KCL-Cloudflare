import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const shim = fs.readFileSync(path.join(root, 'public', 'assets', 'kcl-api-shim.js'), 'utf8');

assert.match(shim, /function isRetrySafeAction_/);
assert.match(shim, /function callRpcOnce_/);
assert.match(shim, /parseError\.retryable = true/);
assert.match(shim, /callRpcOnce_\(action, args, attempt\).*retryDelay_/s);
assert.match(shim, /'submitScores', 'submitWithSignature'/);
assert.match(shim, /API_MAX_ATTEMPTS = 6/);
assert.match(shim, /retryable = \[.*429/);

let requestCount = 0;
const context = {
  window: {},
  navigator: { onLine: true },
  AbortController,
  Proxy,
  console,
  setTimeout,
  clearTimeout,
  fetch: async () => {
    requestCount += 1;
    if (requestCount === 1) return { ok:false, status:502, text:async () => '<html>temporary edge error</html>' };
    return { ok:true, status:200, text:async () => '{"success":true,"configs":[]}' };
  },
};
vm.runInNewContext(shim, context);
const result = await new Promise((resolve, reject) => {
  context.window.google.script.run
    .withSuccessHandler(resolve)
    .withFailureHandler(reject)
    .getConfig();
});
assert.equal(requestCount, 2, 'a safe read must retry one transient non-JSON response');
assert.equal(result.success, true);

let extendedRequestCount = 0;
context.fetch = async () => {
  extendedRequestCount += 1;
  if (extendedRequestCount < 4) return { ok:false, status:503, text:async () => '<html>temporary edge error</html>' };
  return { ok:true, status:200, text:async () => '{"success":true,"list":[]}' };
};
const extendedResult = await new Promise((resolve, reject) => {
  context.window.google.script.run
    .withSuccessHandler(resolve)
    .withFailureHandler(reject)
    .getReviewList('MOB', {});
});
assert.equal(extendedRequestCount, 4, 'a live review read must survive three consecutive transient edge responses');
assert.equal(extendedResult.success, true);

process.stdout.write('Stage146 API response retry tests passed.\n');
