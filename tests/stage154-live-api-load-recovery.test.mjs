import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const shim = fs.readFileSync(path.join(root, 'public', 'assets', 'kcl-api-shim.js'), 'utf8');
const rpc = fs.readFileSync(path.join(root, 'functions', 'api', 'rpc.js'), 'utf8');

assert.match(shim, /API_MAX_ATTEMPTS = 6/);
assert.match(shim, /408, 425, 429, 500, 502, 503, 504/);
assert.match(shim, /function retryAfterMs_/);
assert.match(rpc, /memoryRateLimit_\(generalKey, 2400, 60\)/);

let requestCount = 0;
const context = {
  window: {},
  navigator: { onLine: true },
  AbortController,
  Proxy,
  console,
  setTimeout: (fn) => { fn(); return 1; },
  clearTimeout: () => {},
  fetch: async () => {
    requestCount += 1;
    if (requestCount <= 2) {
      return { ok:false, status:429, headers:{ get:() => '0' }, text:async () => '{"success":false,"message":"busy"}' };
    }
    if (requestCount <= 5) {
      return { ok:false, status:503, headers:{ get:() => '' }, text:async () => '<html>temporary edge response</html>' };
    }
    return { ok:true, status:200, headers:{ get:() => '' }, text:async () => '{"success":true,"list":[]}' };
  }
};

vm.runInNewContext(shim, context);
const result = await new Promise((resolve, reject) => {
  context.window.google.script.run
    .withSuccessHandler(resolve)
    .withFailureHandler(reject)
    .getReviewList('MOB', {});
});

assert.equal(requestCount, 6, 'a live read must recover through rate limiting and transient HTML responses');
assert.equal(result.success, true);

for (const page of ['assessment', 'registry', 'debriefing', 'admin']) {
  const html = fs.readFileSync(path.join(root, 'public', page, 'index.html'), 'utf8');
  assert.match(html, /kcl-api-shim\.js\?v=stage154/);
}

process.stdout.write('Stage154 live API load recovery tests passed.\n');
