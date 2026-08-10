import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeOpenAt,
  elapsedSimSeconds,
  isOpen,
  formatClock,
  formatRemaining,
} from "../js/roundClock.js";

test("computeOpenAt returns nowMs plus the sim duration in ms", () => {
  assert.equal(computeOpenAt(1000, 10, 20), 1000 + 10000);
  assert.equal(computeOpenAt(0, 0, 0), 0);
});

test("elapsedSimSeconds tracks real elapsed time on top of the start second", () => {
  assert.equal(elapsedSimSeconds(1000, 1000, 100), 100);
  assert.equal(elapsedSimSeconds(3500, 1000, 100), 102.5);
});

test("isOpen is true exactly at and after openAt, false before", () => {
  assert.equal(isOpen(999, 1000), false);
  assert.equal(isOpen(1000, 1000), true);
  assert.equal(isOpen(1001, 1000), true);
});

test("formatClock renders HH:MM:SS.d with wraparound and decisecond truncation", () => {
  assert.equal(formatClock(0), "00:00:00.0");
  assert.equal(formatClock(37790.5), "10:29:50.5");
  assert.equal(formatClock(86400), "00:00:00.0"); // 24h wraps to 0
  assert.equal(formatClock(37800.99), "10:30:00.9");
});

test("formatRemaining clamps to 0 and keeps one decimal", () => {
  assert.equal(formatRemaining(0, 10000), "10.0");
  assert.equal(formatRemaining(7500, 10000), "2.5");
  assert.equal(formatRemaining(15000, 10000), "0.0"); // already past open
});
