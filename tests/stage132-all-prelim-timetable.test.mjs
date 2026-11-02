import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rpc = fs.readFileSync(path.join(root, "functions", "api", "rpc.js"), "utf8");
const registry = fs.readFileSync(path.join(root, "public", "registry", "index.html"), "utf8");

assert.match(rpc, /const scheduleLabel = code==='KBC'/);
assert.match(rpc, /competitionDate \|\| operatingDay/);
// KTCC finals show team names only. All other assignment labels retain the date.
assert.match(rpc, /display: code==='KTCC'&&currentRound!=='예선'/);
assert.match(rpc, /: [^\n]*\(scheduleLabel \? \(scheduleLabel \+ ' · '\) : ''\)/);
assert.match(registry, /function participantScheduleText_\(r\)/);
assert.match(registry, /ex\['운영일차'\]/);
assert.match(registry, /ex\['경연순서'\]/);
assert.match(registry, /ex\['스테이션번호'\]/);
assert.match(registry, /예선 일정/);
assert.match(registry, /r\.teamName\|\|r\.name/);
assert.match(registry, /ex\['팀장 휴대전화'\]/);

process.stdout.write("Stage132 all-competition preliminary timetable display tests passed.\n");
