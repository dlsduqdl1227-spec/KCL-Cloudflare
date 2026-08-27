import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const rpc = fs.readFileSync(new URL('../functions/api/rpc.js', import.meta.url), 'utf8');
const assessment = fs.readFileSync(new URL('../public/assessment/index.html', import.meta.url), 'utf8');
const wrangler = fs.readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8');

function functionSource(source, name) {
  const markers = [`async function ${name}(`, `function ${name}(`];
  let start = -1;
  for (const marker of markers) { start = source.indexOf(marker); if (start >= 0) break; }
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

// 무료 플랜 한도 기준과 남은 비율 계산은 D1 행 수(rows) 기준으로 고정합니다.
const ctx = {
  D1_FREE_DAILY_READ_LIMIT: 5_000_000,
  D1_FREE_DAILY_WRITE_LIMIT: 100_000,
  nowIso: () => '2026-08-27T00:30:00.000Z',
  Number,
  Math,
  Date,
};
vm.createContext(ctx);
vm.runInContext([
  functionSource(rpc, 'd1UsageLimit_'),
  functionSource(rpc, 'd1UsageMetric_'),
  functionSource(rpc, 'd1UsageSummary_'),
].join('\n'), ctx);

assert.equal(ctx.d1UsageLimit_('', 100), 100);
assert.equal(ctx.d1UsageLimit_('250', 100), 250);
const metric = ctx.d1UsageMetric_(4_000_000, 5_000_000);
assert.equal(metric.remaining, 1_000_000);
assert.equal(metric.remainingPercent, 20);
const exceeded = ctx.d1UsageMetric_(100_100, 100_000);
assert.equal(exceeded.remaining, 0);
assert.ok(exceeded.usedPercent > 100);
const summary = ctx.d1UsageSummary_('2026-08-27', 4_500_000, 70_000, {}, '2026-08-27T00:30:00.000Z');
assert.equal(summary.read.remainingPercent, 10);
assert.equal(summary.write.remainingPercent, 30);
assert.equal(summary.resetAt, '2026-08-28T00:00:00.000Z');

// 관리자 전용 GraphQL 집계·캐시·마지막 정상 수치 보존이 모두 있어야 합니다.
const dispatch = functionSource(rpc, 'dispatch');
const getUsage = functionSource(rpc, 'getD1DailyUsage');
const analytics = functionSource(rpc, 'fetchD1DailyUsageAnalytics_');
assert.match(dispatch, /getD1DailyUsage/);
assert.match(getUsage, /hasAdmin\(actor\)/);
assert.match(getUsage, /D1_USAGE_ANALYTICS_TOKEN/);
assert.match(getUsage, /d1UsageReadCache_\(day, true\)/);
assert.match(getUsage, /stale:true/);
assert.match(analytics, /rowsRead rowsWritten/);
assert.match(analytics, /api\.cloudflare\.com\/client\/v4\/graphql/);
assert.doesNotMatch(getUsage, /D1_USAGE_ANALYTICS_TOKEN[^\n]*:/, 'analytics token must never be included in response payloads');

assert.match(assessment, /id="d1-usage-card"/);
assert.match(assessment, /function loadD1UsagePanel_/);
assert.match(assessment, /function refreshD1Usage_/);
assert.match(assessment, /getD1DailyUsage\(\{force:!!force\}, adminActorPayload_\(\)\)/);
assert.match(assessment, /읽기 500만 \/ 쓰기 10만 행/);
assert.match(wrangler, /D1_USAGE_ACCOUNT_ID\s*=\s*"8a36d483451bf789cbd72a724f6a842a"/);
assert.match(wrangler, /D1_USAGE_READ_LIMIT\s*=\s*"5000000"/);
assert.match(wrangler, /D1_USAGE_WRITE_LIMIT\s*=\s*"100000"/);

process.stdout.write('Stage189 D1 usage dashboard tests passed.\n');
