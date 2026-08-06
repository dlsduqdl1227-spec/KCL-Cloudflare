import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rpc = fs.readFileSync(path.join(root, 'functions', 'api', 'rpc.js'), 'utf8');

function functionSource(source, name) {
  const start = source.indexOf(`function ${name}`);
  assert.ok(start >= 0, `${name} function not found`);
  const brace = source.indexOf('{', start);
  let depth = 0;
  for (let i = brace; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`${name} function is incomplete`);
}

const context = {
  safeStr: value => value === null || value === undefined ? '' : String(value).trim(),
  participantScheduleSortMeta_: () => ({ scheduled:false, date:'9999-12-31', order:999999, waitingTime:'' }),
};
vm.createContext(context);
vm.runInContext(functionSource(rpc, 'sortParticipantRowsForCompetition_'), context);

const rows = [
  { id:384, competition_code:'IKRC', unique_no:'2', name:'이종현' },
  { id:385, competition_code:'IKRC', unique_no:'3', name:'이준영' },
  { id:386, competition_code:'IKRC', unique_no:'4', name:'정준영' },
  { id:387, competition_code:'IKRC', unique_no:'6', name:'사공혁' },
  { id:388, competition_code:'IKRC', unique_no:'1', name:'김태완' },
  { id:389, competition_code:'IKRC', unique_no:'67', name:'김태민' },
  { id:390, competition_code:'IKRC', unique_no:'7', name:'민철홍' },
  { id:394, competition_code:'IKRC', unique_no:'5', name:'이종훈' },
];
const sorted = context.sortParticipantRowsForCompetition_(rows, 'IKRC');
assert.deepEqual(Array.from(sorted, row => row.unique_no), ['1','2','3','4','5','6','7','67']);
assert.equal(sorted[0].name, '김태완');
assert.match(functionSource(rpc, 'listParticipants'), /sortParticipantRowsForCompetition_/);
assert.match(functionSource(rpc, 'getParticipantAssignments'), /sortParticipantRowsForCompetition_/);

process.stdout.write('Stage144 IKRC participant-number order tests passed.\n');
