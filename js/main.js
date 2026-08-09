import { normalizeCps, normalizeReactionMs, combineScores, gradeForScore } from "./scoring.js";
import { buildQueueSteps } from "./queueSim.js";
import { loadBestScore, saveBestScore } from "./storage.js";
import { drawResultCard } from "./resultCard.js";

const STANDBY_COUNTDOWN_SEC = 7;
const MASH_DURATION_MS = 3000;
const COURSELIST_DELAY_MS = 500;
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
  enterBtn.disabled = true;

  let remaining = STANDBY_COUNTDOWN_SEC;
  countdownEl.textContent = String(remaining);

  const timer = setInterval(() => {
    remaining -= 1;
    countdownEl.textContent = String(Math.max(remaining, 0));
    if (remaining <= 0) {
      clearInterval(timer);
      countdownEl.textContent = "지금 클릭하세요!";
      enterBtn.disabled = false;
      startEntryPhase(enterBtn);
    }
  }, 1000);
}

function startEntryPhase(enterBtn) {
  if (state.mode === "mash") {
    let clicks = 0;
    const phaseStart = performance.now();
    const onClick = () => { clicks += 1; };
    enterBtn.addEventListener("click", onClick);

    setTimeout(() => {
      enterBtn.removeEventListener("click", onClick);
      const elapsedSec = (performance.now() - phaseStart) / 1000;
      const cps = clicks / elapsedSec;
      state.entryScore = normalizeCps(cps);
      startQueuePhase();
    }, MASH_DURATION_MS);
  } else {
    const goAt = performance.now();
    const onClick = () => {
      enterBtn.removeEventListener("click", onClick);
      const reactionMs = performance.now() - goAt;
      state.entryScore = normalizeReactionMs(reactionMs);
      startQueuePhase();
    };
    enterBtn.addEventListener("click", onClick);
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

  await startCourseListPhase();
}

async function startCourseListPhase() {
  showScreen("screen-courselist");
  await wait(COURSELIST_DELAY_MS);
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

    const onClick = () => {
      saveBtn.removeEventListener("click", onClick);
      const reactionMs = performance.now() - appearAt;
      state.saveScore = normalizeReactionMs(reactionMs);
      startLoadingPhase();
    };
    saveBtn.addEventListener("click", onClick);
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

  document.getElementById("result-grade").textContent = grade.name;
  document.getElementById("result-desc").textContent = grade.desc;

  const previousBest = loadBestScore(window.localStorage);
  saveBestScore(overallScore, window.localStorage);
  const newBest = loadBestScore(window.localStorage);

  const bestEl = document.getElementById("result-best");
  bestEl.textContent =
    previousBest !== null && newBest > previousBest
      ? `개인 최고 기록 갱신! (${Math.round(newBest)}점)`
      : `개인 최고 기록: ${Math.round(newBest)}점`;

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
}
