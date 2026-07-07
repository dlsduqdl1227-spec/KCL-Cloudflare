#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const outDir = process.argv[2] || "d1-export";
const remote = process.argv.includes("--remote");
fs.mkdirSync(outDir, { recursive: true });

const tables = [
  "competitions",
  "operators",
  "operator_permissions",
  "participants",
  "participant_identifiers",
  "submissions",
  "submission_values",
  "review_events",
  "otp_codes",
  "debrief_tokens",
  "sms_logs",
  "ikrc_seed_matches",
  "ikrc_seed_results",
  "ikrc_calibration_checks",
  "mob_calibration_checks"
];

for (const table of tables) {
  const sql = `SELECT * FROM ${table};`;
  const args = ["d1", "execute", "KCL_DB", remote ? "--remote" : "--local", "--json", `--command=${sql}`];
  const result = spawnSync("wrangler", args, { encoding: "utf8", shell: true });
  if (result.status !== 0) {
    console.error(result.stderr || result.stdout);
    process.exit(result.status || 1);
  }
  const parsed = JSON.parse(result.stdout || "[]");
  const rows = parsed[0]?.results || [];
  const headers = rows.length ? Object.keys(rows[0]) : [];
  const csv = [headers.join(",")].concat(rows.map((row) => headers.map((h) => csvCell(row[h])).join(","))).join("\n");
  fs.writeFileSync(path.join(outDir, `${table}.csv`), csv + "\n", "utf8");
}

function csvCell(value) {
  if (value == null) return "";
  const s = String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
