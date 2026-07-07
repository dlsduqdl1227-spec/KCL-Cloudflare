import { safeStr } from "../../utils/validation";

export type SmartTagTone = "positive" | "refine" | "neutral";

export function smartTagTone(tag: unknown): SmartTagTone {
  const text = safeStr(tag);
  if (/보완|불일치|부족|탁함|떫음|불명확|거침|건조|충돌|누락|미흡/i.test(text)) return "refine";
  if (/우수|좋음|단맛 표현|산미 표현|후미|명확|클린|투명|결점 없음|일치|구현|구조|자신감|준비성|안정|전달력|적절|부드러움|창의성|조화|연결성|효율|청결|관리/i.test(text)) return "positive";
  return "neutral";
}

export function cleanSmartTag(tag: unknown, max = 50): string {
  let text = safeStr(tag).replace(/\s+/g, " ").trim();
  const parts = text.split(">");
  text = safeStr(parts[parts.length - 1]).trim() || text;
  return text.length > max ? text.substring(0, max) : text;
}

export function flattenSmartTags(input: unknown, prefix = ""): string[] {
  if (!input) return [];
  if (Array.isArray(input)) return input.map((x) => cleanSmartTag(x)).filter(Boolean);
  if (typeof input === "object") {
    const out: string[] = [];
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
      for (const tag of flattenSmartTags(value, key)) out.push(prefix ? `${prefix} ${tag}` : tag);
    }
    return Array.from(new Set(out)).slice(0, 24);
  }
  const tag = cleanSmartTag(input);
  return tag ? [tag] : [];
}

export function joinTags(tags: string[], count = 6): string {
  const text = tags.slice(0, count).join(", ");
  return text.length > 220 ? text.substring(0, 220) : text;
}
