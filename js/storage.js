const KEY = "sogang-course-registration-game:bestScore";

export function loadBestScore(storage) {
  const raw = storage.getItem(KEY);
  if (raw === null || raw === undefined) return null;
  const parsed = Number(raw);
  return Number.isNaN(parsed) ? null : parsed;
}

export function saveBestScore(score, storage) {
  const current = loadBestScore(storage);
  if (current === null || score > current) {
    storage.setItem(KEY, String(score));
  }
}
