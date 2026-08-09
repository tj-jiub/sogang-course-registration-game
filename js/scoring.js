const CPS_MAX = 18; // 3초간 54클릭 이상이어야 만점 — 일반적인 수동 클릭으로는 거의 불가능
const CPS_EXPONENT = 1.6; // >1이면 중간 수준 CPS는 상대적으로 낮은 점수를 받는다
const REACTION_BEST_MS = 120; // 이보다 빠르면 만점 (사람 반응속도 한계권)
const REACTION_WORST_MS = 400; // 이보다 느리면 0점
const REACTION_EXPONENT = 1.4;

export function normalizeCps(cps) {
  const clamped = Math.max(0, Math.min(cps, CPS_MAX));
  const ratio = clamped / CPS_MAX;
  return Math.pow(ratio, CPS_EXPONENT) * 100;
}

export function normalizeReactionMs(ms) {
  const clamped = Math.max(REACTION_BEST_MS, Math.min(ms, REACTION_WORST_MS));
  const range = REACTION_WORST_MS - REACTION_BEST_MS;
  const ratio = (REACTION_WORST_MS - clamped) / range;
  return Math.pow(ratio, REACTION_EXPONENT) * 100;
}

export function combineScores(entryScore, saveScore) {
  return (entryScore + saveScore) / 2;
}

export const GRADES = [
  { min: 92, name: "사이버럭카", desc: "전설의 클릭력. 인기과목은 다 네 것." },
  { min: 78, name: "수강신청 고인물", desc: "웬만한 과목은 다 잡는다." },
  { min: 58, name: "평범한 새내기", desc: "운이 나쁘면 담당자에게 메일 쓸 각오." },
  { min: 38, name: "장바구니만 채운 자", desc: "마음만 앞섰다." },
  { min: 0, name: "연습 좀 더 해라", desc: "이대로면 인기과목은 못 잡는다. 알람부터 3개 맞춰라." },
];

export function gradeForScore(score) {
  const sorted = [...GRADES].sort((a, b) => b.min - a.min);
  return sorted.find((g) => score >= g.min) ?? sorted[sorted.length - 1];
}
