import test from "node:test";
import assert from "node:assert/strict";

import { loadLeaderboard, saveLeaderboardEntry, normalizeLeaderboardItems } from "../js/storage.js";

function createStorage() {
  const map = new Map();
  return {
    getItem(key) {
      return map.has(key) ? map.get(key) : null;
    },
    setItem(key, value) {
      map.set(key, String(value));
    },
    clear() {
      map.clear();
    },
  };
}

test("leaderboard entries stay separate by mode", () => {
  const storage = createStorage();

  saveLeaderboardEntry({ nickname: "반응왕", score: 92, timestamp: 1 }, storage, "reaction");
  saveLeaderboardEntry({ nickname: "연타킹", score: 87, timestamp: 2 }, storage, "mash");

  assert.equal(loadLeaderboard(storage, "reaction").length, 1);
  assert.equal(loadLeaderboard(storage, "mash").length, 1);
  assert.equal(loadLeaderboard(storage, "reaction")[0].nickname, "반응왕");
  assert.equal(loadLeaderboard(storage, "mash")[0].nickname, "연타킹");
});

test("leaderboard normalization keeps only valid, sorted top-10 entries", () => {
  const items = [
    { nickname: "A", score: 10, timestamp: 100 },
    { nickname: "B", score: 30, timestamp: 200 },
    { nickname: "C", score: "bad", timestamp: 300 },
    { nickname: "D", score: 25, timestamp: 250 },
    { nickname: "E", score: 28, timestamp: 180 },
    { nickname: "F", score: 42, timestamp: 500 },
    { nickname: "G", score: 35, timestamp: 10 },
  ];

  const normalized = normalizeLeaderboardItems(items);

  assert.deepEqual(
    normalized.map((item) => item.nickname),
    ["F", "G", "B", "E", "D", "A"],
  );
  assert.equal(normalized.length, 6);
  assert.equal(normalized.every((item) => Number.isFinite(item.score)), true);
});
