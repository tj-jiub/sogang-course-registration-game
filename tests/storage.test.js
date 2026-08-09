import { test } from "node:test";
import assert from "node:assert/strict";
import { loadBestScore, saveBestScore } from "../js/storage.js";

function createMemoryStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, value),
  };
}

test("loadBestScore returns null when nothing saved", () => {
  const storage = createMemoryStorage();
  assert.equal(loadBestScore(storage), null);
});

test("saveBestScore then loadBestScore round-trips the value", () => {
  const storage = createMemoryStorage();
  saveBestScore(77, storage);
  assert.equal(loadBestScore(storage), 77);
});

test("saveBestScore only overwrites when new score is higher", () => {
  const storage = createMemoryStorage();
  saveBestScore(50, storage);
  saveBestScore(30, storage);
  assert.equal(loadBestScore(storage), 50);
  saveBestScore(90, storage);
  assert.equal(loadBestScore(storage), 90);
});
