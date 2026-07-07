import { AppContext, competitionByCode, isoNow, phoneHash, secondsFromEnv } from "../db/d1";
import { hashToken, otpHash, randomToken } from "../utils/crypto";
import { normalizePhone, safeStr } from "../utils/validation";
import { sendSMS } from "./sms";

export async function sendOTP(ctx: AppContext, name: unknown, phone: unknown, competitionCode: unknown, affiliation?: unknown) {
  const inputName = safeStr(name);
  const inputPhone = normalizePhone(phone);
  const code = safeStr(competitionCode).toUpperCase();
  if (!inputName) return { success: false, message: code === "KTCC" ? "팀명을 입력해주세요." : "이름을 입력해주세요." };
  if (!inputPhone || inputPhone.length < 9) return { success: false, message: "연락처를 숫자만 정확히 입력해주세요." };
  const comp = await competitionByCode(ctx, code);
  if (!comp) return { success: false, message: "등록되지 않은 대회입니다." };
  if (!comp.debriefing_enabled) return { success: false, message: "아직 디브리핑이 오픈되지 않았습니다." };
  const ph = await phoneHash(inputPhone);
  const participant = await ctx.env.DB.prepare(
    `SELECT * FROM participants WHERE competition_id = ? AND (name = ? OR team_name = ?) AND phone_hash = ?`
  ).bind(comp.id, inputName, inputName, ph.hash).first<any>();
  if (!participant) return { success: false, message: "등록된 선수 정보를 찾을 수 없습니다. 대회, 이름, 연락처를 확인해주세요." };
  if (safeStr(affiliation) && participant.affiliation && safeStr(affiliation) !== participant.affiliation) {
    return { success: false, message: "등록된 선수 정보를 찾을 수 없습니다. 소속을 확인해주세요." };
  }
  const active = await ctx.env.DB.prepare(
    `SELECT * FROM otp_codes WHERE competition_id = ? AND phone_hash = ? AND consumed_at IS NULL ORDER BY id DESC LIMIT 1`
  ).bind(comp.id, ph.hash).first<any>();
  if (active && active.cooldown_until && new Date(active.cooldown_until).getTime() > Date.now()) {
    return { success: false, message: "잠시 후 다시 요청해주세요. (60초 대기)" };
  }
  const otp = String(Math.floor(100000 + Math.random() * 900000));
  const salt = randomToken();
  const ttl = secondsFromEnv(ctx.env.OTP_TTL_SECONDS, 300);
  const cooldown = secondsFromEnv(ctx.env.OTP_COOLDOWN_SECONDS, 60);
  await ctx.env.DB.prepare(
    `INSERT INTO otp_codes (competition_id, participant_id, phone_hash, phone_last4, otp_hash, salt, expires_at, cooldown_until)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(comp.id, participant.id, ph.hash, ph.last4, await otpHash(otp, salt), salt, isoNow(ttl), isoNow(cooldown)).run();
  const sms = await sendSMS(ctx, participant.phone_plain || inputPhone, `${comp.sms_prefix || "[KCL]"} 인증번호: ${otp} (5분 이내 입력)`);
  if (!sms.success) return { success: false, message: `SMS 발송 실패: ${sms.message}` };
  return { success: true, message: "인증번호가 발송되었습니다.", maskedPhone: maskPhone(inputPhone), uniqueNo: participant.unique_no || "" };
}

export async function verifyOTP(ctx: AppContext, name: unknown, phone: unknown, competitionCode: unknown, inputCode: unknown, affiliation?: unknown) {
  const inputName = safeStr(name);
  const inputPhone = normalizePhone(phone);
  const code = safeStr(competitionCode).toUpperCase();
  const otp = safeStr(inputCode).replace(/\s/g, "");
  if (!otp) return { success: false, message: "인증번호를 입력해주세요." };
  const comp = await competitionByCode(ctx, code);
  if (!comp) return { success: false, message: "대회 설정을 찾을 수 없습니다." };
  const ph = await phoneHash(inputPhone);
  const participant = await ctx.env.DB.prepare(
    `SELECT * FROM participants WHERE competition_id = ? AND (name = ? OR team_name = ?) AND phone_hash = ?`
  ).bind(comp.id, inputName, inputName, ph.hash).first<any>();
  if (!participant) return { success: false, message: "등록된 선수 정보를 찾을 수 없습니다." };
  if (safeStr(affiliation) && participant.affiliation && safeStr(affiliation) !== participant.affiliation) {
    return { success: false, message: "등록된 선수 정보를 찾을 수 없습니다. 소속을 확인해주세요." };
  }
  const codeRow = await ctx.env.DB.prepare(
    `SELECT * FROM otp_codes WHERE competition_id = ? AND participant_id = ? AND phone_hash = ? AND consumed_at IS NULL ORDER BY id DESC LIMIT 1`
  ).bind(comp.id, participant.id, ph.hash).first<any>();
  if (!codeRow || new Date(codeRow.expires_at).getTime() <= Date.now()) return { success: false, message: "인증번호가 만료되었습니다." };
  if (Number(codeRow.fail_count) >= 5) return { success: false, message: "시도 횟수 초과. 다시 요청해주세요." };
  const expected = await otpHash(otp, codeRow.salt);
  if (expected !== codeRow.otp_hash) {
    await ctx.env.DB.prepare(`UPDATE otp_codes SET fail_count = fail_count + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(codeRow.id).run();
    return { success: false, message: `인증번호가 일치하지 않습니다. (${Math.max(0, 4 - Number(codeRow.fail_count))}회 남음)` };
  }
  await ctx.env.DB.prepare(`UPDATE otp_codes SET consumed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(codeRow.id).run();
  const token = randomToken();
  await ctx.env.DB.prepare(
    `INSERT INTO debrief_tokens (token_hash, competition_id, participant_id, payload_json, expires_at)
     VALUES (?, ?, ?, ?, ?)`
  ).bind(await hashToken(token), comp.id, participant.id, JSON.stringify({ name: participant.name, phone_last4: ph.last4 }), isoNow(21600)).run();
  return {
    success: true,
    playerInfo: { name: participant.name, teamName: participant.team_name || participant.name, affiliation: participant.affiliation || "", uniqueNo: participant.unique_no || "", maskedPhone: maskPhone(inputPhone) },
    scores: [],
    competition: code,
    rankInfos: [],
    rankInfo: null,
    debriefToken: token,
    warning: "MVP OTP 인증은 완료됩니다. 검수완료 점수 상세 조회는 D1 동적 컬럼 매핑 확장 후 연결 TODO입니다."
  };
}

export async function createDebriefPdfFromPayload() {
  return { success: false, message: "PDF 서버 생성은 2차 구현 예정입니다. 브라우저 인쇄 기능을 사용해주세요." };
}

function maskPhone(phone: unknown): string {
  const p = normalizePhone(phone);
  if (p.length < 7) return p;
  return p.replace(/(\d{3})(\d{3,4})(\d{4})/, "$1-****-$3");
}
