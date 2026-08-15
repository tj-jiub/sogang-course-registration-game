import { test } from "node:test";
import assert from "node:assert/strict";
import { buildQueueSteps } from "../js/queueSim.js";

// 항상 0.5를 반환하는 고정 rng로 결정론적 테스트
const fixedRng = () => 0.5;

test("buildQueueSteps always ends at count 0", () => {
  const steps = buildQueueSteps(50, fixedRng);
  assert.equal(steps[steps.length - 1].count, 0);
});

test("buildQueueSteps counts strictly decrease", () => {
  const steps = buildQueueSteps(20, fixedRng);
  for (let i = 1; i < steps.length; i++) {
    assert.ok(steps[i].count < steps[i - 1].count);
  }
});

test("higher entryScore produces a shorter total wait than lower entryScore", () => {
  const fast = buildQueueSteps(100, fixedRng);
  const slow = buildQueueSteps(0, fixedRng);
  const totalDelay = (steps) => steps.reduce((sum, s) => sum + s.delayMs, 0);
  assert.ok(totalDelay(fast) < totalDelay(slow));
});

test("entryScore is clamped to 0-100 range", () => {
  const overMax = buildQueueSteps(500, fixedRng);
  const underMin = buildQueueSteps(-50, fixedRng);
  assert.equal(overMax[overMax.length - 1].count, 0);
  assert.equal(underMin[underMin.length - 1].count, 0);
});

test("higher score produces a distinctly smaller queue range and shorter total wait", () => {
  const fast = buildQueueSteps(95, () => 0.75);
  const slow = buildQueueSteps(15, () => 0.25);
  const totalDelay = (steps) => steps.reduce((sum, s) => sum + s.delayMs, 0);

  assert.ok(fast[0].count < slow[0].count);
  assert.ok(totalDelay(fast) < totalDelay(slow));
  assert.ok(fast.length > 0 && slow.length > 0);
});
