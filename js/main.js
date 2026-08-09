import { normalizeCps, normalizeReactionMs, combineScores, gradeForScore } from "./scoring.js";
import { buildQueueSteps } from "./queueSim.js";
import { loadBestScore, saveBestScore } from "./storage.js";
import { drawResultCard } from "./resultCard.js";

const STANDBY_COUNTDOWN_SEC = 7;
const MASH_DURATION_MS = 3000;
const REACTION_SIGNAL_DELAY_RANGE_MS = [800, 2500];
const LOADING_DELAY_MS = 900;
const SAVE_APPEAR_DELAY_RANGE_MS = [500, 1500];

const state = {
  mode: null, // "mash" | "reaction"
  entryScore: null,
  saveScore: null,
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

// 클릭과 Space/Enter 키를 하나의 트리거로 묶어준다.
// preventDefault()를 호출해 버튼에 포커스가 가 있을 때 Space/Enter가
// 네이티브 click 이벤트를 한 번 더 만들어 중복 카운트되는 것을 막는다.
function bindTrigger(button, onTrigger) {
  const onClick = () => onTrigger();
  const onKeydown = (event) => {
    if (!isTriggerKey(event)) return;
    event.preventDefault();
    onTrigger();
  };
  button.addEventListener("click", onClick);
  document.addEventListener("keydown", onKeydown);
  return () => {
    button.removeEventListener("click", onClick);
    document.removeEventListener("keydown", onKeydown);
  };
}

function startServerClock() {
  const clockEl = document.getElementById("server-clock");
  const tick = () => {
    clockEl.textContent = new Date().toLocaleTimeString("ko-KR", { hour12: false });
  };
  tick();
  setInterval(tick, 1000);
}

startServerClock();

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
  const enterBtn = document.getElementById("enter-btn");
  const countdownEl = document.getElementById("standby-countdown");

  // 카운트다운은 분위기용 연출일 뿐, 버튼은 화면이 뜨자마자 바로 클릭/Space/Enter로
  // 반응한다 — 실제 수강신청처럼 "정각 전에는 눌러도 소용없음"을 강제하지 않는다.
  let remaining = STANDBY_COUNTDOWN_SEC;
  countdownEl.textContent = String(remaining);

  const timer = setInterval(() => {
    remaining -= 1;
    countdownEl.textContent = remaining > 0 ? String(remaining) : "정각!";
    if (remaining <= 0) clearInterval(timer);
  }, 1000);

  startEntryPhase(enterBtn);
}

function startEntryPhase(enterBtn) {
  const hintEl = document.getElementById("entry-hint");

  if (state.mode === "mash") {
    hintEl.textContent = "지금 바로 클릭하거나 Space/Enter를 연타하세요!";
    let clicks = 0;
    const phaseStart = performance.now();
    const unbind = bindTrigger(enterBtn, () => { clicks += 1; });

    setTimeout(() => {
      unbind();
      const elapsedSec = (performance.now() - phaseStart) / 1000;
      const cps = clicks / elapsedSec;
      state.entryScore = normalizeCps(cps);
      startQueuePhase();
    }, MASH_DURATION_MS);
  } else {
    hintEl.textContent = "신호가 뜰 때까지 기다리세요...";
    const signalDelay = randomBetween(...REACTION_SIGNAL_DELAY_RANGE_MS);
    let signalGiven = false;

    const earlyUnbind = bindTrigger(enterBtn, () => {
      if (!signalGiven) hintEl.textContent = "아직이에요! 신호를 기다려주세요.";
    });

    setTimeout(() => {
      earlyUnbind();
      signalGiven = true;
      hintEl.textContent = "지금 클릭하세요!";
      const goAt = performance.now();

      const unbind = bindTrigger(enterBtn, () => {
        unbind();
        const reactionMs = performance.now() - goAt;
        state.entryScore = normalizeReactionMs(reactionMs);
        startQueuePhase();
      });
    }, signalDelay);
  }
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
  const overallScore = combineScores(state.entryScore, state.saveScore);
  const grade = gradeForScore(overallScore);

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

  document.getElementById("bar-entry").style.width = `${Math.round(state.entryScore)}%`;
  document.getElementById("stat-entry").textContent = `${Math.round(state.entryScore)}`;
  document.getElementById("bar-save").style.width = `${Math.round(state.saveScore)}%`;
  document.getElementById("stat-save").textContent = `${Math.round(state.saveScore)}`;

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
    showScreen("screen-mode");
  };
}
