const BEST_SCORE_KEY = "sogang-course-registration-game:bestScore";
const LEADERBOARD_KEY_PREFIX = "sogang-course-registration-game:leaderboard:";

export function normalizeLeaderboardItems(items = []) {
  return (Array.isArray(items) ? items : [])
    .filter((item) => item && Number.isFinite(Number(item.score)))
    .map((item) => ({
      nickname: String(item.nickname || "익명").slice(0, 12),
      studentId: String(item.studentId || "-").slice(0, 12),
      score: Number(item.score),
      timestamp: Number(item.timestamp || Date.now()),
    }))
    .sort((a, b) => b.score - a.score || a.timestamp - b.timestamp)
    .slice(0, 10);
}

export function loadBestScore(storage) {
  const raw = storage.getItem(BEST_SCORE_KEY);
  if (raw === null || raw === undefined) return null;
  const parsed = Number(raw);
  return Number.isNaN(parsed) ? null : parsed;
}

export function saveBestScore(score, storage) {
  const current = loadBestScore(storage);
  if (current === null || score > current) {
    storage.setItem(BEST_SCORE_KEY, String(score));
  }
}

export function getLeaderboardKey(mode) {
  return `${LEADERBOARD_KEY_PREFIX}${mode || "reaction"}`;
}

export function loadLeaderboard(storage, mode = "reaction") {
  const key = getLeaderboardKey(mode);
  const raw = storage.getItem(key);
  if (raw === null || raw === undefined) return [];

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveLeaderboardEntry(entry, storage, mode = "reaction") {
  const key = getLeaderboardKey(mode);
  const items = loadLeaderboard(storage, mode);
  const next = normalizeLeaderboardItems([...items, entry]);

  storage.setItem(key, JSON.stringify(next));
  return next;
}

export async function loadLeaderboardEntries(mode = "reaction", storage = null, fetchImpl = globalThis.fetch) {
  if (typeof fetchImpl === "function") {
    try {
      const endpoint = typeof window !== "undefined" ? new URL("/api/leaderboard", window.location.origin) : new URL("http://localhost/api/leaderboard");
      endpoint.searchParams.set("mode", mode || "reaction");

      const response = await fetchImpl(endpoint.toString(), {
        headers: { Accept: "application/json" },
      });
      if (response.ok) {
        const payload = await response.json();
        const items = Array.isArray(payload) ? payload : payload.items ?? [];
        return normalizeLeaderboardItems(items);
      }
    } catch {
      // Falls back to local storage below.
    }
  }

  if (!storage) return [];
  return loadLeaderboard(storage, mode);
}

export async function saveLeaderboardEntryRemote(entry, storage, mode = "reaction", fetchImpl = globalThis.fetch) {
  if (typeof fetchImpl === "function") {
    try {
      const endpoint = typeof window !== "undefined" ? new URL("/api/leaderboard", window.location.origin) : new URL("http://localhost/api/leaderboard");
      const response = await fetchImpl(endpoint.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: mode || "reaction", entry }),
      });
      if (response.ok) {
        const payload = await response.json();
        const items = Array.isArray(payload) ? payload : payload.items ?? [];
        return normalizeLeaderboardItems(items);
      }
    } catch {
      // Falls back to local storage below.
    }
  }

  return saveLeaderboardEntry(entry, storage, mode);
}
