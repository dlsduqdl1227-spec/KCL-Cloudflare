import { safeStr } from "./validation";

export function compactElapsedSecondsFromText(value: unknown): number | null {
  const raw = safeStr(value).replace(/\s/g, "");
  if (!/^\d{3,6}$/.test(raw)) return null;
  let minutes = 0;
  let seconds = 0;
  let centiseconds = 0;
  if (raw.length >= 5) {
    minutes = Number(raw.slice(0, -4));
    seconds = Number(raw.slice(-4, -2));
    centiseconds = Number(raw.slice(-2));
  } else {
    minutes = Number(raw.slice(0, -2));
    seconds = Number(raw.slice(-2));
  }
  if (!Number.isFinite(minutes) || !Number.isFinite(seconds) || !Number.isFinite(centiseconds) || seconds >= 60) return null;
  return Math.max(0, minutes * 60 + seconds + centiseconds / 100);
}

export function elapsedSecondsFromValue(value: unknown): number | null {
  if (value instanceof Date) return value.getHours() * 3600 + value.getMinutes() * 60 + value.getSeconds();
  let t = safeStr(value);
  if (!t) return null;
  t = t.replace(/[：]/g, ":").replace(/,/g, ".");

  const iso = t.match(/^(\d{4})-\d{2}-\d{2}T(\d{2}):(\d{2}):(\d{2})/);
  if (iso) {
    const year = Number(iso[1]);
    if (year <= 1900) return Number(iso[2]) * 3600 + Number(iso[3]) * 60 + Number(iso[4]);
  }

  let m = t.match(/^(\d+)\s*:\s*(\d+(?:\.\d+)?)(?:\s*:\s*(\d+(?:\.\d+)?))?$/);
  if (m) {
    if (m[3] != null) return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
    return Number(m[1]) * 60 + Number(m[2]);
  }
  m = t.match(/(?:(\d+(?:\.\d+)?)\s*분)?\s*(\d+(?:\.\d+)?)?\s*초/);
  if (m && (m[1] != null || m[2] != null)) return Number(m[1] || 0) * 60 + Number(m[2] || 0);
  const compactSec = compactElapsedSecondsFromText(t);
  if (compactSec != null) return compactSec;
  if (/^-?\d+(\.\d+)?$/.test(t)) {
    const n = Number(t);
    if (Number.isNaN(n)) return null;
    if (n > 0 && n < 1) return Math.round(n * 24 * 60 * 60);
    if (Math.abs(n) > 86400) {
      const d = new Date(n);
      if (!Number.isNaN(d.getTime()) && d.getFullYear() <= 1900) {
        return d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds();
      }
      return null;
    }
    return n;
  }
  return null;
}

export function elapsedTimeText(value: unknown, forceFraction = false): string {
  const sec = elapsedSecondsFromValue(value);
  if (sec == null) return safeStr(value);
  const safeSec = Math.max(0, Number(sec) || 0);
  const rawText = safeStr(value);
  const compactRaw = rawText.replace(/\s/g, "");
  const shouldShowFraction = forceFraction || /\.\d+/.test(rawText) || /^\d{5,6}$/.test(compactRaw);
  const min = Math.floor(safeSec / 60);
  const s = safeSec - min * 60;
  const pad = (n: number) => (n < 10 ? "0" : "") + n;
  const secondText = shouldShowFraction || Math.abs(s - Math.round(s)) > 0.0001
    ? (s < 10 ? "0" : "") + s.toFixed(2)
    : pad(Math.round(s));
  return `${pad(min)}분 ${secondText}초`;
}

export function formatSeconds(sec: unknown): string {
  const n = Number(sec);
  if (!Number.isFinite(n) || n >= 999999) return "";
  const rounded = Math.max(0, Math.round(n));
  const m = Math.floor(rounded / 60);
  const s = rounded % 60;
  const pad = (v: number) => (v < 10 ? "0" : "") + v;
  return `${pad(m)}분 ${pad(s)}초`;
}

export function timeValue(value: unknown): number {
  if (value instanceof Date) return value.getTime();
  const s = safeStr(value);
  if (!s) return 0;
  const parsed = Date.parse(s);
  if (!Number.isNaN(parsed)) return parsed;
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}
