import {
  normalizeCps,
  normalizeReactionMs,
  combineScores,
  rankForCps,
  rankForReactionMs,
  combineRanks,
  gradeForRank,
} from "./scoring.js";
import { buildQueueSteps } from "./queueSim.js";
import { loadBestScore, saveBestScore } from "./storage.js";
import { drawResultCard } from "./resultCard.js";
import { computeOpenAt, isOpen, formatClock, formatRemaining } from "./roundClock.js";

const MASH_DURATION_MS = 3000;
const LOADING_DELAY_MS = 900;
const SAVE_APPEAR_DELAY_RANGE_MS = [500, 1500];
const THEME_STORAGE_KEY = "sogang-course-registration-game:theme";

// index.html의 인라인 스크립트가 FOUC 방지를 위해 data-theme을 이미 적용해둔
// 상태에서 시작한다. 여기서는 버튼 아이콘 동기화와 토글 동작만 담당한다.
function initThemeToggle() {
  const toggleBtn = document.getElementById("theme-toggle");
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)");

  const effectiveTheme = () => {
    const forced = document.documentElement.getAttribute("data-theme");
    if (forced === "light" || forced === "dark") return forced;
    return prefersDark.matches ? "dark" : "light";
  };

  const syncIcon = () => {
    toggleBtn.textContent = effectiveTheme() === "dark" ? "☀️" : "🌙";
  };

  toggleBtn.addEventListener("click", () => {
    const next = effectiveTheme() === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem(THEME_STORAGE_KEY, next);
    syncIcon();
  });

  prefersDark.addEventListener("change", () => {
    if (!document.documentElement.getAttribute("data-theme")) syncIcon();
  });

  syncIcon();
}

initThemeToggle();

// 시뮬레이션 서버 시간: 대기 화면에 들어서는 순간이 10:29:50, 수강신청
// 정각은 10:30:00. 매 라운드(재도전 포함) 대기 화면에 들어갈 때마다
// 10:29:50부터 새로 시작한다 — 페이지 로드 시점부터 계속 흐르게 하면
// 로그인/모드선택에 걸린 시간만큼 이미 정각을 지나버려서 카운트다운이
// 뜰 새도 없이 항상 "OPEN"으로 보이는 문제가 있었다.
//
// openAt(목표 시각) 하나만 진실 공급원으로 두고, 클릭이 유효한지는 그
// 클릭이 들어온 순간 openAt과 직접 비교해서 판정한다(roundClock.isOpen).
// 화면 갱신용 requestAnimationFrame 루프는 순수하게 "보여주기"만 담당—
// 이 루프가 언제 도는지는 판정 결과에 전혀 영향을 주지 않는다.
const SIM_START_SECONDS = 10 * 3600 + 29 * 60 + 50;
const SIM_OPEN_SECONDS = 10 * 3600 + 30 * 60 + 0;
let standbyClockFrame = null;

const state = {
  mode: null, // "mash" | "reaction"
  entryScore: null,
  saveScore: null,
  entryRaw: null, // { type: "cps" | "ms", value: number }
  saveRaw: null, // ms
};

function showScreen(id) {
  document.querySelectorAll(".screen").forEach((el) => el.classList.remove("active"));
  document.getElementById(id).classList.add("active");
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function isTriggerKey(event) {
  return (event.code === "Space" || event.code === "Enter") && !event.repeat;
}

// 버튼을 눌린 것처럼 짧게 찌그러뜨리는 시각 피드백.
// 연타 중에도 매 트리거마다 다시 재생되도록 클래스를 지웠다가 강제 리플로우 후 다시 붙인다.
function pulseButton(button) {
  button.classList.remove("pressed");
  void button.offsetWidth;
  button.classList.add("pressed");
}

// 클릭과 Space/Enter 키를 하나의 트리거로 묶어준다.
// preventDefault()를 호출해 버튼에 포커스가 가 있을 때 Space/Enter가
// 네이티브 click 이벤트를 한 번 더 만들어 중복 카운트되는 것을 막는다.
function bindTrigger(button, onTrigger) {
  const fire = () => {
    pulseButton(button);
    onTrigger();
  };
  const onClick = () => fire();
  const onKeydown = (event) => {
    if (!isTriggerKey(event)) return;
    event.preventDefault();
    fire();
  };
  button.addEventListener("click", onClick);
  document.addEventListener("keydown", onKeydown);
  return () => {
    button.removeEventListener("click", onClick);
    document.removeEventListener("keydown", onKeydown);
  };
}

// 대기 화면에 들어갈 때마다 호출 — 이전 라운드에서 돌던 프레임 루프가 있으면
// 정리하고 10:29:50부터 새로 카운트다운을 시작한다. 정각(10:30:00)의 실제
// performance.now() 기준 목표 시각(openAt)이 유일한 진실 공급원이다.
//
// 여기서 도는 requestAnimationFrame 루프는 순전히 화면 표시용이다 — 초당
// 수십 번(탭이 보이는 동안 보통 60Hz) 갱신되어 데시초 단위로 정각까지
// 남은 시간을 보여준다. 클릭 판정에는 이 루프의 결과를 전혀 쓰지 않는다
// (startEntryPhase가 클릭 순간 openAt과 직접 비교한다) — 그래서 이 루프가
// 약간 밀리거나 몇 프레임 스킵되어도 실제 판정 정확도에는 영향이 없다.
function startStandbyClock() {
  if (standbyClockFrame !== null) cancelAnimationFrame(standbyClockFrame);

  const standbyClockEl = document.getElementById("standby-clock");
  const countdownEl = document.getElementById("standby-countdown");
  const bannerEl = document.getElementById("standby-message");

  const roundStartMs = performance.now();
  const openAt = computeOpenAt(roundStartMs, SIM_START_SECONDS, SIM_OPEN_SECONDS);

  // 정각이 지나도 루프를 멈추지 않는다 — "서버 시간"은 계속 흘러야 자연
  // 스럽다. 예전엔 정각 순간 루프를 끊어서 시계가 "OPEN"에서 멈춘 것처럼
  // 보였는데, 그게 마치 화면이 멎어버린 것 같은 인상을 줘서 지연처럼
  // 느껴졌다. 다른 화면으로 넘어갈 때는 stopStandbyClock()으로 정리한다.
  const render = () => {
    const now = performance.now();
    const simSeconds = SIM_START_SECONDS + (now - roundStartMs) / 1000;
    standbyClockEl.textContent = formatClock(simSeconds);

    if (!isOpen(now, openAt)) {
      countdownEl.textContent = formatRemaining(now, openAt);
      bannerEl.textContent = "수강신청 시작 예정 시각: 10:30:00";
      bannerEl.classList.remove("standby-banner--open");
    } else if (!bannerEl.classList.contains("standby-banner--open")) {
      countdownEl.textContent = "OPEN";
      bannerEl.textContent = "수강신청이 시작되었습니다!";
      bannerEl.classList.add("standby-banner--open");
    }

    standbyClockFrame = requestAnimationFrame(render);
  };

  render();

  return { openAt };
}

function stopStandbyClock() {
  if (standbyClockFrame !== null) {
    cancelAnimationFrame(standbyClockFrame);
    standbyClockFrame = null;
  }
}

document.getElementById("server-clock").textContent = formatClock(SIM_START_SECONDS);

document.getElementById("login-form").addEventListener("submit", (event) => {
  event.preventDefault();
  showScreen("screen-mode");
});

document.getElementById("mode-mash").addEventListener("click", () => {
  state.mode = "mash";
  startStandby();
});

document.getElementById("mode-reaction").addEventListener("click", () => {
  state.mode = "reaction";
  startStandby();
});

function startStandby() {
  showScreen("screen-standby");
  const round = startStandbyClock();
  const enterBtn = document.getElementById("enter-btn");
  startEntryPhase(enterBtn, round);
}

// 힌트 문구를 바꾸면서 짧게 깜빡이는 애니메이션을 재생한다. 정각 전 클릭이
// "눌러도 조용히 아무 일도 안 일어나는" 것처럼 보였던 게 실제로는 지연이
// 아니라 무효 클릭에 대한 피드백이 아예 없었던 게 원인이었다 — 매번 이걸
// 호출해서 "아직 안 됐다"는 걸 눈에 보이게 알려준다.
function flashHint(hintEl, text) {
  hintEl.textContent = text;
  hintEl.classList.remove("flash");
  void hintEl.offsetWidth;
  hintEl.classList.add("flash");
}

function startEntryPhase(enterBtn, round) {
  const hintEl = document.getElementById("entry-hint");
  hintEl.textContent = "정각이 되면 시작됩니다.";
  document.getElementById("entry-spinner").hidden = true;

  // 두 모드 모두 규칙이 동일하다: 정각(10:30:00) 전 클릭/Space/Enter는
  // 버튼이 눌리는 모션 + "아직이에요!" 힌트 깜빡임만 재생될 뿐 실제로는
  // 아무것도 세지 않는다. 판정은 클릭이 들어오는 바로 그 순간
  // performance.now()를 round.openAt과 비교해서 정하고, 이를 위해 미리
  // 예약해두는 타이머가 없다 — 그래서 타이머가 밀려서 판정이 늦어지는
  // 일이 구조적으로 불가능하다.
  if (state.mode === "mash") {
    const spinnerEl = document.getElementById("entry-spinner");
    let clicks = 0;
    let windowStart = null;
    let settled = false;
    let openedHintShown = false;

    // 3초 타이머는 정각 시점이 아니라 "첫 유효 클릭" 시점부터 시작한다.
    // 그래야 정각이 지났는데 누르지 않았다고 시간이 다 되어 저절로
    // 다음 화면으로 넘어가는 일이 없다 — 최소 한 번은 눌러야 진행된다.
    const unbind = bindTrigger(enterBtn, () => {
      if (settled) return;

      const now = performance.now();
      if (!isOpen(now, round.openAt)) {
        flashHint(hintEl, "아직이에요! 정각을 기다려주세요.");
        return;
      }

      if (!openedHintShown) {
        openedHintShown = true;
        hintEl.classList.remove("flash");
        hintEl.textContent = "지금 클릭 또는 Space/Enter로 연타하세요!";
      }

      clicks += 1;
      if (windowStart === null) {
        windowStart = now;
        spinnerEl.hidden = false; // 3초간 실제로 세고 있다는 걸 눈에 보여준다
        setTimeout(() => {
          if (settled) return;
          settled = true;
          spinnerEl.hidden = true;
          unbind();
          const elapsedSec = (performance.now() - windowStart) / 1000;
          const cps = clicks / elapsedSec;
          state.entryScore = normalizeCps(cps);
          state.entryRaw = { type: "cps", value: cps };
          startQueuePhase();
        }, MASH_DURATION_MS);
      }
    });
  } else {
    const unbind = bindTrigger(enterBtn, () => {
      const now = performance.now();
      if (!isOpen(now, round.openAt)) {
        flashHint(hintEl, "아직이에요! 정각을 기다려주세요.");
        return;
      }

      unbind();
      const reactionMs = now - round.openAt; // 정각 이후에만 유효하므로 항상 0 이상
      state.entryScore = normalizeReactionMs(reactionMs);
      state.entryRaw = { type: "ms", value: reactionMs };
      startQueuePhase();
    });
  }
}

async function startQueuePhase() {
  stopStandbyClock();
  showScreen("screen-queue");
  const queueCountEl = document.getElementById("queue-count");
  const steps = buildQueueSteps(state.entryScore);

  for (const step of steps) {
    queueCountEl.textContent = String(step.count);
    await wait(step.delayMs);
  }

  startSavePhase();
}

function startSavePhase() {
  showScreen("screen-save");
  const saveBtn = document.getElementById("save-btn");
  saveBtn.style.visibility = "hidden";

  const appearDelay = randomBetween(...SAVE_APPEAR_DELAY_RANGE_MS);
  setTimeout(() => {
    saveBtn.style.visibility = "visible";
    const appearAt = performance.now();

    const unbind = bindTrigger(saveBtn, () => {
      unbind();
      const reactionMs = performance.now() - appearAt;
      state.saveScore = normalizeReactionMs(reactionMs);
      state.saveRaw = reactionMs;
      startLoadingPhase();
    });
  }, appearDelay);
}

async function startLoadingPhase() {
  showScreen("screen-loading");
  await wait(LOADING_DELAY_MS);
  startTossPhase();
}

async function startTossPhase() {
  showScreen("screen-toast");
  document.getElementById("toast-message").textContent =
    "[LCU4030-01] 초급스페인어 - 수강신청 되었습니다.";
  await wait(1200);
  showResult();
}

function showResult() {
  showScreen("screen-result");

  // 등급은 명확한 ms/CPS 구간표로 정한다 (scoring.js 참고) — 입장/저장 중
  // 더 나쁜 쪽 등급이 최종 등급이 된다. 0-100 정규화 점수는 진행 바와
  // 개인 최고 기록 비교용으로만 쓴다.
  const entryRank =
    state.entryRaw.type === "cps"
      ? rankForCps(state.entryRaw.value)
      : rankForReactionMs(state.entryRaw.value);
  const saveRank = rankForReactionMs(state.saveRaw);
  const rawGrade = gradeForRank(combineRanks(entryRank, saveRank));
  // 매 판마다 대사를 후보 중 하나로 무작위로 뽑는다 — DOM과 공유 카드
  // 이미지에 같은 문구가 쓰이도록 여기서 한 번만 뽑아 grade.desc에 얹는다.
  const pickedDesc = rawGrade.descs[Math.floor(Math.random() * rawGrade.descs.length)];
  const grade = { ...rawGrade, desc: pickedDesc };

  const overallScore = combineScores(state.entryScore, state.saveScore);

  const badgeEl = document.getElementById("result-badge");
  badgeEl.style.setProperty("--grade-color", grade.color);
  // 재실행 시 팝 애니메이션이 다시 재생되도록 리플로우를 강제한다.
  badgeEl.style.animation = "none";
  void badgeEl.offsetWidth;
  badgeEl.style.animation = "";

  document.getElementById("result-rank").textContent = grade.rank;
  document.getElementById("result-emoji").textContent = grade.emoji;
  document.getElementById("result-grade").textContent = grade.name;
  document.getElementById("result-desc").textContent = grade.desc;

  const entryDetail =
    state.entryRaw.type === "cps"
      ? `${state.entryRaw.value.toFixed(1)} CPS`
      : `${Math.round(state.entryRaw.value)}ms`;

  const entryGrade = gradeForRank(entryRank);
  const saveGrade = gradeForRank(saveRank);

  const entryChip = document.getElementById("chip-entry");
  entryChip.textContent = entryRank;
  entryChip.style.color = entryGrade.color;
  document.getElementById("stat-entry").textContent = entryDetail;

  const saveChip = document.getElementById("chip-save");
  saveChip.textContent = saveRank;
  saveChip.style.color = saveGrade.color;
  document.getElementById("stat-save").textContent = `${Math.round(state.saveRaw)}ms`;

  const previousBest = loadBestScore(window.localStorage);
  saveBestScore(overallScore, window.localStorage);
  const newBest = loadBestScore(window.localStorage);
  const isNewBest = previousBest !== null && newBest > previousBest;

  document.getElementById("result-newbest").textContent = isNewBest ? "🎉 신기록 갱신!" : "";

  const bestEl = document.getElementById("result-best");
  bestEl.textContent = `개인 최고 기록: ${Math.round(newBest)}점`;

  const canvas = document.getElementById("result-canvas");
  drawResultCard(canvas, { grade, overallScore });

  document.getElementById("result-download").onclick = () => {
    const link = document.createElement("a");
    link.download = "sogang-course-registration-result.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  const shareBtn = document.getElementById("result-share");
  if (navigator.share) {
    shareBtn.style.display = "inline-block";
    shareBtn.onclick = async () => {
      canvas.toBlob(async (blob) => {
        const file = new File([blob], "result.png", { type: "image/png" });
        await navigator.share({
          files: [file],
          title: "서강대 수강신청 클릭 연습 결과",
          text: `나는 [${grade.name}]! 너도 도전해봐.`,
        });
      });
    };
  } else {
    shareBtn.style.display = "none";
  }

  document.getElementById("result-replay").onclick = () => {
    state.mode = null;
    state.entryScore = null;
    state.saveScore = null;
    state.entryRaw = null;
    state.saveRaw = null;
    showScreen("screen-mode");
  };
}
