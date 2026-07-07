#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";

const sqlFile = process.argv[2] || "migration_insert.sql";
const remote = process.argv.includes("--remote");
if (!fs.existsSync(sqlFile)) {
  console.error(`SQL file not found: ${sqlFile}`);
  process.exit(1);
}
const args = ["d1", "execute", "KCL_DB", remote ? "--remote" : "--local", `--file=${sqlFile}`];
const result = spawnSync("wrangler", args, { stdio: "inherit", shell: true });
process.exit(result.status || 0);
