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

// 등급별 대사는 매번 하나로 고정하지 않고 여러 개 중 무작위로 고른다
// (main.js에서 뽑는다 — scoring.js는 순수 함수로 남겨두기 위해 후보
// 배열만 제공하고 Math.random은 쓰지 않는다).
export const GRADE_INFO = {
  S: {
    name: "사기 클릭러",
    emoji: "🏆",
    color: "#f5a623",
    descs: [
      "전설의 클릭력. 인기과목은 다 네 것.",
      "교수님도 놀랄 속도. 넌 이미 고인물이다.",
      "네트워크도 너 앞에서는 숙였다.",
      "이 정도면 수강신청 학과 개설해도 됨.",
      "동기들이 '어떻게 했냐'고 캡처 요청함.",
    ],
  },
  A: {
    name: "수강신청 고수",
    emoji: "🔥",
    color: "#4a90d9",
    descs: [
      "웬만한 과목은 다 잡는다.",
      "인기과목 아니면 다 통과, 준수한 실력.",
      "재수강은 남 얘기. 너는 안정권.",
      "손목 스냅이 예사롭지 않다.",
      "매 학기 시간표 만족도 최상위권.",
    ],
  },
  B: {
    name: "평타는 친다",
    emoji: "🙂",
    color: "#5cb85c",
    descs: [
      "운이 나쁘면 담당자에게 메일 쓸 각오.",
      "듣고 싶은 과목 절반은 건졌다.",
      "평타는 친다. 그걸로 됐다.",
      "손이 느린 건 아닌데 확신이 부족했다.",
      "다음 학기엔 알람이라도 하나 더 맞추자.",
    ],
  },
  C: {
    name: "장바구니만 가득",
    emoji: "😅",
    color: "#e8a13c",
    descs: [
      "마음만 앞섰다.",
      "장바구니는 가득, 신청은 텅텅.",
      "설레는 마음으로 눌렀는데 이미 늦었다.",
      "타이밍은 못 잡아도 계획은 완벽했다.",
      "내년엔 진짜 알람 맞춘다 (다짐만 세 번째).",
    ],
  },
  D: {
    name: "연습 게임만 3년째",
    emoji: "💀",
    color: "#c0392b",
    descs: [
      "이대로면 인기과목은 못 잡는다. 알람부터 3개 맞춰라.",
      "학점 완화 제도가 있으면 뭐하나, 수강신청부터 안 되는데.",
      "재수강 각. 아니, 그 전에 신청 각이 없다.",
      "손가락보다 마음이 더 느렸다.",
      "내년 이맘때 이 게임부터 다시 켜라.",
    ],
  },
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
