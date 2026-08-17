import { inject } from "@vercel/analytics";
import {
  normalizeReactionMs,
  combineScores,
  rankForReactionMs,
  combineRanks,
  gradeForRank,
} from "./scoring.js";
import { buildQueueSteps } from "./queueSim.js";
import {
  loadBestScore,
  saveBestScore,
  loadLeaderboardEntries,
  saveLeaderboardEntryRemote,
} from "./storage.js";
import { drawResultCard } from "./resultCard.js";
import { computeOpenAt, isOpen, formatClock, formatRemaining } from "./roundClock.js";

// Initialize Vercel Web Analytics
inject();

const ENTRY_LOADING_DELAY_MS = 600;
const LOADING_DELAY_MS = 900;
const SAVE_APPEAR_DELAY_RANGE_MS = [500, 1500];
const THEME_STORAGE_KEY = "sogang-course-registration-game:theme";

// 저장 화면(screen-save)의 dummy-course-table과 순서/내용을 맞춘다 — 같은
// 4과목이 결과 화면에서는 등급에 따라 몇 개나 실제로 신청됐는지로 나뉜다.
const COURSES = [
  { code: "LCU4030-01", name: "초급스페인어", credit: "3.00" },
  { code: "LCU4035-01", name: "초급러시아어", credit: "3.00" },
  { code: "COR1007-01", name: "성찰과성장", credit: "1.00" },
  { code: "MGI2392", name: "재무관리", credit: "3.00" },
];

// 등급별로 COURSES 앞에서부터 몇 개까지 신청 성공 처리할지 — S/A는 전부,
// D는 전부 실패, 그 사이는 한 개씩 줄어든다.
const COURSE_SUCCESS_COUNT = { S: 4, A: 4, B: 3, C: 2, D: 0 };

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
  entryRaw: null, // ms — 정각 이후 첫 클릭까지의 반응속도 (두 모드 공통)
  saveRaw: null, // ms
  nickname: "",
  studentId: "",
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
    // 마우스 클릭은 버튼이 disabled면 네이티브 click 자체가 안 뜨지만,
    // 이 키보드 리스너는 document에 걸려있어 버튼 상태와 무관하게 늘
    // 발동한다 — 반응속도 모드의 1초 쿨다운 중에 Space/Enter로 우회
    // 연타하는 걸 막으려면 여기서도 직접 확인해야 한다.
    if (button.disabled) return;
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
  state.nickname = document.getElementById("login-nickname").value.trim() || "익명";
  state.studentId = document.getElementById("login-student-id").value.trim() || "-";
  showScreen("screen-mode");
});

// 왼쪽 절반(연타) / 오른쪽 절반(반응속도) 클릭 시 실행되는 함수.
// 이름 그대로 각 모드의 시작점 — 실제 게임 진행(state.mode 설정 +
// startStandby() 호출)에 콘솔 로그를 더했다.
function startRapidClickMode() {
  console.log("연타 모드(Rapid Click Mode) 시작");
  state.mode = "mash";
  startStandby();
}

function startAgilityMode() {
  console.log("반응속도 모드(Agility Mode) 시작");
  state.mode = "reaction";
  startStandby();
}

document.getElementById("mode-mash").addEventListener("click", startRapidClickMode);
document.getElementById("mode-reaction").addEventListener("click", startAgilityMode);

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

const REACTION_EARLY_CLICK_COOLDOWN_MS = 1000;

function startEntryPhase(enterBtn, round) {
  const hintEl = document.getElementById("entry-hint");
  hintEl.textContent = "정각이 되면 시작됩니다.";
  // 이전 라운드에서 걸린 쿨다운 타이머가 아직 안 풀렸을 수도 있으니
  // 새 라운드는 항상 활성 상태로 시작한다.
  enterBtn.disabled = false;

  // 정각(10:30:00) 전 클릭/Space/Enter는 실제로는 아무것도 세지 않는다.
  // 연타 모드는 "아직이에요!" 힌트만 깜빡이고 바로 다시 누를 수 있지만
  // (연타가 이 모드의 정체성이라 미리 계속 눌러보는 것도 허용) 반응속도
  // 모드는 미리 연타해서 정각 순간을 우연히 맞히는 걸 막아야 하므로,
  // 조기 클릭 시 "지금은 수강신청 시간이 아닙니다" 힌트와 함께 버튼을
  // REACTION_EARLY_CLICK_COOLDOWN_MS(1초)간 disabled 처리한다.
  // 정각 이후 첫 유효 클릭 "한 번"이 라운드를 끝내고 곧바로 전체화면
  // 로딩으로 넘어간다. 판정은 클릭이 들어오는 바로 그 순간
  // performance.now()를 round.openAt과 비교해서 정하고, 이를 위해 미리
  // 예약해두는 타이머가 없다 — 그래서 타이머가 밀려서 판정이 늦어지는
  // 일이 구조적으로 불가능하다.
  const readyHint =
    state.mode === "mash"
      ? "지금 클릭 또는 Space/Enter!"
      : "지금 클릭하세요!";

  const unbind = bindTrigger(enterBtn, () => {
    const now = performance.now();
    if (!isOpen(now, round.openAt)) {
      if (state.mode === "reaction") {
        flashHint(hintEl, "지금은 수강신청 시간이 아닙니다.");
        enterBtn.disabled = true;
        setTimeout(() => {
          enterBtn.disabled = false;
        }, REACTION_EARLY_CLICK_COOLDOWN_MS);
      } else {
        flashHint(hintEl, "아직이에요! 정각을 기다려주세요.");
      }
      return;
    }

    unbind();
    hintEl.classList.remove("flash");
    hintEl.textContent = readyHint;

    const reactionMs = now - round.openAt; // 정각 이후에만 유효하므로 항상 0 이상
    state.entryScore = normalizeReactionMs(reactionMs);
    state.entryRaw = reactionMs;
    startEntryLoadingPhase();
  });
}

// 수강신청 들어가기 클릭 직후, 대기열 카드가 뜨기 전에 화면 전체에
// 로딩 스피너만 짧게 보여준다 — "처리 중" 느낌을 주는 짧은 전환 비트.
async function startEntryLoadingPhase() {
  stopStandbyClock();
  showScreen("screen-loading");
  await wait(ENTRY_LOADING_DELAY_MS);
  startQueuePhase();
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

    const onSaveClick = () => {
      saveBtn.removeEventListener("click", onSaveClick);
      const reactionMs = performance.now() - appearAt;
      state.saveScore = normalizeReactionMs(reactionMs);
      state.saveRaw = reactionMs;
      startLoadingPhase();
    };

    saveBtn.addEventListener("click", onSaveClick, { once: true });
  }, appearDelay);
}

async function startLoadingPhase() {
  showScreen("screen-loading");
  await wait(LOADING_DELAY_MS);
  startTossPhase();
}

async function startTossPhase() {
  showScreen("screen-toast");

  // 결과 화면과 같은 등급→개수 로직으로 여기서도 과목별 성공/실패를
  // 미리 나열한다 (rank 계산은 순수 함수라 두 번 불러도 결과가 같다).
  const entryRank = rankForReactionMs(state.entryRaw);
  const saveRank = rankForReactionMs(state.saveRaw);
  const successCount = COURSE_SUCCESS_COUNT[combineRanks(entryRank, saveRank)];
  // 결과 화면 표에서 쓰는 것과 같은 초록 체크/빨강 엑스 뱃지(.grade-check)를
  // 재사용해서 여기서도 같은 방식으로 성공/실패를 보여준다.
  const toastRowsHtml = COURSES.map((course, index) => {
    const passed = index < successCount;
    return `
      <div class="toast-row">
        <span class="grade-check ${passed ? "" : "fail"}">${passed ? "✓" : "✗"}</span>
        <span>${passed ? `${course.name} 수강완료` : `${course.name} 수강신청 실패 X`}</span>
      </div>`;
  }).join("");
  document.getElementById("toast-message").innerHTML = toastRowsHtml;

  await wait(1200);
  showResult();
}

// 1~3등 포디엄 카드 하나를 만든다. entries/점수 자체는 renderLeaderboard가
// 이미 받아온 것을 그대로 넘겨받아 표시만 할 뿐, 정렬/필터링에는 관여하지
// 않는다 — 랭킹 데이터는 여기서 전혀 바뀌지 않는다.
function podiumCard(entry, rank) {
  const avatar = entry.nickname?.charAt(0)?.toUpperCase() || "?";
  const score = Math.round(Number(entry.score) || 0);
  return `
    <div class="podium-card podium-card--${rank}">
      <span class="podium-crown">${rank === 1 ? "👑" : rank === 2 ? "🥈" : "🥉"}</span>
      <span class="podium-avatar" aria-hidden="true">${avatar}</span>
      <span class="podium-name">${entry.nickname || "익명"}</span>
      <span class="podium-score">${score}</span>
    </div>
  `;
}

async function renderLeaderboard(mode = state.mode || "reaction") {
  const listEl = document.getElementById("ranking-list");
  const podiumEl = document.getElementById("ranking-podium");
  const entries = await loadLeaderboardEntries(mode, window.localStorage, window.fetch.bind(window));
  const panel = document.getElementById("ranking-panel");
  const titleEl = document.getElementById("ranking-title");
  const subtitleEl = document.getElementById("ranking-subtitle");

  const modeLabel = mode === "mash" ? "연타 랭킹" : "반응 속도 랭킹";
  if (titleEl) titleEl.textContent = modeLabel;
  if (subtitleEl) subtitleEl.textContent = mode === "mash" ? "MASH MODE" : "REACTION MODE";

  if (!entries.length) {
    if (podiumEl) podiumEl.innerHTML = "";
    listEl.innerHTML = '<li class="ranking-empty">아직 기록이 없습니다.</li>';
    if (panel) panel.dataset.mode = mode;
    return;
  }

  // 1~3등은 포디엄 카드로, 4등부터는 기존 리스트 그대로 — entries 배열
  // 자체(순서/값)는 그대로 두고 어느 템플릿으로 그릴지만 나눈다.
  const top3 = entries.slice(0, 3);
  const rest = entries.slice(3, 10);

  if (podiumEl) {
    // 시각적으로 2등-1등-3등 순서(가운데가 1등)로 배치 — DOM 순서 자체를
    // 그렇게 쓰고 CSS에서는 순서를 건드리지 않는다.
    const podiumOrder = [top3[1], top3[0], top3[2]];
    podiumEl.innerHTML = podiumOrder
      .map((entry, i) => (entry ? podiumCard(entry, i === 0 ? 2 : i === 1 ? 1 : 3) : ""))
      .join("");
  }

  listEl.innerHTML = rest.map((entry, index) => {
    const avatar = entry.nickname?.charAt(0)?.toUpperCase() || "?";
    const score = Math.round(Number(entry.score) || 0);
    return `
      <li class="ranking-row">
        <span class="ranking-rank">${index + 4}</span>
        <span class="ranking-avatar" aria-hidden="true">${avatar}</span>
        <span class="ranking-name">${entry.nickname || "익명"}</span>
        <span class="ranking-score">${score}</span>
      </li>
    `;
  }).join("");

  if (panel) panel.dataset.mode = mode;
}

function setupRankingToggle() {
  const button = document.getElementById("result-ranking");
  const panel = document.getElementById("ranking-panel");
  if (!button || !panel) return;

  button.addEventListener("click", async () => {
    const isOpen = panel.classList.toggle("open");
    panel.classList.toggle("collapsed", !isOpen);
    panel.setAttribute("aria-hidden", String(!isOpen));
    button.setAttribute("aria-expanded", String(isOpen));
    button.classList.toggle("active", isOpen);

    if (isOpen) {
      await renderLeaderboard(state.mode || "reaction");
      panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  });
}

setupRankingToggle();

async function showResult() {
  showScreen("screen-result");

  // 등급은 명확한 ms 구간표로 정한다 (scoring.js 참고) — 입장/저장 중
  // 더 나쁜 쪽 등급이 최종 등급이 된다. 0-100 정규화 점수는 진행 바와
  // 개인 최고 기록 비교용으로만 쓴다. 두 모드 모두 이제 "정각 이후 첫
  // 클릭까지의 반응속도" 하나로 측정하므로 항상 ms 기준이다.
  const entryRank = rankForReactionMs(state.entryRaw);
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

  const gradeImageMap = {
    S: "./assets/grade-a.jpg",
    A: "./assets/grade-a.jpg",
    B: "./assets/grade-b.jpg",
    C: "./assets/grade-c.jpg",
    D: "./assets/grade-d.jpg",
  };

  const gradeImageEl = document.getElementById("result-grade-image");
  const gradeImageSrc = gradeImageMap[grade.rank] ?? gradeImageMap.D;
  gradeImageEl.src = gradeImageSrc;
  gradeImageEl.alt = `${grade.name} 결과 이미지`;

  document.getElementById("result-rank").textContent = grade.rank;
  document.getElementById("result-emoji").textContent = grade.emoji;
  document.getElementById("result-grade").textContent = grade.name;
  document.getElementById("result-desc").textContent = grade.desc;
  document.getElementById("result-score").textContent = `${Math.round(overallScore)}점`;
  document.getElementById("result-student-info").textContent =
    `${state.nickname} · 학번 ${state.studentId}`;

  const entryDetail = `${Math.round(state.entryRaw)}ms`;

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

  // 최종 등급이 허용하는 개수만큼 COURSES 앞에서부터 신청 성공 처리한다
  // (초급스페인어가 목표 과목이라 맨 앞에 두고, 등급이 낮을수록 뒤 과목부터
  // 밀려난다).
  const successCount = COURSE_SUCCESS_COUNT[grade.rank];
  const courseRowsHtml = COURSES.map((course, index) => {
    const passed = index < successCount;
    return `
      <tr class="course-row ${passed ? "pass" : "fail"}">
        <td>${course.code}</td>
        <td>${course.name}</td>
        <td class="grade-table-value">${course.credit}</td>
        <td class="grade-table-eval">
          <span class="grade-check ${passed ? "" : "fail"}">${passed ? "✓" : "✗"}</span>
          <span class="course-result-status ${passed ? "pass" : "fail"}">${passed ? "완료" : "마감"}</span>
        </td>
      </tr>`;
  }).join("");
  document.getElementById("course-result-rows").innerHTML =
    `<tr class="grade-table-group"><td colspan="4">2026-1 신청 결과 (${successCount}/${COURSES.length}과목)</td></tr>${courseRowsHtml}`;

  const previousBest = loadBestScore(window.localStorage);
  saveBestScore(overallScore, window.localStorage);
  const leaderboardMode = state.mode === "mash" ? "mash" : "reaction";
  await saveLeaderboardEntryRemote({
    nickname: state.nickname,
    studentId: state.studentId,
    score: overallScore,
    timestamp: Date.now(),
  }, window.localStorage, leaderboardMode, window.fetch.bind(window));
  const newBest = loadBestScore(window.localStorage);
  const isNewBest = previousBest !== null && newBest > previousBest;

  document.getElementById("result-newbest").textContent = isNewBest ? "🎉 신기록 갱신!" : "";

  const bestEl = document.getElementById("result-best");
  bestEl.textContent = `개인 최고 기록: ${Math.round(newBest)}점`;
  await renderLeaderboard(leaderboardMode);

  const canvas = document.getElementById("result-canvas");
  drawResultCard(canvas, { grade, overallScore });

  const sharePreviewUrl = new URL("./assets/result-preview.png", window.location.href).href;
  document.querySelector('meta[property="og:image"]').setAttribute("content", sharePreviewUrl);
  document.querySelector('meta[name="twitter:image"]').setAttribute("content", sharePreviewUrl);

  const shareBtn = document.getElementById("result-share");
  const shareHintEl = document.getElementById("share-hint");
  shareBtn.onclick = async () => {
    const shareText = `${state.nickname}의 수강신청을 이겨보세요!`;
    // 카톡/디스코드 등 링크 미리보기 봇은 이 페이지의 JS를 실행하지 않고
    // 정적 og:image 태그만 읽는다 — 그래서 결과를 담은 이 URL 자체를
    // middleware.js가 요청 시점에 가로채 등급별 이미지(api/og.js)로
    // og:image를 바꿔치기한다. 쿼리스트링이 곧 공유 이미지의 데이터 소스.
    const shareUrl = new URL(window.location.href);
    shareUrl.search = "";
    shareUrl.searchParams.set("rank", grade.rank);
    shareUrl.searchParams.set("nickname", state.nickname);
    shareUrl.searchParams.set("score", Math.round(overallScore));
    shareUrl.searchParams.set("entryMs", Math.round(state.entryRaw));
    shareUrl.searchParams.set("saveMs", Math.round(state.saveRaw));

    // navigator.share는 데스크톱 Chrome(Windows)에도 있다 — "지원 안 하면
    // 클립보드로 대체"라고 짜뒀더니 데스크톱에서도 OS 공유 패널이 열려서
    // 클립보드 복사가 아예 실행되지 않는 게 원인이었다(사용자가 패널을
    // 닫으면 AbortError로 그냥 종료). 그래서 터치 기반 기기(모바일)에서만
    // 네이티브 공유 시트를 쓰고, 데스크톱은 항상 클립보드 복사로 간다.
    const isTouchPrimary = window.matchMedia?.("(pointer: coarse)").matches;
    if (isTouchPrimary && navigator.share) {
      try {
        const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
        const file = new File([blob], "sogang-course-registration-result.png", { type: "image/png" });
        const shareData = { title: "서강대 수강신청 클릭 연습", text: shareText, url: shareUrl.toString() };
        if (!navigator.canShare || navigator.canShare({ files: [file] })) {
          shareData.files = [file];
        }
        await navigator.share(shareData);
        return;
      } catch (err) {
        if (err && err.name === "AbortError") return; // 사용자가 공유 시트를 취소함 — 실패 아님
      }
    }

    try {
      await navigator.clipboard.writeText(`${shareText} ${shareUrl}`);
      flashHint(shareHintEl, "링크가 복사되었습니다!");
    } catch {
      window.prompt("아래 링크를 복사하세요:", `${shareText} ${shareUrl}`);
    }
  };

  document.getElementById("result-replay").onclick = () => {
    state.mode = null;
    state.entryScore = null;
    state.saveScore = null;
    state.entryRaw = null;
    state.saveRaw = null;
    showScreen("screen-mode");
  };
}
