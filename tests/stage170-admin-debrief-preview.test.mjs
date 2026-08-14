import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rpc = fs.readFileSync(path.join(root, "functions", "api", "rpc.js"), "utf8");
const debriefing = fs.readFileSync(path.join(root, "public", "debriefing", "index.html"), "utf8");
const admin = fs.readFileSync(path.join(root, "public", "admin", "index.html"), "utf8");
const assessment = fs.readFileSync(path.join(root, "public", "assessment", "index.html"), "utf8");
const inlineScript = debriefing.match(/<script>\s*([\s\S]*?)<\/script>\s*<\/body>/);
assert.ok(inlineScript, "debriefing inline script not found");
assert.doesNotThrow(() => new Function(inlineScript[1]), "debriefing preview script must compile in the browser");

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

assert.match(rpc, /getAdminDebriefPreviewOptions:\s*\(\)\s*=>\s*getAdminDebriefPreviewOptions/);
assert.match(rpc, /getAdminDebriefPreview:\s*\(\)\s*=>\s*getAdminDebriefPreview/);
assert.match(functionSource(rpc, "requireAdminPreviewActor_"), /!actor\s*\|\|\s*!hasAdmin\(actor\)/, "preview APIs must reject team leads and judges");
assert.match(functionSource(rpc, "getAdminDebriefPreviewOptions"), /requireAdminPreviewActor_/, "preview option listing must be admin-only");
assert.match(functionSource(rpc, "getAdminDebriefPreviewOptions"), /officialReviewCompleted_/, "preview choices must use each competition's official public-evaluation rule");
const previewServer = functionSource(rpc, "getAdminDebriefPreview");
assert.match(previewServer, /requireAdminPreviewActor_/, "preview result must be admin-only");
assert.match(previewServer, /officialReviewCompleted_/, "preview must mirror the public official-score filter");
assert.match(previewServer, /officialScoreItemsForOutput_/, "preview must use the same official score selection as public debriefing");
assert.doesNotMatch(previewServer, /UPDATE|INSERT|DELETE/, "preview must remain read-only");

assert.match(admin, /\/debriefing\/\?from=admin&amp;preview=1|\/debriefing\/\?from=admin&preview=1/, "admin center must link directly to preview mode");
assert.match(debriefing, /id="admin-preview-box"/, "debriefing page must expose an admin-only preview chooser");
assert.match(functionSource(debriefing, "initializeDebriefPage_"), /refreshAdminActor/, "saved admin sessions must be revalidated by the server");
assert.match(functionSource(debriefing, "initializeDebriefPage_"), /loadDebriefConfig_\(true\)/, "admins must be able to preview open and closed competitions");
assert.match(functionSource(debriefing, "loadAdminDebriefPreviewOptions_"), /getAdminDebriefPreviewOptions/, "competition selection must load previewable participants");
assert.match(functionSource(debriefing, "openAdminDebriefPreview_"), /getAdminDebriefPreview/, "participant selection must load the server-authorized preview");
assert.match(functionSource(debriefing, "renderResult"), /admin-preview-notice/, "rendered preview must be visibly identified as an admin preview");
assert.match(debriefing, /원본 데이터는 변경되지 않습니다/, "preview UI must state that it does not edit evaluation data");
assert.match(functionSource(assessment, "adminRenderRunCards_"), /data-act="debrief-preview"/, "the integrated admin console must expose preview on every competition card");
const consolePreview = functionSource(assessment, "openAdminDebriefPreviewFromConsole_");
assert.match(consolePreview, /isAdminRole\(\)/, "the integrated console shortcut must remain admin-only");
assert.match(consolePreview, /kclAdminActor/, "the integrated console must hand its refreshed admin session to the preview page");
assert.match(consolePreview, /\/debriefing\/\?from=admin&preview=1/, "the integrated console must open admin preview mode");

process.stdout.write("Stage170 administrator debrief preview tests passed.\n");
