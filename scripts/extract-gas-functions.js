#!/usr/bin/env node
import fs from "node:fs";

const file = process.argv[2];
if (!file) {
  console.error("Usage: node scripts/extract-gas-functions.js /path/to/Code.gs.txt");
  process.exit(1);
}

const src = fs.readFileSync(file, "utf8");
const matches = [];
const re = /^\s*function\s+([A-Za-z0-9_]+)\s*\(/gm;
let m;
while ((m = re.exec(src))) {
  const line = src.slice(0, m.index).split(/\r?\n/).length;
  matches.push({ line, name: m[1], internal: m[1].endsWith("_") });
}
console.log(JSON.stringify(matches, null, 2));
