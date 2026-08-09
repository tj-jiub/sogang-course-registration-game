const CPS_MAX = 15;
const REACTION_BEST_MS = 150;
const REACTION_WORST_MS = 500;

export function normalizeCps(cps) {
  const clamped = Math.max(0, Math.min(cps, CPS_MAX));
  return (clamped / CPS_MAX) * 100;
}

export function normalizeReactionMs(ms) {
  const clamped = Math.max(REACTION_BEST_MS, Math.min(ms, REACTION_WORST_MS));
  const range = REACTION_WORST_MS - REACTION_BEST_MS;
  return ((REACTION_WORST_MS - clamped) / range) * 100;
}

export function combineScores(entryScore, saveScore) {
  return (entryScore + saveScore) / 2;
}

export const GRADES = [
  { min: 90, name: "사이버럭카", desc: "전설의 클릭력. 인기과목은 다 네 것." },
  { min: 75, name: "수강신청 고인물", desc: "웬만한 과목은 다 잡는다." },
  { min: 55, name: "평범한 새내기", desc: "운이 나쁘면 담당자에게 메일 쓸 각오." },
  { min: 35, name: "장바구니만 채운 자", desc: "마음만 앞섰다." },
  { min: 0, name: "폐강 위기 각성 필요", desc: "내년엔 알람을 3개 맞추자." },
];

export function gradeForScore(score) {
  const sorted = [...GRADES].sort((a, b) => b.min - a.min);
  return sorted.find((g) => score >= g.min) ?? sorted[sorted.length - 1];
}
