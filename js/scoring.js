const CPS_MAX = 18; // 3초간 54클릭 이상이어야 만점 — 일반적인 수동 클릭으로는 거의 불가능
const CPS_EXPONENT = 1.6; // >1이면 중간 수준 CPS는 상대적으로 낮은 점수를 받는다
const REACTION_BEST_MS = 120; // 이보다 빠르면 만점 (사람 반응속도 한계권)
const REACTION_WORST_MS = 400; // 이보다 느리면 0점
const REACTION_EXPONENT = 1.4;

// 진행 바 표시용 0-100 정규화 점수 (등급 판정에는 쓰지 않는다 — 아래 참고).
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

// 개인 최고 기록 비교용 숫자 하나로 합친 값 (등급 판정과는 별개).
export function combineScores(entryScore, saveScore) {
  return (entryScore + saveScore) / 2;
}

// 등급은 "몇 ms/몇 CPS 이내면 무슨 등급" 식의 명확한 구간표로 정한다.
const REACTION_TIERS = [
  { maxMs: 180, rank: "S" },
  { maxMs: 250, rank: "A" },
  { maxMs: 350, rank: "B" },
  { maxMs: 500, rank: "C" },
  { maxMs: Infinity, rank: "D" },
];

const CPS_TIERS = [
  { minCps: 12, rank: "S" },
  { minCps: 9, rank: "A" },
  { minCps: 6, rank: "B" },
  { minCps: 3, rank: "C" },
  { minCps: -Infinity, rank: "D" },
];

const RANK_ORDER = ["S", "A", "B", "C", "D"];

export const GRADE_INFO = {
  S: { name: "사이버럭카", emoji: "🏆", color: "#f5a623", desc: "전설의 클릭력. 인기과목은 다 네 것." },
  A: { name: "수강신청 고인물", emoji: "🔥", color: "#4a90d9", desc: "웬만한 과목은 다 잡는다." },
  B: { name: "평범한 새내기", emoji: "🙂", color: "#5cb85c", desc: "운이 나쁘면 담당자에게 메일 쓸 각오." },
  C: { name: "장바구니만 채운 자", emoji: "😅", color: "#e8a13c", desc: "마음만 앞섰다." },
  D: { name: "연습 좀 더 해라", emoji: "💀", color: "#c0392b", desc: "이대로면 인기과목은 못 잡는다. 알람부터 3개 맞춰라." },
};

export function rankForReactionMs(ms) {
  return REACTION_TIERS.find((tier) => ms <= tier.maxMs).rank;
}

export function rankForCps(cps) {
  return CPS_TIERS.find((tier) => cps >= tier.minCps).rank;
}

// 입장/저장 두 구간 중 더 나쁜 등급을 최종 등급으로 삼는다 (약한 고리가 기준).
export function combineRanks(rankA, rankB) {
  const worseIndex = Math.max(RANK_ORDER.indexOf(rankA), RANK_ORDER.indexOf(rankB));
  return RANK_ORDER[worseIndex];
}

export function gradeForRank(rank) {
  return { rank, ...GRADE_INFO[rank] };
}
