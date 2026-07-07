export function stddev(values: number[]): number {
  const clean = values.filter((v) => Number.isFinite(v));
  if (!clean.length) return 0;
  const avg = clean.reduce((a, b) => a + b, 0) / clean.length;
  const variance = clean.reduce((sum, v) => sum + Math.pow(v - avg, 2), 0) / clean.length;
  return Number(Math.sqrt(variance).toFixed(3));
}
