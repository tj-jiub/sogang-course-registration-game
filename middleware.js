export const config = { matcher: "/" };

const SHARE_PARAMS = ["rank", "nickname", "score", "entryMs", "saveMs"];

// 카카오톡/디스코드/트위터 등 링크 미리보기 봇은 JS를 실행하지 않고 정적
// HTML의 og:image/twitter:image 태그만 읽는다 — 그래서 결과별 이미지를
// 보여주려면 요청 시점에 이 태그 자체를 서버에서 바꿔치기해야 한다.
// 공유 파라미터가 없는 일반 접속(정적 index.html)은 그대로 통과시킨다.
export default async function middleware(request) {
  const url = new URL(request.url);
  if (!url.searchParams.has("rank")) return;

  const htmlRes = await fetch(new URL("/index.html", request.url));
  let html = await htmlRes.text();

  const ogUrl = new URL("/api/og", request.url);
  for (const key of SHARE_PARAMS) {
    const value = url.searchParams.get(key);
    if (value) ogUrl.searchParams.set(key, value);
  }
  const ogUrlString = ogUrl.toString();

  html = html
    .replace(
      /<meta property="og:image" content="[^"]*" \/>/,
      `<meta property="og:image" content="${ogUrlString}" />`
    )
    .replace(
      /<meta name="twitter:image" content="[^"]*" \/>/,
      `<meta name="twitter:image" content="${ogUrlString}" />`
    );

  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}
