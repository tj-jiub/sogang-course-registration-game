export const config = { runtime: "edge" };

import { ImageResponse } from "@vercel/og";
import { gradeForRank } from "../js/scoring.js";

const RANKS = new Set(["S", "A", "B", "C", "D"]);

const PAPER = "#f8f5ee";
const PAPER_RAISED = "#fffdf9";
const INK = "#241f19";
const INK_MUTED = "#6b6255";
const BORDER = "rgba(36, 31, 25, 0.14)";
const ACCENT = "#9e2a2f";
const ACCENT_INK = "#fdfaf5";

function el(type, props, children) {
  return { type, props: { ...props, children } };
}

// Google Fonts CSS2 API returns a TTF (not woff2) src when the request looks
// like it comes from a legacy user agent with no Accept header — @vercel/og
// (satori) needs raw TTF/OTF bytes, so we skip a real UA and rely on that
// default. &text= subsets the font to only the glyphs this render needs, so
// each unique result stays a small, fast fetch instead of the full CJK set.
async function loadKoreanFont(text, weight) {
  const cssUrl = `https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@${weight}&text=${encodeURIComponent(text)}`;
  const css = await (await fetch(cssUrl)).text();
  const match = css.match(/src: url\(([^)]+)\) format\('(?:opentype|truetype)'\)/);
  if (!match) throw new Error("Noto Sans KR font CSS did not resolve to a font file");
  const fontRes = await fetch(match[1]);
  return fontRes.arrayBuffer();
}

function statBox(label, value, accent) {
  return el("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 4,
      padding: "14px 28px",
      background: PAPER_RAISED,
      border: `1px solid ${BORDER}`,
      borderRadius: 10,
    },
  }, [
    el("div", { style: { display: "flex", fontSize: 20, color: INK_MUTED } }, [label]),
    el("div", { style: { display: "flex", fontSize: 30, fontWeight: 800, color: accent || INK } }, [value]),
  ]);
}

export default async function handler(request) {
  try {
    return await renderResultImage(request);
  } catch (error) {
    // ImageResponse가 헤더(200, image/png)를 먼저 커밋하고 실제 PNG 인코딩은
    // 스트림 뒤에서 지연 실행되는 구조라, 렌더링 중 던진 에러는 여기서 못 잡고
    // "200 응답 + 0바이트 본문"으로 새버릴 수 있다. 그런 부류의 실패는 이
    // try/catch로도 못 잡지만, 폰트 fetch 실패 등 handler 본문에서 직접
    // 던지는 에러는 최소한 여기서 원인이 보이는 500으로 남긴다.
    return new Response(JSON.stringify({ error: String(error?.stack || error) }), {
      status: 500,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }
}

async function renderResultImage(request) {
  const { searchParams } = new URL(request.url);

  const rankParam = (searchParams.get("rank") || "B").toUpperCase();
  const rank = RANKS.has(rankParam) ? rankParam : "B";
  const nickname = (searchParams.get("nickname") || "익명").slice(0, 12) || "익명";
  const score = Math.max(0, Math.min(100, Math.round(Number(searchParams.get("score")) || 0)));
  const entryMs = Math.max(0, Math.round(Number(searchParams.get("entryMs")) || 0));
  const saveMs = Math.max(0, Math.round(Number(searchParams.get("saveMs")) || 0));

  const grade = gradeForRank(rank);
  const descIndex = Math.abs([...nickname].reduce((sum, ch) => sum + ch.charCodeAt(0), 0)) % grade.descs.length;
  const desc = grade.descs[descIndex];

  const HEADER_TEXT = "서강대 수강신청 클릭 연습";
  const FOOTER_TEXT = "비공식 연습용 게임 · 서강대학교 종합정보시스템과 무관";
  // satori(@vercel/og)는 이모지 글리프를 렌더링하지 못하고 조용히
  // 스트림을 끊어버린다(200 응답에 본문만 0바이트) — Noto Sans KR에는
  // 이모지가 없으므로 이미지에 넣을 텍스트에서는 아예 뺀다.
  const allText = `${HEADER_TEXT}${nickname}${grade.name}${desc}입장저장합계${rank}${entryMs}ms${saveMs}ms${score}점${FOOTER_TEXT}`;

  const [regular, bold] = await Promise.all([
    loadKoreanFont(allText, 500),
    loadKoreanFont(allText, 800),
  ]);

  const image = el("div", {
    style: {
      width: "100%",
      height: "100%",
      display: "flex",
      flexDirection: "column",
      background: PAPER,
      fontFamily: "Noto Sans KR",
    },
  }, [
    el("div", {
      style: {
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "28px 40px",
        background: ACCENT,
        color: ACCENT_INK,
        fontSize: 30,
        fontWeight: 800,
      },
    }, [HEADER_TEXT]),

    el("div", {
      style: {
        flex: 1,
        display: "flex",
        alignItems: "center",
        padding: "40px 56px",
        gap: 44,
      },
    }, [
      el("div", {
        style: {
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 200,
          height: 200,
          borderRadius: "50%",
          background: grade.color,
          color: "#ffffff",
          fontSize: 110,
          fontWeight: 800,
          flexShrink: 0,
        },
      }, [rank]),

      el("div", { style: { display: "flex", flexDirection: "column", flex: 1, gap: 14 } }, [
        el("div", { style: { display: "flex", fontSize: 40, fontWeight: 800, color: INK } }, [
          grade.name,
        ]),
        el("div", { style: { display: "flex", fontSize: 24, color: INK_MUTED } }, [desc]),
        el("div", { style: { display: "flex", fontSize: 22, color: INK_MUTED } }, [
          `${nickname} 님의 기록`,
        ]),
        el("div", { style: { display: "flex", gap: 16, marginTop: 8 } }, [
          statBox("입장", `${entryMs}ms`, ACCENT),
          statBox("저장", `${saveMs}ms`, ACCENT),
          statBox("종합", `${score}점`, ACCENT),
        ]),
      ]),
    ]),

    el("div", {
      style: {
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px 40px",
        fontSize: 18,
        color: INK_MUTED,
        borderTop: `1px solid ${BORDER}`,
      },
    }, [FOOTER_TEXT]),
  ]);

  // ImageResponse는 기본값으로 이미 동일한 max-age=31536000 캐시 헤더를
  // 붙이므로 여기서 다시 지정하면 헤더가 중복돼 붙는다 — 지정하지 않는다.
  return new ImageResponse(image, {
    width: 1200,
    height: 630,
    fonts: [
      { name: "Noto Sans KR", data: regular, weight: 500, style: "normal" },
      { name: "Noto Sans KR", data: bold, weight: 800, style: "normal" },
    ],
  });
}
