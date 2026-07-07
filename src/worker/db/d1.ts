import { hashToken, randomToken, sha256Hex } from "../utils/crypto";
import { normalizePhone, safeStr } from "../utils/validation";

export type Env = {
  DB: D1Database;
  ASSETS?: Fetcher;
  GAS_WEBAPP_URL?: string;
  GAS_SHARED_SECRET?: string;
  OTP_TTL_SECONDS?: string;
  OTP_COOLDOWN_SECONDS?: string;
  SESSION_TTL_SECONDS?: string;
  SOLAPI_API_BASE?: string;
  SOLAPI_API_KEY?: string;
  SOLAPI_API_SECRET?: string;
  SOLAPI_FROM?: string;
};

export type AppContext = {
  env: Env;
  request: Request;
};

export async function phoneHash(phone: unknown): Promise<{ hash: string; last4: string; normalized: string }> {
  const normalized = normalizePhone(phone);
  return {
    normalized,
    hash: normalized ? await sha256Hex(normalized) : "",
    last4: normalized.slice(-4)
  };
}

export function secondsFromEnv(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function isoNow(offsetSeconds = 0): string {
  return new Date(Date.now() + offsetSeconds * 1000).toISOString();
}

export async function createSession(ctx: AppContext, payload: Record<string, unknown>, operatorId?: number | null, type = "judge") {
  const token = randomToken();
  const tokenHash = await hashToken(token);
  const ttl = secondsFromEnv(ctx.env.SESSION_TTL_SECONDS, 21600);
  await ctx.env.DB.prepare(
    `INSERT INTO sessions (token_hash, operator_id, session_type, payload_json, expires_at)
     VALUES (?, ?, ?, ?, ?)`
  ).bind(tokenHash, operatorId || null, type, JSON.stringify(payload), isoNow(ttl)).run();
  return token;
}

export async function getSession(ctx: AppContext, token: unknown) {
  const raw = safeStr(token);
  if (!raw) return null;
  const tokenHash = await hashToken(raw);
  const row = await ctx.env.DB.prepare(
    `SELECT * FROM sessions WHERE token_hash = ? AND expires_at > CURRENT_TIMESTAMP`
  ).bind(tokenHash).first<any>();
  if (!row) return null;
  try {
    return { ...(JSON.parse(row.payload_json || "{}")), id: row.operator_id, sessionType: row.session_type };
  } catch {
    return { id: row.operator_id, sessionType: row.session_type };
  }
}

export async function competitionByCode(ctx: AppContext, code: unknown) {
  const c = safeStr(code).toUpperCase();
  if (!c) return null;
  return ctx.env.DB.prepare(`SELECT * FROM competitions WHERE code = ?`).bind(c).first<any>();
}

export async function logError(ctx: AppContext, source: string, err: unknown, context: Record<string, unknown> = {}) {
  try {
    const e = err instanceof Error ? err : new Error(String(err));
    await ctx.env.DB.prepare(
      `INSERT INTO error_logs (source, message, stack, context_json) VALUES (?, ?, ?, ?)`
    ).bind(source, e.message, e.stack || "", JSON.stringify(context)).run();
  } catch {
    // Last-resort logging must never break the user-facing request.
  }
}
