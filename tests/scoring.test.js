import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeCps,
  normalizeReactionMs,
  combineScores,
  rankForReactionMs,
  rankForCps,
  combineRanks,
  gradeForRank,
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

test("rankForReactionMs applies explicit ms thresholds", () => {
  assert.equal(rankForReactionMs(150), "S");
  assert.equal(rankForReactionMs(180), "S");
  assert.equal(rankForReactionMs(181), "A");
  assert.equal(rankForReactionMs(300), "B");
  assert.equal(rankForReactionMs(450), "C");
  assert.equal(rankForReactionMs(900), "D");
});

test("rankForCps applies explicit CPS thresholds", () => {
  assert.equal(rankForCps(15), "S");
  assert.equal(rankForCps(12), "S");
  assert.equal(rankForCps(10), "A");
  assert.equal(rankForCps(7), "B");
  assert.equal(rankForCps(4), "C");
  assert.equal(rankForCps(1), "D");
});

test("combineRanks takes the worse of the two ranks", () => {
  assert.equal(combineRanks("S", "A"), "A");
  assert.equal(combineRanks("D", "S"), "D");
  assert.equal(combineRanks("B", "B"), "B");
});

test("gradeForRank attaches name/descs/emoji/color to a rank letter", () => {
  assert.equal(gradeForRank("S").name, "사이버럭카");
  assert.equal(gradeForRank("D").name, "연습 좀 더 해라");
  assert.equal(gradeForRank("A").rank, "A");
  assert.ok(Array.isArray(gradeForRank("S").descs));
  assert.ok(gradeForRank("S").descs.length > 1);
});
