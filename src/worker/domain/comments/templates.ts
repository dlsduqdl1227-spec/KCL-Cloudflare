import { safeStr } from "../../utils/validation";

export function tidyComment(value: unknown): string {
  return safeStr(value).replace(/\s+/g, " ").replace(/\s+([,.])/g, "$1");
}

export function avg(values: unknown[]): number {
  if (!values || !values.length) return 0;
  return values.reduce<number>((sum, v) => sum + (parseFloat(String(v)) || 0), 0) / values.length;
}

export function metricItems(group: string, names: string[], vals: unknown[]) {
  const out: Array<{ group: string; name: string; score: number }> = [];
  vals = vals || [];
  for (let i = 0; i < names.length && i < vals.length; i++) {
    const score = parseFloat(String(vals[i]));
    if (!Number.isNaN(score) && score > 0) out.push({ group, name: names[i], score });
  }
  return out;
}

export function sortItems<T extends { score: number }>(items: T[], desc = true): T[] {
  return (items || []).slice().sort((a, b) => desc ? b.score - a.score : a.score - b.score);
}

export function itemList(items: Array<{ group: string; name: string; score: number }>, count = 2, withGroup = false): string {
  return (items || []).slice(0, count).map((item) => `${withGroup ? item.group + " " : ""}${item.name} ${item.score.toFixed(1)}`).join(", ");
}
