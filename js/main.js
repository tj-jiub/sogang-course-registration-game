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

const MASH_DURATION_MS = 3000;
const LOADING_DELAY_MS = 900;
const SAVE_APPEAR_DELAY_RANGE_MS = [500, 1500];

const REACTION_SIGNAL_DELAY_RANGE_MS = [500, 1800];

// 시뮬레이션 서버 시간: 대기 화면에 들어서는 순간이 10:29:50, 수강신청
// 정각은 10:30:00. 매 라운드(재도전 포함) 대기 화면에 들어갈 때마다
// 10:29:50부터 새로 시작한다 — 페이지 로드 시점부터 계속 흐르게 하면
// 로그인/모드선택에 걸린 시간만큼 이미 정각을 지나버려서 카운트다운이
// 뜰 새도 없이 항상 "OPEN"으로 보이는 문제가 있었다.
// 입장 버튼은 클릭/Space/Enter를 화면이 뜨자마자 항상 받아주긴 하지만
// (disabled로 막지 않음), 실제로 점수에 반영되는 건 이 라운드의 시계가
// 정각(10:30:00)에 도달한 뒤부터다. 그 전 클릭은 버튼이 눌리는 애니메이션만
// 재생하고 "정각이 되면 시작됩니다" 같은 중립적인 힌트만 보여준다.
const SIM_START_SECONDS = 10 * 3600 + 29 * 60 + 50;
const SIM_OPEN_SECONDS = 10 * 3600 + 30 * 60 + 0;
let standbyClockTimer = null;

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

function formatSimClock(totalSeconds) {
  const wrapped = ((totalSeconds % 86400) + 86400) % 86400;
  const h = Math.floor(wrapped / 3600);
  const m = Math.floor((wrapped % 3600) / 60);
  const s = Math.floor(wrapped % 60);
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

// 대기 화면에 들어갈 때마다 호출 — 이전 라운드에서 돌던 타이머가 있으면
// 정리하고 10:29:50부터 새로 카운트다운을 시작한다. 이 라운드에서 정각이
// 되는 순간 실행할 콜백을 등록할 수 있는 whenOpen()을 함께 돌려준다.
function startStandbyClock() {
  if (standbyClockTimer !== null) clearInterval(standbyClockTimer);

  const standbyClockEl = document.getElementById("standby-clock");
  const countdownEl = document.getElementById("standby-countdown");
  const bannerEl = document.getElementById("standby-message");

  let roundSeconds = SIM_START_SECONDS;
  let isOpen = false;
  let waiters = [];

  const notifyOpen = () => {
    isOpen = true;
    const pending = waiters;
    waiters = [];
    pending.forEach((callback) => callback());
  };

  const render = () => {
    standbyClockEl.textContent = formatSimClock(roundSeconds);

    const remaining = SIM_OPEN_SECONDS - roundSeconds;
    if (remaining > 0) {
      countdownEl.textContent = String(remaining);
      bannerEl.textContent = "수강신청 시작 예정 시각: 10:30:00";
      bannerEl.classList.remove("standby-banner--open");
    } else {
      countdownEl.textContent = "OPEN";
      bannerEl.textContent = "수강신청이 시작되었습니다!";
      bannerEl.classList.add("standby-banner--open");
    }
  };

  render();
  standbyClockTimer = setInterval(() => {
    roundSeconds += 1;
    if (!isOpen && roundSeconds >= SIM_OPEN_SECONDS) notifyOpen();
    render();
  }, 1000);

  return {
    whenOpen(callback) {
      if (isOpen) callback();
      else waiters.push(callback);
    },
  };
}

document.getElementById("server-clock").textContent = formatSimClock(SIM_START_SECONDS);

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

function startEntryPhase(enterBtn, round) {
  const hintEl = document.getElementById("entry-hint");

  // 정각 전에도 클릭/Space/Enter는 받아준다(버튼을 disabled로 막지 않아
  // 눌리는 애니메이션은 항상 재생된다) — 다만 실제로 라운드가 진행되는 건
  // 이 라운드의 시계가 정각에 도달한 뒤부터다.
  hintEl.textContent = "정각이 되면 시작됩니다.";
  const earlyUnbind = bindTrigger(enterBtn, () => {});

  round.whenOpen(() => {
    earlyUnbind();

    if (state.mode === "mash") {
      hintEl.textContent = "지금 클릭 또는 Space/Enter로 연타하세요!";
      let clicks = 0;
      let windowStart = null;
      let settled = false;

      // 3초 타이머는 정각이 된 시점이 아니라 "첫 클릭" 시점부터 시작한다.
      // 그래야 정각이 지났는데 누르지 않았다고 시간이 다 되어 저절로
      // 다음 화면으로 넘어가는 일이 없다 — 최소 한 번은 눌러야 진행된다.
      const unbind = bindTrigger(enterBtn, () => {
        if (settled) return;
        clicks += 1;
        if (windowStart === null) {
          windowStart = performance.now();
          setTimeout(() => {
            if (settled) return;
            settled = true;
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
      // 반응속도 모드는 정각이 된 뒤에도 예측 방지를 위해 짧은 랜덤 대기
      // 후 신호를 준다. 신호 전 클릭은 점수에 반영되지 않고 "아직이에요"
      // 힌트만 보여준다.
      hintEl.textContent = "신호가 뜰 때까지 기다리세요...";
      const signalDelay = randomBetween(...REACTION_SIGNAL_DELAY_RANGE_MS);
      let signalGiven = false;

      const lateEarlyUnbind = bindTrigger(enterBtn, () => {
        if (!signalGiven) hintEl.textContent = "아직이에요! 신호를 기다려주세요.";
      });

      setTimeout(() => {
        lateEarlyUnbind();
        signalGiven = true;
        hintEl.textContent = "지금 클릭하세요!";
        const goAt = performance.now();

        const unbind = bindTrigger(enterBtn, () => {
          unbind();
          const reactionMs = performance.now() - goAt;
          state.entryScore = normalizeReactionMs(reactionMs);
          state.entryRaw = { type: "ms", value: reactionMs };
          startQueuePhase();
        });
      }, signalDelay);
    }
  });
}

async function startQueuePhase() {
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
  const grade = gradeForRank(combineRanks(entryRank, saveRank));

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

  document.getElementById("bar-entry").style.width = `${Math.round(state.entryScore)}%`;
  document.getElementById("stat-entry").textContent = entryDetail;
  document.getElementById("bar-save").style.width = `${Math.round(state.saveScore)}%`;
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
