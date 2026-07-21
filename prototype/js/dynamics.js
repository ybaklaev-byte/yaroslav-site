export function series(history) {
  return {
    dates: history.map((s) => s.date),
    score: history.map((s) => s.analysis.score),
    expMo: history.map((s) => s.analysis.expMo),
    savingsRate: history.map((s) => s.analysis.savingsRate)
  };
}
export function latestDelta(history) {
  if (!history || history.length < 2) return null;
  const a = history[history.length - 2].analysis, b = history[history.length - 1].analysis;
  return { score: b.score - a.score, expMo: b.expMo - a.expMo, savingsRate: b.savingsRate - a.savingsRate };
}
