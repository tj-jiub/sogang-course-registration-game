import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeCps,
  normalizeReactionMs,
  combineScores,
  gradeForScore,
} from "../js/scoring.js";

test("normalizeCps clamps to 0-100 and applies a superlinear curve up to 18 cps", () => {
  assert.equal(normalizeCps(0), 0);
  assert.equal(normalizeCps(18), 100);
  assert.equal(normalizeCps(30), 100);
  // ratio 0.5 with exponent 1.6 -> well below the naive 50, so mid-tier
  // mashing no longer yields a mid-tier score.
  assert.equal(Math.round(normalizeCps(9)), 33);
});

test("normalizeReactionMs: faster reaction (lower ms) scores higher", () => {
  assert.equal(normalizeReactionMs(120), 100);
  assert.equal(normalizeReactionMs(400), 0);
  assert.equal(normalizeReactionMs(2000), 0);
  assert.ok(normalizeReactionMs(200) > normalizeReactionMs(400));
  // ratio 0.5 with exponent 1.4 -> below the naive 50.
  assert.equal(Math.round(normalizeReactionMs(260)), 38);
});

test("combineScores averages entry and save scores", () => {
  assert.equal(combineScores(100, 0), 50);
  assert.equal(combineScores(80, 60), 70);
});

test("gradeForScore returns the highest grade whose min <= score", () => {
  assert.equal(gradeForScore(95).name, "사이버럭카");
  assert.equal(gradeForScore(80).name, "수강신청 고인물");
  assert.equal(gradeForScore(60).name, "평범한 새내기");
  assert.equal(gradeForScore(40).name, "장바구니만 채운 자");
  assert.equal(gradeForScore(10).name, "폐강 위기 각성 필요");
});
