import { AppContext, phoneHash } from "../db/d1";
import { makeSolapiSignature, randomToken } from "../utils/crypto";
import { normalizePhone, safeStr } from "../utils/validation";

export async function sendSMS(ctx: AppContext, to: unknown, text: unknown) {
  const apiKey = safeStr(ctx.env.SOLAPI_API_KEY);
  const secret = safeStr(ctx.env.SOLAPI_API_SECRET);
  const from = normalizePhone(ctx.env.SOLAPI_FROM);
  const toNum = normalizePhone(to);
  const ph = await phoneHash(toNum);
  if (!apiKey || !secret || !from) {
    return { success: false, message: "SMS 설정값이 없습니다. wrangler secret에 SOLAPI_API_KEY, SOLAPI_API_SECRET, SOLAPI_FROM을 등록해주세요." };
  }
  if (!/^0\d{8,10}$/.test(from)) return { success: false, message: "발신번호 형식이 올바르지 않습니다." };
  if (!/^0\d{8,10}$/.test(toNum)) return { success: false, message: "수신번호 형식이 올바르지 않습니다." };
  const date = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const salt = randomToken();
  const signature = await makeSolapiSignature(secret, date, salt);
  const response = await fetch(`${ctx.env.SOLAPI_API_BASE || "https://api.solapi.com"}/messages/v4/send-many/detail`, {
    method: "POST",
    headers: {
      "content-type": "application/json; charset=utf-8",
      "authorization": `HMAC-SHA256 apiKey=${apiKey}, date=${date}, salt=${salt}, signature=${signature}`
    },
    body: JSON.stringify({ messages: [{ to: toNum, from, text: safeStr(text) }] })
  });
  const body = await response.text();
  const success = response.status >= 200 && response.status < 300;
  await ctx.env.DB.prepare(
    `INSERT INTO sms_logs (provider, to_phone_hash, to_phone_last4, message_preview, provider_status, provider_body, success, error_message)
     VALUES ('SOLAPI', ?, ?, ?, ?, ?, ?, ?)`
  ).bind(ph.hash, ph.last4, safeStr(text).slice(0, 80), response.status, body, success ? 1 : 0, success ? "" : body.slice(0, 500)).run();
  if (!success) return { success: false, message: `HTTP ${response.status} / ${body}` };
  return { success: true, statusCode: response.status, body };
}
