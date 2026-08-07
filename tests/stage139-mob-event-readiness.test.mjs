import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const assessment = fs.readFileSync(path.join(root, "public", "assessment", "index.html"), "utf8");
const rpc = fs.readFileSync(path.join(root, "functions", "api", "rpc.js"), "utf8");
const migration = fs.readFileSync(path.join(root, "migrations", "0007_submission_idempotency.sql"), "utf8");

function functionSource(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} function not found`);
  const open = source.indexOf("{", start);
  let depth = 0, quote = "", escaped = false;
  for (let i = open; i < source.length; i += 1) {
    const ch = source[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === quote) quote = "";
      continue;
    }
    if (ch === "'" || ch === '"' || ch === "`") { quote = ch; continue; }
    if (ch === "{") depth += 1;
    if (ch === "}" && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`${name} function incomplete`);
}

const mobSubmit = functionSource(assessment, "mobSubmit");
assert.match(mobSubmit, /if \(_mobSubmitting\)/, "MOB submit button must be guarded while a request is pending");
assert.match(mobSubmit, /clientSubmissionId:\s*_mobClientSubmissionId/, "MOB must send a stable submission id");
assert.match(mobSubmit, /kclClearActiveEvalDraftAfterSubmit\(\{competitionCode:'MOB'\}\)/, "successful MOB submission must clear only the MOB draft");
assert.match(mobSubmit, /같은 제출 버튼을 다시 누르면 중복 없이/, "network retry guidance must preserve the same submission id");

const buildDraft = functionSource(assessment, "kclBuildDraftState_");
const restoreDraft = functionSource(assessment, "kclRestoreDraftForCode_");
assert.match(buildDraft, /state\.mobClientSubmissionId = _mobClientSubmissionId/, "MOB draft must persist its submission id");
assert.match(restoreDraft, /_mobClientSubmissionId = draft\.state\.mobClientSubmissionId/, "restoring MOB draft must restore its submission id");

const draftContextSource = functionSource(assessment, "kclDraftContextKey_");
const context = {
  _evaluationPurpose: { type:"competition", scope:"" },
  _cupping: { station:{ id:"KCR-A" } },
  _ikrcStation: { id:"IKRC-A" },
  kclActiveEvalCode_: () => "",
};
vm.createContext(context);
vm.runInContext(draftContextSource, context);
const kcrOfficial = context.kclDraftContextKey_("KCR");
context._evaluationPurpose = { type:"calibration", scope:"team" };
const kcrCalibration = context.kclDraftContextKey_("KCR");
assert.notEqual(kcrOfficial, kcrCalibration, "official and calibration drafts must be isolated");
context._cupping.station.id = "KCR-B";
assert.notEqual(kcrCalibration, context.kclDraftContextKey_("KCR"), "station drafts must be isolated");

const assignments = functionSource(rpc, "getParticipantAssignments");
assert.match(assignments, /code !== 'MOB' \|\| mobManager \? sourceRows : sourceRows\.filter/, "MOB judge assignments must be filtered");
assert.match(assignments, /participantDate !== mobParticipantScopeDate/, "MOB active or dated permission must filter the timetable date");
assert.match(assignments, /mobTeamMatchesServer_\(mobActorTeam, participantTeam\)/, "MOB team permission must filter the timetable team");
assert.match(assignments, /actorCanSeeParticipantIdentity_\(actor, code\)/, "participant identity access must use the selected competition");

const receipt = functionSource(rpc, "scoreSubmissionReceipt_");
assert.match(receipt, /COMPETITION_CODES\.includes/, "submission receipts must cover every competition independently");
assert.match(rpc, /INSERT OR IGNORE/, "score insertion must tolerate a concurrent retry");
assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS idx_scores_client_submission_unit/);
assert.match(migration, /competition_code, judge_name/);
assert.match(migration, /clientSubmissionId/);

process.stdout.write("Stage139 MOB event readiness tests passed.\n");
