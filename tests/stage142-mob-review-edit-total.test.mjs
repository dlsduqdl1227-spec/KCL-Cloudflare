import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const assessment = fs.readFileSync(path.join(root, "public", "assessment", "index.html"), "utf8");
const rpc = fs.readFileSync(path.join(root, "functions", "api", "rpc.js"), "utf8");

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

const card = functionSource(assessment, "ensureReviewOverallCard_");
assert.match(card, /var editable = canReviewEditDetails\(\)/);
assert.match(card, /scheduleReviewAutoSave/);
assert.doesNotMatch(card, /readonly aria-readonly/);

const canEdit = functionSource(assessment, "canReviewEditDetails");
assert.match(canEdit, /c === 'MOB' && isTeamLeaderForCode_\(c\)/);

const totalInfo = functionSource(assessment, "reviewMobTotalInfo_");
assert.match(totalInfo, /var total = dq \? 0 : grossTotal/);
assert.match(totalInfo, /officialTotal = dq \? 0 : Math\.max\(0, roundTotal\(grossTotal - penalty\)\)/);

const canonical = functionSource(rpc, "canonicalScoreForPayload_");
assert.match(canonical, /if \(mobComp\.hasRaw\) return mobComp\.isDq \? 0 : mobComp\.gross/);

const breakdownSource = functionSource(assessment, "mobScoreBreakdown_");
const context = {
  roundScore02: Number,
  roundTotal: value => Math.round(Number(value) * 10) / 10,
  val_: id => id === "mob-end-time" ? "10:20" : "",
  isMobTechnicalOnly_: () => true,
  isMobSensoryOnly_: () => false,
  mobCurrentTimeMs_: () => 620000,
  mobTimePenaltyFromMs_: () => 24,
  isMobTimeDqFromMs_: () => false,
  formatTimerMs_: () => "10분 20.00초",
  MOB_TECH: [{ id:"mob-t1" }, { id:"mob-t2" }, { id:"mob-t3" }],
  MOB_SIG_TECH: [],
  MOB_SENS: [],
  MOB_SIG: [],
  document: {
    getElementById(id) {
      const values = { "mob-menu":"브루잉", "mob-t1":"4.4", "mob-t2":"3.6", "mob-t3":"4.8" };
      if (!(id in values)) return null;
      return { value:values[id] };
    },
  },
};
vm.createContext(context);
vm.runInContext(breakdownSource, context);
const result = context.mobScoreBreakdown_();
assert.equal(result.grossTotal, 12.8);
assert.equal(result.officialTotal, 0, "aggregate ranking score may apply the time penalty later");
assert.equal(result.judgeTotal, 12.8, "technical review must retain the judge attribute subtotal");

process.stdout.write("Stage142 MOB editable review comment and technical total tests passed.\n");
