export function buildQueueSteps(entryScore, rng = Math.random) {
  const clamped = Math.max(0, Math.min(100, entryScore));

  // 빠른 반응 = 적은 대기자 수. 점수 0~100에서 시작값이 느리게 900~200 범위로
  // 줄어들고, 각 감소 폭도 더 랜덤하게 섞어 실제 대기열처럼 보이게 한다.
  const minQueue = 150;
  const maxQueue = 950;
  const start = Math.round(maxQueue - clamped * 7.5 + (rng() - 0.5) * 220);
  const boundedStart = Math.max(minQueue, Math.min(maxQueue, start));

  // 점수가 높을수록 대기열이 더 빨리 줄어든다. 0점은 느리게 흐르고 100점은 빨리 통과.
  const speedFactor = 1.2 - clamped / 100; // 0 -> 1.2, 100 -> 0.2

  const steps = [];
  let remaining = boundedStart;

  while (remaining > 0) {
    const dropRatio = 0.18 + rng() * 0.52; // 18%~70% 감소로 더 큰 편차
    let next = Math.floor(remaining * (1 - dropRatio));

    // 더 크고 자연스러운 숫자 변화: 점수 낮을수록 더 큰 폭으로 흔들린다.
    const varianceBoost = Math.max(0, (100 - clamped) / 100) * 60;
    const variance = Math.round((rng() - 0.5) * varianceBoost);
    next = Math.max(0, next + variance);

    if (next >= remaining) next = Math.max(0, remaining - 1);
    if (next < 0) next = 0;

    const baseDelay = 180 + rng() * 520; // 180ms~700ms
    const delayMs = Math.max(120, Math.round(baseDelay * speedFactor));

    steps.push({ count: next, delayMs });
    remaining = next;
  }

  return steps;
}
