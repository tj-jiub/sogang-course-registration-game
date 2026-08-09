import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeCps,
  normalizeReactionMs,
  combineScores,
  gradeForScore,
} from "../js/scoring.js";

test("normalizeCps clamps to 0-100 and scales linearly up to 15 cps", () => {
  assert.equal(normalizeCps(0), 0);
  assert.equal(normalizeCps(15), 100);
  assert.equal(normalizeCps(30), 100);
  assert.equal(Math.round(normalizeCps(7.5)), 50);
});

test("normalizeReactionMs: faster reaction (lower ms) scores higher", () => {
  assert.equal(normalizeReactionMs(150), 100);
  assert.equal(normalizeReactionMs(500), 0);
  assert.equal(normalizeReactionMs(2000), 0);
  assert.ok(normalizeReactionMs(200) > normalizeReactionMs(400));
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
