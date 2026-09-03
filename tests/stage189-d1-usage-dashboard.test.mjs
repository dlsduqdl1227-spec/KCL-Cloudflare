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

// Workers Paid 계정은 청구 주기 포함량(읽기 250억 / 쓰기 5천만 행) 기준으로 표시합니다.
const ctx = {
  D1_FREE_DAILY_READ_LIMIT: 5_000_000,
  D1_FREE_DAILY_WRITE_LIMIT: 100_000,
  D1_PAID_CYCLE_READ_LIMIT: 25_000_000_000,
  D1_PAID_CYCLE_WRITE_LIMIT: 50_000_000,
  D1_USAGE_DEFAULT_PLAN: 'workers_paid',
  D1_USAGE_DEFAULT_CYCLE_START_DAY: 2,
  nowIso: () => '2026-08-27T00:30:00.000Z',
  safeStr: value => value == null ? '' : String(value),
  Number,
  Math,
  Date,
};
vm.createContext(ctx);
vm.runInContext([
  functionSource(rpc, 'd1UsageLimit_'),
  functionSource(rpc, 'd1UsagePlan_'),
  functionSource(rpc, 'd1UsageCycleStartDay_'),
  functionSource(rpc, 'd1UsagePeriod_'),
  functionSource(rpc, 'd1UsageLimits_'),
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
const period = ctx.d1UsagePeriod_({}, new Date('2026-08-27T00:30:00.000Z'));
assert.equal(period.startDate, '2026-08-02');
assert.equal(period.endDate, '2026-08-27');
assert.equal(period.resetAt, '2026-09-02T00:00:00.000Z');
const summary = ctx.d1UsageSummary_(period, 2_460_000, 83_220, {}, '2026-08-27T00:30:00.000Z');
assert.equal(summary.plan, 'workers_paid');
assert.equal(summary.read.limit, 25_000_000_000);
assert.equal(summary.write.limit, 50_000_000);
assert.ok(summary.read.remainingPercent > 99.9);
assert.ok(summary.write.remainingPercent > 99.8);

// 관리자 전용 GraphQL 집계·캐시·마지막 정상 수치 보존이 모두 있어야 합니다.
const dispatch = functionSource(rpc, 'dispatch');
const getUsage = functionSource(rpc, 'getD1DailyUsage');
const analytics = functionSource(rpc, 'fetchD1DailyUsageAnalytics_');
assert.match(dispatch, /getD1DailyUsage/);
assert.match(getUsage, /hasAdmin\(actor\)/);
assert.match(getUsage, /D1_USAGE_ANALYTICS_TOKEN/);
assert.match(getUsage, /d1UsageReadCache_\(period, true\)/);
assert.match(getUsage, /stale:true/);
assert.match(analytics, /rowsRead rowsWritten/);
assert.match(analytics, /dimensions \{ databaseId date \}/);
assert.match(analytics, /databaseUsage/);
assert.match(analytics, /api\.cloudflare\.com\/client\/v4\/graphql/);
assert.doesNotMatch(getUsage, /D1_USAGE_ANALYTICS_TOKEN[^\n]*:/, 'analytics token must never be included in response payloads');

assert.match(assessment, /id="d1-usage-card"/);
assert.match(assessment, /function loadD1UsagePanel_/);
assert.match(assessment, /function refreshD1Usage_/);
assert.match(assessment, /getD1DailyUsage\(\{force:!!force\}, adminActorPayload_\(\)\)/);
assert.match(assessment, /D1 계정 사용량/);
assert.match(assessment, /계정 한도는 합산하고, KCL·더컵 사용량은 DB별로 분리해 표시합니다/);
assert.match(assessment, /오늘 사용량 \/ 현재 청구 주기 누적/);
assert.match(wrangler, /D1_USAGE_ACCOUNT_ID\s*=\s*"8a36d483451bf789cbd72a724f6a842a"/);
assert.match(wrangler, /D1_USAGE_PLAN\s*=\s*"workers_paid"/);
assert.match(wrangler, /D1_USAGE_READ_LIMIT\s*=\s*"25000000000"/);
assert.match(wrangler, /D1_USAGE_WRITE_LIMIT\s*=\s*"50000000"/);
assert.match(wrangler, /D1_USAGE_KCL_DATABASE_ID\s*=\s*"503c0f26-389c-480c-b109-d5e53de8fc71"/);
assert.match(wrangler, /D1_USAGE_THECUP_DATABASE_ID\s*=\s*"40d049eb-3cf2-4906-a5ce-c40d2dd63c34"/);

process.stdout.write('Stage189 D1 usage dashboard tests passed.\n');
