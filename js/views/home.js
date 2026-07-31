import * as db from "../db.js";
import { getGreeting, formatDate, computeTodayStats, computeWeeklyStats, dailyTrend, weeklyTrend, formatDuration } from "../utils.js";
import { lineChartSVG, vitalsRule } from "../charts.js";
import { icon } from "../icons.js";
import { goTo } from "../nav.js";
import { toast } from "../ui.js";

// local, ephemeral state for the Daily Goal builder (resets per visit)
let goal = { count: 20, subjectIds: [], topicIds: [], mode: "all", subMode: "randomAll" };

export function renderHome(root) {
  const profile = db.getProfile();
  const settings = db.getSettings();
  const subjects = db.getSubjects();
  const topics = db.getTopics();
  const flashcards = db.getFlashcards();
  const logs = db.getLogs();

  const today = computeTodayStats(logs, topics);
  const week = computeWeeklyStats(logs, topics);
  const daily = dailyTrend(logs, 7);
  const weekly = weeklyTrend(logs, 6);

  root.innerHTML = `
    <div class="stack">
      <div>
        <h1 style="font-size:var(--fs-h1);font-weight:800;">${getGreeting(profile.name)}</h1>
        <p class="muted mono" style="font-size:var(--fs-caption);margin-top:2px">${formatDate(new Date(), settings.dateFormat)}</p>
        ${vitalsRule(560, 14)}
      </div>

      <section class="card">
        <div class="card-header"><h2>Today</h2></div>
        <div class="stat-grid">
          <div class="stat"><span class="num mono">${today.completed}</span><span class="lbl">Completed</span></div>
          <div class="stat up"><span class="num mono">${today.correct}</span><span class="lbl">Correct</span></div>
          <div class="stat down"><span class="num mono">${today.incorrect}</span><span class="lbl">Incorrect</span></div>
        </div>
        ${today.perTopic.length ? `
          <div class="section-label" style="margin-top:14px">Avg. response time by topic</div>
          <div class="stack" style="gap:6px">
            ${today.perTopic.map((t) => `
              <div class="row between">
                <span>${t.name}</span>
                <span class="row" style="gap:6px">
                  <span class="mono muted">${formatDuration(t.avgMs)}</span>
                  ${t.slow ? `<span class="pill warn">Slower than usual</span>` : ""}
                </span>
              </div>`).join("")}
          </div>` : `<p class="muted" style="margin-top:10px">No cards studied yet today.</p>`}
      </section>

      <section class="card">
        <div class="card-header"><h2>Weekly Progress</h2></div>
        <div class="stat-grid" style="grid-template-columns:1fr 1fr">
          <div class="stat up"><span class="num mono">${week.correct}</span><span class="lbl">Correct</span></div>
          <div class="stat down"><span class="num mono">${week.incorrect}</span><span class="lbl">Incorrect</span></div>
        </div>

        <div class="section-label" style="margin-top:14px">Weakest topics</div>
        ${week.weakest.length ? `
          <div class="stack" style="gap:6px">
            ${week.weakest.map((t) => `
              <div class="row between">
                <span>${t.name}</span>
                <span class="pill down">${t.incorrectCount} missed</span>
              </div>`).join("")}
          </div>` : `<p class="muted">Not enough data this week yet.</p>`}

        <div class="section-label" style="margin-top:14px">Most improved</div>
        ${week.improved.length ? `
          <div class="stack" style="gap:6px">
            ${week.improved.map((t) => `
              <div class="row between">
                <span>${t.name}</span>
                <span class="pill up">+${t.delta}</span>
              </div>`).join("")}
          </div>` : `<p class="muted">No week-over-week comparison yet.</p>`}
      </section>

      <section class="card">
        <div class="card-header"><h2>Progress Graphs</h2></div>
        <div class="section-label">Daily progress</div>
        <div class="chart-wrap">${lineChartSVG(daily)}</div>
        <div class="section-label" style="margin-top:14px">Weekly progress</div>
        <div class="chart-wrap">${lineChartSVG(weekly)}</div>
        <div class="chart-legend">
          <span><span class="dot" style="background:var(--up)"></span>Trending up</span>
          <span><span class="dot" style="background:var(--down)"></span>Trending down</span>
        </div>
      </section>

      <section class="card" id="goalCard">
        <div class="card-header"><h2>Daily Goal</h2></div>
        <div id="goalBody"></div>
      </section>
    </div>
  `;

  renderGoalBuilder(root.querySelector("#goalBody"), subjects, topics, flashcards, logs);
}

function renderGoalBuilder(el, subjects, topics, flashcards, logs) {
  if (!subjects.length) {
    el.innerHTML = `
      <div class="center-empty" style="padding:24px 4px">
        ${icon("bookPlus")}
        <p>Add a subject and some flashcards first, then build a daily goal here.</p>
        <button class="btn btn-primary" style="margin-top:10px" id="goEmptyAdd">Add Flashcards</button>
      </div>`;
    el.querySelector("#goEmptyAdd").addEventListener("click", () => goTo("manage"));
    return;
  }

  const visibleTopics = topics.filter((t) => goal.subjectIds.length === 0 || goal.subjectIds.includes(t.subjectId));

  el.innerHTML = `
    <label class="field">
      <span>Number of flashcards</span>
      <input type="number" min="1" max="200" id="goalCount" value="${goal.count}" />
    </label>

    <div class="section-label" style="margin-top:14px">Subjects</div>
    <div class="wrap">
      ${subjects.map((s) => `<button class="chip ${goal.subjectIds.includes(s.id) ? "selected" : ""}" data-subject="${s.id}">${s.name}</button>`).join("")}
    </div>

    <div class="section-label" style="margin-top:14px">Topics</div>
    <div class="wrap">
      ${visibleTopics.length ? visibleTopics.map((t) => `<button class="chip ${goal.topicIds.includes(t.id) ? "selected" : ""}" data-topic="${t.id}">${t.name}</button>`).join("")
        : `<span class="muted" style="font-size:var(--fs-caption)">Select a subject to see its topics — or leave blank to include all.</span>`}
    </div>

    <div class="section-label" style="margin-top:14px">Card filter</div>
    <div class="segmented" id="modeSeg">
      <button data-mode="incorrect" class="${goal.mode === "incorrect" ? "active" : ""}">Incorrect only</button>
      <button data-mode="all" class="${goal.mode === "all" ? "active" : ""}">All cards</button>
      <button data-mode="random" class="${goal.mode === "random" ? "active" : ""}">Random</button>
    </div>

    ${goal.mode === "random" ? `
      <div class="stack" style="gap:0;margin-top:10px">
        <label class="radio-row"><input type="radio" name="subMode" value="randomIncorrect" ${goal.subMode === "randomIncorrect" ? "checked" : ""}/> Random incorrect flashcards only</label>
        <label class="radio-row"><input type="radio" name="subMode" value="randomAll" ${goal.subMode === "randomAll" ? "checked" : ""}/> Random flashcards from all selected topics</label>
      </div>` : ""}

    <p class="muted" id="goalPreview" style="margin-top:12px;font-size:var(--fs-caption)"></p>
    <button class="btn btn-primary" id="startGoal" style="margin-top:6px">START</button>
  `;

  const queue = buildQueue(goal, flashcards, logs, topics);
  el.querySelector("#goalPreview").textContent = `${Math.min(goal.count, queue.length)} of ${queue.length} matching card(s) ready.`;
  el.querySelector("#startGoal").disabled = queue.length === 0;

  el.querySelector("#goalCount").addEventListener("input", (e) => {
    goal.count = Math.max(1, parseInt(e.target.value || "1", 10));
    renderGoalBuilder(el, subjects, topics, flashcards, logs);
  });

  el.querySelectorAll("[data-subject]").forEach((btn) => btn.addEventListener("click", () => {
    const id = btn.dataset.subject;
    goal.subjectIds = toggle(goal.subjectIds, id);
    // drop topic selections that no longer belong to a selected subject
    const allowed = topics.filter((t) => goal.subjectIds.length === 0 || goal.subjectIds.includes(t.subjectId)).map((t) => t.id);
    goal.topicIds = goal.topicIds.filter((id) => allowed.includes(id));
    renderGoalBuilder(el, subjects, topics, flashcards, logs);
  }));

  el.querySelectorAll("[data-topic]").forEach((btn) => btn.addEventListener("click", () => {
    goal.topicIds = toggle(goal.topicIds, btn.dataset.topic);
    renderGoalBuilder(el, subjects, topics, flashcards, logs);
  }));

  el.querySelectorAll("#modeSeg [data-mode]").forEach((btn) => btn.addEventListener("click", () => {
    goal.mode = btn.dataset.mode;
    renderGoalBuilder(el, subjects, topics, flashcards, logs);
  }));

  el.querySelectorAll('input[name="subMode"]').forEach((r) => r.addEventListener("change", (e) => {
    goal.subMode = e.target.value;
    renderGoalBuilder(el, subjects, topics, flashcards, logs);
  }));

  el.querySelector("#startGoal").addEventListener("click", () => {
    const finalQueue = buildQueue(goal, flashcards, logs, topics).slice(0, goal.count);
    if (!finalQueue.length) { toast("No matching flashcards found."); return; }
    goTo("study", { queue: finalQueue });
  });
}

function toggle(arr, val) {
  return arr.includes(val) ? arr.filter((v) => v !== val) : [...arr, val];
}

function buildQueue(goal, flashcards, logs, topics) {
  const scopedTopicIds = goal.topicIds.length
    ? goal.topicIds
    : topics.filter((t) => goal.subjectIds.length === 0 || goal.subjectIds.includes(t.subjectId)).map((t) => t.id);

  let pool = flashcards.filter((c) => scopedTopicIds.includes(c.topicId));

  const lastResultByCard = {};
  [...logs].sort((a, b) => new Date(a.date) - new Date(b.date)).forEach((l) => {
    lastResultByCard[l.flashcardId] = l.correct;
  });
  const incorrectOnly = (list) => list.filter((c) => lastResultByCard[c.id] === false);

  if (goal.mode === "incorrect") {
    pool = incorrectOnly(pool);
  } else if (goal.mode === "random") {
    pool = goal.subMode === "randomIncorrect" ? incorrectOnly(pool) : pool;
    pool = shuffle([...pool]);
  }
  return pool.map((c) => c.id);
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
