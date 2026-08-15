import { normalizeLeaderboardItems } from "../js/storage.js";

const state = globalThis.__SOGANG_LEADERBOARD__ ??= {
  reaction: [],
  mash: [],
};

const SAFE_MODES = new Set(["reaction", "mash"]);

function getMode(mode) {
  const cleaned = String(mode ?? "reaction").trim().toLowerCase();
  return SAFE_MODES.has(cleaned) ? cleaned : "reaction";
}

function sendJson(res, statusCode, data) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Accept");
  res.end(JSON.stringify(data));
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    sendJson(res, 204, null);
    return;
  }

  const url = new URL(req.url, "http://localhost");
  const mode = getMode(url.searchParams.get("mode"));

  if (req.method === "GET") {
    sendJson(res, 200, state[mode]);
    return;
  }

  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  let parsed = {};
  try {
    parsed = await new Promise((resolve, reject) => {
      const chunks = [];

      req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      req.on("end", () => {
        if (chunks.length === 0) {
          resolve({});
          return;
        }

        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
        } catch (error) {
          reject(new Error("Invalid JSON body"));
        }
      });
      req.on("error", reject);
    });
  } catch {
    sendJson(res, 400, { error: "Invalid JSON body" });
    return;
  }

  const entry = parsed.entry ?? parsed;
  if (!entry || !Number.isFinite(Number(entry.score))) {
    sendJson(res, 400, { error: "score must be a finite number" });
    return;
  }

  const nextEntries = normalizeLeaderboardItems([...state[mode], entry]).slice(0, 10);
  state[mode] = nextEntries;
  sendJson(res, 200, nextEntries);
}
