import assert from 'node:assert/strict';
import fs from 'node:fs';

const rpc = fs.readFileSync(new URL('../functions/api/rpc.js', import.meta.url), 'utf8');
const migration = fs.readFileSync(new URL('../migrations/0009_query_plan_indexes.sql', import.meta.url), 'utf8');
const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

// Indexes are limited to three observed full-scan query paths. Score/OTP indexes already exist.
for (const definition of [
  /idx_operators_phone_id\s+ON operators\(phone, id\)/,
  /idx_sessions_expires_at\s+ON sessions\(expires_at\)/,
  /idx_participants_comp_phone_id\s+ON participants\(competition_code, phone, id\)/
]) {
  assert.match(migration, definition);
}
for (const indexName of ['idx_operators_phone_id', 'idx_sessions_expires_at', 'idx_participants_comp_phone_id']) {
  assert.match(rpc, new RegExp("'" + indexName + "'"));
  assert.match(rpc, new RegExp('CREATE INDEX IF NOT EXISTS ' + indexName));
}
assert.doesNotMatch(migration, /DROP\s+INDEX|DROP\s+TABLE|DELETE\s+FROM/i, 'index migration must not remove production data');
assert.match(pkg.scripts.posttest, /stage190-d1-query-plan-indexes\.test\.mjs/);

process.stdout.write('Stage190 D1 query-plan index tests passed.\n');
