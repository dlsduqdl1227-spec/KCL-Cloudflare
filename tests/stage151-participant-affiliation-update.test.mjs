import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rpc = fs.readFileSync(path.join(root, 'functions', 'api', 'rpc.js'), 'utf8');

const start = rpc.indexOf('function participantPayloadFromRow_');
const end = rpc.indexOf('function operatorPayloadFromRow_', start);
const source = rpc.slice(start, end);

assert.match(source, /hasOwnProperty\.call\(raw, 'affiliation'\)/);
assert.match(source, /\['소속','affiliation','company','업체명'\]\.forEach/);
assert.match(source, /source\[alias\] = raw\.affiliation/);
assert.ok(source.indexOf("hasOwnProperty.call(raw, 'affiliation')") < source.indexOf('const affiliation ='), 'explicit admin affiliation must be normalized before alias lookup');

process.stdout.write('Stage151 participant affiliation-update tests passed.\n');
