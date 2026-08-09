export function buildQueueSteps(entryScore, rng = Math.random) {
  const clamped = Math.max(0, Math.min(100, entryScore));
  const start = Math.round(800 - clamped * 3); // score 0 -> 800, score 100 -> 500
  const speedFactor = 1 - clamped / 200; // score 0 -> 1.0(느림), score 100 -> 0.5(빠름)

  const steps = [];
  let remaining = start;

  while (remaining > 0) {
    const dropRatio = 0.3 + rng() * 0.4; // 30%~70% 감소
    let next = Math.floor(remaining * (1 - dropRatio));
    if (next >= remaining) next = remaining - 1;
    if (next < 0) next = 0;

    const baseDelay = 300 + rng() * 400; // 300ms~700ms
    const delayMs = Math.round(baseDelay * speedFactor);

    steps.push({ count: next, delayMs });
    remaining = next;
  }

  return steps;
}
