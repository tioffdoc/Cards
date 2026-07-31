import * as db from "../db.js";
import { formatDuration } from "../utils.js";
import { icon } from "../icons.js";
import { goTo } from "../nav.js";
import { confirmDialog, toast } from "../ui.js";

let state = null;

export function renderStudy(root, params) {
  const queue = (params && params.queue) || [];
  if (!queue.length) {
    root.innerHTML = `<div class="center-empty">${icon("layers")}<p>No cards to study. Build a Daily Goal from Home first.</p>
      <button class="btn btn-primary" style="margin-top:12px" id="backHome">Back to Home</button></div>`;
    root.querySelector("#backHome").addEventListener("click", () => goTo("home"));
    return;
  }

  state = {
    queue,
    index: 0,
    phase: "question", // question -> answer -> grade -> difficulty
    startedAt: performance.now(),
    correct: null,
    results: [], // {correct}
  };

  renderCard(root);
}

function currentCard() {
  const id = state.queue[state.index];
  return db.getFlashcard(id);
}

function renderCard(root) {
  const card = currentCard();
  const pct = Math.round((state.index / state.queue.length) * 100);

  if (!card) { advance(root); return; }

  root.innerHTML = `
    <div class="study-progress"><i style="width:${pct}%"></i></div>
    <div class="row between" style="margin-bottom:6px">
      <span class="muted" style="font-size:var(--fs-caption)">Card ${state.index + 1} of ${state.queue.length}</span>
      <button class="btn btn-ghost" id="exitStudy">Exit</button>
    </div>

    <div class="flip-stage">
      <div class="flip-card" id="flipCard">
        <div class="flip-face front">
          <span class="timer" id="liveTimer">0s</span>
          <div class="kicker">Question</div>
          <div class="content">${escapeHTML(card.front)}</div>
          <div class="spacer"></div>
          <button class="btn btn-primary" id="showAnswer">Show Answer</button>
        </div>
        <div class="flip-face back">
          <div class="kicker">Answer</div>
          <div class="content">
            ${escapeHTML(card.answer)}
            ${card.image ? `<img src="${card.image}" alt="" />` : ""}
            ${card.explanation ? `<div class="explain">${escapeHTML(card.explanation)}</div>` : ""}
          </div>
          <div id="afterAnswer"></div>
        </div>
      </div>
    </div>
  `;

  root.querySelector("#exitStudy").addEventListener("click", () => confirmExit(root));

  root.querySelector("#showAnswer").addEventListener("click", () => {
    state.elapsedMs = performance.now() - state.startedAt;
    state.phase = "grade";
    root.querySelector("#flipCard").classList.add("flipped");
    renderAfterAnswer(root);
  });

  const t0 = performance.now();
  const timerEl = root.querySelector("#liveTimer");
  state._timerHandle = setInterval(() => {
    if (!timerEl.isConnected) { clearInterval(state._timerHandle); return; }
    timerEl.textContent = formatDuration(performance.now() - t0);
  }, 500);
}

function renderAfterAnswer(root) {
  const holder = root.querySelector("#afterAnswer");
  holder.innerHTML = `
    <p class="muted mono" style="margin-top:10px;font-size:var(--fs-caption)">Answered in ${formatDuration(state.elapsedMs)}</p>
    <div class="section-label" style="margin-top:12px">Did you get it right?</div>
    <div class="grade-grid">
      <button class="grade-btn correct" data-correct="1">Correct</button>
      <button class="grade-btn incorrect" data-correct="0">Incorrect</button>
    </div>
  `;
  holder.querySelectorAll("[data-correct]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.correct = btn.dataset.correct === "1";
      renderDifficulty(root, holder);
    });
  });
}

function renderDifficulty(root, holder) {
  holder.innerHTML = `
    <div class="section-label" style="margin-top:12px">Rate the difficulty</div>
    <div class="diff-grid">
      <button class="diff-btn easy" data-d="easy">Easy</button>
      <button class="diff-btn medium" data-d="medium">Medium</button>
      <button class="diff-btn hard" data-d="hard">Hard</button>
      <button class="diff-btn veryhard" data-d="veryhard">Very Hard</button>
    </div>
  `;
  holder.querySelectorAll("[data-d]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const card = currentCard();
      db.addLog({
        flashcardId: card.id,
        topicId: card.topicId,
        subjectId: card.subjectId,
        correct: state.correct,
        responseMs: Math.round(state.elapsedMs),
        difficulty: btn.dataset.d,
      });
      state.results.push({ correct: state.correct });
      clearInterval(state._timerHandle);
      state.index += 1;
      state.phase = "question";
      state.startedAt = performance.now();
      if (state.index >= state.queue.length) { renderSummary(root); }
      else { renderCard(root); }
    });
  });
}

function advance(root) {
  state.index += 1;
  if (state.index >= state.queue.length) renderSummary(root);
  else renderCard(root);
}

function renderSummary(root) {
  const correct = state.results.filter((r) => r.correct).length;
  const total = state.results.length;
  root.innerHTML = `
    <div class="card" style="text-align:center;padding:32px 20px">
      ${icon("check")}
      <h2 style="font-size:var(--fs-h2);margin:10px 0 4px">Session complete</h2>
      <p class="muted">You reviewed ${total} card${total === 1 ? "" : "s"}.</p>
      <div class="stat-grid" style="margin-top:18px">
        <div class="stat up"><span class="num mono">${correct}</span><span class="lbl">Correct</span></div>
        <div class="stat down"><span class="num mono">${total - correct}</span><span class="lbl">Incorrect</span></div>
        <div class="stat"><span class="num mono">${total ? Math.round((correct / total) * 100) : 0}%</span><span class="lbl">Accuracy</span></div>
      </div>
      <button class="btn btn-primary" style="margin-top:22px" id="doneBtn">Back to Home</button>
    </div>
  `;
  root.querySelector("#doneBtn").addEventListener("click", () => goTo("home"));
}

function confirmExit(root) {
  if (state.index === 0 && state.results.length === 0) { goTo("home"); return; }
  confirmDialog({
    title: "Exit study session?",
    message: `Progress on ${state.results.length} answered card${state.results.length === 1 ? "" : "s"} is already saved. You can pick up later from a new Daily Goal.`,
    confirmLabel: "Exit",
    danger: false,
    onConfirm: () => { clearInterval(state && state._timerHandle); toast("Progress saved"); goTo("home"); },
  });
}

function escapeHTML(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}
