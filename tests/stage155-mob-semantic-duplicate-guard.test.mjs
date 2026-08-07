import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rpc = fs.readFileSync(path.join(root, 'functions', 'api', 'rpc.js'), 'utf8');

const start = rpc.indexOf("if (x.code === 'MOB' && !isCalibrationMode_(x.mode))");
const end = rpc.indexOf("if (x.code === 'KBC')", start);
assert.ok(start > 0 && end > start, 'MOB official duplicate guard must exist before KBC handling');
const guard = rpc.slice(start, end);

assert.match(guard, /competition_code=\? AND round=\? AND role=\? AND unit=\?/);
assert.match(guard, /scoreOwnedByActor_\(row, auth\.actor\)/);
assert.match(guard, /scoreEvaluationCategoryKey_\(row\.mode\) === submittedCategory/);
assert.match(guard, /이미 제출된 MOB 평가입니다/);
assert.match(guard, /duplicateId:existingMob\.id/);

process.stdout.write('Stage155 MOB semantic duplicate guard tests passed.\n');
