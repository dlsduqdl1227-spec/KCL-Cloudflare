import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const rpc = fs.readFileSync(new URL('../functions/api/rpc.js', import.meta.url), 'utf8');

function functionSource(source, name) {
  const markers = [`async function ${name}(`, `function ${name}(`];
  let start = -1;
  for (const marker of markers) {
    start = source.indexOf(marker);
    if (start >= 0) break;
  }
  assert.ok(start >= 0, `${name} function missing`);
  const open = source.indexOf('{', start);
  let depth = 0;
  let quote = '';
  let escaped = false;
  for (let index = open; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === "'" || char === '"' || char === '`') { quote = char; continue; }
    if (char === '{') depth += 1;
    if (char === '}' && --depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`${name} function incomplete`);
}

const KCL_ID = '503c0f26-389c-480c-b109-d5e53de8fc71';
const THECUP_ID = '40d049eb-3cf2-4906-a5ce-c40d2dd63c34';
let requestBody;
const context = {
  D1_FREE_DAILY_READ_LIMIT: 5_000_000,
  D1_FREE_DAILY_WRITE_LIMIT: 100_000,
  D1_PAID_CYCLE_READ_LIMIT: 25_000_000_000,
  D1_PAID_CYCLE_WRITE_LIMIT: 50_000_000,
  D1_USAGE_DEFAULT_PLAN: 'workers_paid',
  D1_USAGE_DEFAULT_CYCLE_START_DAY: 2,
  D1_USAGE_DEFAULT_ACCOUNT_ID: 'account',
  D1_USAGE_DEFAULT_KCL_DATABASE_ID: KCL_ID,
  D1_USAGE_DEFAULT_THECUP_DATABASE_ID: THECUP_ID,
  nowIso: () => '2026-09-03T01:00:00.000Z',
  safeStr: value => value == null ? '' : String(value),
  fetch: async (_url, options) => {
    requestBody = JSON.parse(options.body);
    return {
      ok: true,
      json: async () => ({
        data: { viewer: { accounts: [{ d1AnalyticsAdaptiveGroups: [
          { dimensions: { databaseId: KCL_ID, date: '2026-09-02' }, sum: { rowsRead: 100, rowsWritten: 10 } },
          { dimensions: { databaseId: KCL_ID, date: '2026-09-03' }, sum: { rowsRead: 200, rowsWritten: 20 } },
          { dimensions: { databaseId: THECUP_ID, date: '2026-09-03' }, sum: { rowsRead: 300, rowsWritten: 30 } },
          { dimensions: { databaseId: 'old-db', date: '2026-09-03' }, sum: { rowsRead: 400, rowsWritten: 40 } },
        ] }] } },
      }),
    };
  },
};
vm.createContext(context);
vm.runInContext([
  'const D1_USAGE_DEFAULT_KCL_DATABASE_ID = ' + JSON.stringify(KCL_ID) + ';',
  'const D1_USAGE_DEFAULT_THECUP_DATABASE_ID = ' + JSON.stringify(THECUP_ID) + ';',
  functionSource(rpc, 'd1UsageLimit_'),
  functionSource(rpc, 'd1UsagePlan_'),
  functionSource(rpc, 'd1UsageCycleStartDay_'),
  functionSource(rpc, 'd1UsagePeriod_'),
  functionSource(rpc, 'd1UsageLimits_'),
  functionSource(rpc, 'd1UsageMetric_'),
  functionSource(rpc, 'd1UsageSummary_'),
  functionSource(rpc, 'd1UsageDatabaseDefinitions_'),
  functionSource(rpc, 'fetchD1DailyUsageAnalytics_'),
].join('\n'), context);

const period = { plan: 'workers_paid', label: '청구 주기', startDate: '2026-09-02', endDate: '2026-09-03', resetAt: '2026-10-02T00:00:00.000Z' };
const usage = await context.fetchD1DailyUsageAnalytics_({ D1_USAGE_ANALYTICS_TOKEN: 'secret' }, period);
assert.equal(usage.read.used, 1_000);
assert.equal(usage.write.used, 100);
assert.deepEqual(JSON.parse(JSON.stringify(usage.today)), { utcDate: '2026-09-03', read: 900, write: 90 });
assert.equal(usage.databaseUsage.find(row => row.key === 'kcl').periodRead, 300);
assert.equal(usage.databaseUsage.find(row => row.key === 'thecup').todayWrite, 30);
assert.equal(usage.databaseUsage.find(row => row.key === 'other').periodRead, 400);
assert.match(requestBody.query, /dimensions \{ databaseId date \}/);

process.stdout.write('Stage199 D1 account breakdown tests passed.\n');
