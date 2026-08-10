// 라운드의 "정각" 타이밍을 다루는 순수 로직.
//
// 이전 설계의 문제: 화면 표시용 setInterval(1000ms)과 클릭 판정용
// setTimeout(msUntilOpen)이 서로 다른 타이머였다. 브라우저는 둘 중 어느
// 쪽이 먼저/나중에 도는지 보장하지 않으므로 "화면엔 OPEN인데 클릭은 아직
// 안 열림" 또는 그 반대가 구조적으로 발생했다.
//
// 새 설계: 목표 시각(openAt)이라는 단일 진실 공급원만 두고, 모든 판정은
// 그 시점에 매번 performance.now()와 직접 비교한다. 화면 갱신용 폴링
// 루프는 오직 "보여주기"만 담당하고, 클릭이 유효한지는 클릭이 들어온
// 바로 그 순간 openAt과 비교해서 즉시 판정한다 — 타이머가 언제 도는지와
// 무관하게 항상 정확하다.

export function computeOpenAt(nowMs, startTotalSeconds, openTotalSeconds) {
  return nowMs + (openTotalSeconds - startTotalSeconds) * 1000;
}

// nowMs 시점에 openAt 기준으로 몇 초가 지났는지(음수면 아직 전) 반환.
export function elapsedSimSeconds(nowMs, roundStartMs, startTotalSeconds) {
  return startTotalSeconds + (nowMs - roundStartMs) / 1000;
}

export function isOpen(nowMs, openAt) {
  return nowMs >= openAt;
}

// HH:MM:SS.d 형식. totalSeconds는 소수(데시초) 포함 가능.
export function formatClock(totalSeconds) {
  const wrapped = ((totalSeconds % 86400) + 86400) % 86400;
  const h = Math.floor(wrapped / 3600);
  const m = Math.floor((wrapped % 3600) / 60);
  const s = wrapped % 60;
  const pad = (n) => String(Math.floor(n)).padStart(2, "0");
  const deciseconds = Math.floor((s - Math.floor(s)) * 10);
  return `${pad(h)}:${pad(m)}:${pad(s)}.${deciseconds}`;
}

// 카운트다운 큰 숫자용: 남은 시간을 초 단위 1자리 소수로. 음수는 0으로 clamp.
export function formatRemaining(nowMs, openAt) {
  const remainingSec = Math.max(0, (openAt - nowMs) / 1000);
  return remainingSec.toFixed(1);
}
