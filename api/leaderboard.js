import { Pool } from "pg";
import { normalizeLeaderboardItems } from "../js/storage.js";

// globalThis 인메모리 버전은 서버리스 인스턴스가 재배포/재시작될 때마다
// 통째로 날아갔다 — 실제로 기능 배포 한 번으로 유저 기록이 사라지는 걸
// 겪은 뒤 Supabase Postgres(POSTGRES_URL, Vercel-Supabase 연동으로 자동
// 주입됨)로 옮겼다.
//
// Pool을 모듈 스코프에 하나만 두고 warm 인스턴스 사이에서 재사용한다.
// max:1로 잡는 이유는 서버리스 인스턴스 하나가 한 번에 하나씩만 처리하는
// 구조라 인스턴스 수만큼 커넥션이 늘어나는데, Supabase 무료 티어 커넥션
// 한도를 인스턴스 개수가 쉽게 넘어설 수 있어서다.
const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: false },
  max: 1,
});

const SAFE_MODES = new Set(["reaction", "mash"]);

function getMode(mode) {
  const cleaned = String(mode ?? "reaction").trim().toLowerCase();
  return SAFE_MODES.has(cleaned) ? cleaned : "reaction";
}

let tableReady = null;
function ensureTable() {
  // 콜드스타트마다 한 번만 실행되도록 프로미스를 캐싱한다 — 요청마다
  // DDL을 다시 보내지 않는다.
  if (!tableReady) {
    tableReady = pool.query(`
      CREATE TABLE IF NOT EXISTS leaderboard (
        id SERIAL PRIMARY KEY,
        mode TEXT NOT NULL,
        nickname TEXT NOT NULL,
        student_id TEXT NOT NULL,
        score DOUBLE PRECISION NOT NULL,
        ts BIGINT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS leaderboard_mode_score_idx
        ON leaderboard (mode, score DESC, ts ASC);
    `);
  }
  return tableReady;
}

async function loadMode(mode) {
  await ensureTable();
  const { rows } = await pool.query(
    `SELECT nickname, student_id AS "studentId", score, ts AS "timestamp"
     FROM leaderboard
     WHERE mode = $1
     ORDER BY score DESC, ts ASC
     LIMIT 10`,
    [mode]
  );
  return rows;
}

function sendJson(res, statusCode, data) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Accept");
  res.end(JSON.stringify(data));
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    sendJson(res, 204, null);
    return;
  }

  const url = new URL(req.url, "http://localhost");

  if (req.method === "GET") {
    const mode = getMode(url.searchParams.get("mode"));
    sendJson(res, 200, await loadMode(mode));
    return;
  }

  // 테스트/오염 데이터를 실제 유저 기록은 건드리지 않고 정확히 골라
  // 지우기 위한 관리용 엔드포인트. 닉네임 정확히 일치하는 항목만 제거
  // (top-10 밖에 있던 것까지 포함해 해당 모드에서 전부 삭제).
  if (req.method === "DELETE") {
    const mode = getMode(url.searchParams.get("mode"));
    const nickname = url.searchParams.get("nickname");
    if (!nickname) {
      sendJson(res, 400, { error: "nickname query param required" });
      return;
    }
    await ensureTable();
    await pool.query(`DELETE FROM leaderboard WHERE mode = $1 AND nickname = $2`, [mode, nickname]);
    sendJson(res, 200, await loadMode(mode));
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

  // 클라이언트(js/storage.js의 saveLeaderboardEntryRemote)는 mode를
  // 쿼리스트링이 아니라 JSON 바디에 담아 보낸다 — 여기서 쿼리스트링만
  // 읽던 게 버그였다: 모든 POST가 mode 파라미터 없이 들어와 매번
  // getMode(undefined)가 "reaction"으로 기본값 처리되면서, 연타 모드로
  // 플레이해도 항상 reaction 버킷에 저장되고 mash 랭킹은 영영 비어 있었다.
  const mode = getMode(parsed.mode ?? url.searchParams.get("mode"));

  const rawEntry = parsed.entry ?? parsed;
  if (!rawEntry || !Number.isFinite(Number(rawEntry.score))) {
    sendJson(res, 400, { error: "score must be a finite number" });
    return;
  }
  const entry = normalizeLeaderboardItems([rawEntry])[0];

  await ensureTable();
  await pool.query(
    `INSERT INTO leaderboard (mode, nickname, student_id, score, ts) VALUES ($1, $2, $3, $4, $5)`,
    [mode, entry.nickname, entry.studentId, entry.score, entry.timestamp]
  );
  sendJson(res, 200, await loadMode(mode));
}
