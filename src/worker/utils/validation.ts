export function safeStr(value: unknown): string {
  const s = String(value == null ? "" : value).trim();
  return s === "undefined" || s === "null" ? "" : s;
}

export function normalizePhone(phone: unknown): string {
  return String(phone || "").replace(/[^0-9]/g, "");
}

export function requireString(value: unknown, label: string): string {
  const s = safeStr(value);
  if (!s) throw new Error(`${label} 값이 없습니다.`);
  return s;
}
