export function qual7(v: number): string {
  if (v >= 5.5) return "완벽에 가까운";
  if (v >= 5) return "훌륭한";
  if (v >= 4) return "아주 좋은";
  if (v >= 3) return "좋은";
  if (v >= 2) return "평이한";
  if (v >= 1) return "미흡한";
  return "부정적인";
}

export function qual5(v: number): string {
  if (v >= 4.5) return "훌륭한";
  if (v >= 4) return "아주 좋은";
  if (v >= 3) return "좋은";
  if (v >= 2) return "평이한";
  return "미흡한";
}

export function qual5Kcac(v: number): string {
  if (v >= 4.75) return "완벽에 가까운";
  if (v >= 4) return "우수한";
  if (v >= 3.5) return "안정적인";
  if (v >= 3) return "기준에 부합하는";
  if (v >= 2) return "다소 약한";
  if (v >= 1) return "미흡한";
  return "미구현 수준의";
}

export function band5(score: number): string {
  if (score >= 4.5) return "매우 우수한";
  if (score >= 4.0) return "안정적이고 완성도 있는";
  if (score >= 3.2) return "기본 흐름은 갖춘";
  if (score >= 2.4) return "보완 여지가 분명한";
  return "집중 보완이 필요한";
}
