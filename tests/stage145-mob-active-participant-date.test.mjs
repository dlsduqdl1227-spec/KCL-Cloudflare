import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rpc = fs.readFileSync(path.join(root, 'functions', 'api', 'rpc.js'), 'utf8');
const assessment = fs.readFileSync(path.join(root, 'public', 'assessment', 'index.html'), 'utf8');

function functionSource(source, name) {
  const marker = `function ${name}(`;
  const start = source.indexOf(marker);
  assert.ok(start >= 0, `${name} function not found`);
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
    else if (ch === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`${name} function incomplete`);
}

const activeDateHelper = functionSource(rpc, 'mobActiveParticipantDateFromConfig_');
assert.match(activeDateHelper, /options\.mobParticipantDate \|\| options\.mobActiveParticipantDate/);
assert.match(activeDateHelper, /normalizeEffectiveDate_/);

const assignments = rpc.slice(rpc.indexOf('async function getParticipantAssignments'), rpc.indexOf('function ikrcAssignmentFieldForRound_'));
assert.match(assignments, /SELECT current_round, option_settings FROM competitions/);
assert.match(assignments, /participantDate !== mobParticipantScopeDate/);
assert.match(assignments, /competitionDate:mobParticipantScopeDate/);

const submit = rpc.slice(rpc.indexOf('async function submitScores'), rpc.indexOf('async function getReviewList'));
assert.match(submit, /mobActiveParticipantDateFromConfig_\(cfg\)/);
assert.match(submit, /validParticipant/);
assert.match(submit, /rowDate === mobParticipantDate/);

assert.match(assessment, /mobParticipantDate/);
assert.match(assessment, /type="date" id="' \+ prefix \+ '-mob-participant-date-/);
assert.match(functionSource(assessment, 'configSelectableOptionsPayload_'), /return \{mobParticipantDate:mobParticipantDate\}/);

process.stdout.write('Stage145 MOB active participant-date tests passed.\n');
