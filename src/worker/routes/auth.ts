import { AppContext, createSession, phoneHash } from "../db/d1";
import { normalizePhone, safeStr } from "../utils/validation";

export async function judgeLogin(ctx: AppContext, name: unknown, phone: unknown) {
  const inputName = safeStr(name);
  const inputPhone = normalizePhone(phone);
  if (!inputName) return { success: false, message: "이름을 입력해주세요." };
  if (!inputPhone) return { success: false, message: "연락처를 입력해주세요." };
  const ph = await phoneHash(inputPhone);
  const rows = await ctx.env.DB.prepare(
    `SELECT o.*, GROUP_CONCAT(p.competition_code) AS access_codes
       FROM operators o
       LEFT JOIN operator_permissions p ON p.operator_id = o.id
      WHERE o.name = ? AND o.phone_hash = ? AND o.is_active = 1
      GROUP BY o.id`
  ).bind(inputName, ph.hash).all<any>();
  const matches = rows.results || [];
  if (!matches.length) {
    return { success: false, message: "등록된 정보를 찾을 수 없습니다. 이름과 연락처를 확인해주세요." };
  }
  const operator = matches.find((x) => safeStr(x.account_type).toUpperCase() === "ADMIN") || matches[0];
  const type = safeStr(operator.account_type || "JUDGE").toUpperCase();
  const role = type === "ADMIN" ? "관리자" : (operator.role || "센서리 심사위원");
  const result: any = {
    success: true,
    name: operator.name,
    affiliation: operator.affiliation || "",
    phone: inputPhone,
    type,
    accountType: type,
    role,
    access: type === "ADMIN" ? "ALL" : (operator.access_codes || ""),
    teamGroup: operator.team_group || "",
    teamMap: {},
    roleMap: {}
  };
  result.judgeToken = await createSession(ctx, result, operator.id, "judge");
  return result;
}
