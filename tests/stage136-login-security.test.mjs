import assert from "node:assert/strict";
import fs from "node:fs";

const assessmentPath = new URL("../public/assessment/index.html", import.meta.url);
const rpcPath = new URL("../functions/api/rpc.js", import.meta.url);
const migrationPath = new URL("../migrations/0006_login_security.sql", import.meta.url);
const html = fs.readFileSync(assessmentPath, "utf8");
const rpc = fs.readFileSync(rpcPath, "utf8");
const migration = fs.readFileSync(migrationPath, "utf8");

function functionBody(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} 함수가 필요합니다`);
  const brace = source.indexOf("{", start);
  let depth = 0;
  for (let i = brace; i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    if (source[i] === "}") depth -= 1;
    if (depth === 0) return source.slice(start, i + 1);
  }
  assert.fail(`${name} 함수 본문을 찾지 못했습니다`);
}

assert.match(html, /id="inp-security-code"/);
assert.match(html, /id="login-security-card"/);
assert.match(html, /id="login-security-code"/);
assert.match(html, /id="login-security-confirm"/);
assert.match(html, /id="login-security-delete"/);

const loginBody = functionBody(html, "doLogin");
assert.match(loginBody, /inp-security-code/);
assert.match(loginBody, /\.judgeLogin\(name, phone, securityCode\)/);
const logoutBody = functionBody(html, "doLogout");
assert.match(logoutBody, /inp-security-code/);

assert.match(functionBody(html, "loadAdminPanel"), /loadLoginSecurityStatus_\(\)/);
assert.match(functionBody(html, "saveLoginSecurityCode_"), /setLoginSecurityCode/);
assert.match(functionBody(html, "deleteLoginSecurityCode_"), /deleteLoginSecurityCode/);

const serverLoginBody = functionBody(rpc, "judgeLogin");
assert.match(serverLoginBody, /verifyLoginSecurityCode_/);
assert.match(functionBody(rpc, "getLoginSecurityStatus"), /hasAdmin\(actor\)/);
assert.match(functionBody(rpc, "setLoginSecurityCode"), /hasAdmin\(actor\)/);
assert.match(functionBody(rpc, "deleteLoginSecurityCode"), /hasAdmin\(actor\)/);
const deriveBody = functionBody(rpc, "deriveLoginSecurityHash_");
assert.match(deriveBody, /PBKDF2/);
assert.match(deriveBody, /SHA-256/);
assert.match(deriveBody, /100000/);
assert.match(rpc, /crypto\.getRandomValues\(salt\)/);
assert.match(migration, /CREATE TABLE IF NOT EXISTS system_settings/);

process.stdout.write("Stage136 managed login security checks passed.\n");
