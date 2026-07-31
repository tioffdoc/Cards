import * as db from "../db.js";
import { icon } from "../icons.js";
import { goTo } from "../nav.js";

export function renderSearch(root) {
  root.innerHTML = `
    <div class="row" style="margin-bottom:14px">
      ${icon("search")}
      <input type="text" id="q" placeholder="Search subjects, topics, questions, answers…" style="flex:1" autofocus />
    </div>
    <div id="results"></div>
  `;
  const input = root.querySelector("#q");
  const results = root.querySelector("#results");
  input.addEventListener("input", () => draw(results, input.value.trim().toLowerCase()));
  draw(results, "");
}

function draw(results, q) {
  if (!q) {
    results.innerHTML = `<div class="center-empty">${icon("search")}<p>Start typing to search your flashcards.</p></div>`;
    return;
  }

  const subjects = db.getSubjects();
  const topics = db.getTopics();
  const cards = db.getFlashcards();

  const matchSubjects = subjects.filter((s) => s.name.toLowerCase().includes(q));
  const matchTopics = topics.filter((t) => t.name.toLowerCase().includes(q));
  const matchCards = cards.filter((c) => c.front.toLowerCase().includes(q) || c.answer.toLowerCase().includes(q));

  const nothing = !matchSubjects.length && !matchTopics.length && !matchCards.length;
  if (nothing) {
    results.innerHTML = `<div class="center-empty">${icon("x")}<p>No matches for "${escapeHTML(q)}".</p></div>`;
    return;
  }

  results.innerHTML = `
    ${matchSubjects.length ? section("Subjects", matchSubjects.map((s) => rowHTML(s.name, "", s.id, "subject"))) : ""}
    ${matchTopics.length ? section("Topics", matchTopics.map((t) => rowHTML(t.name, subjectName(subjects, t.subjectId), t.id, "topic"))) : ""}
    ${matchCards.length ? section("Flashcards", matchCards.map((c) => rowHTML(c.front, subjectName(subjects, c.subjectId) + " · " + topicName(topics, c.topicId), c.id, "card"))) : ""}
  `;

  results.querySelectorAll("[data-goto]").forEach((row) => {
    row.addEventListener("click", () => {
      const [kind, id] = row.dataset.goto.split(":");
      if (kind === "subject") goTo("manage", { subjectId: id });
      if (kind === "topic") { const t = topics.find((x) => x.id === id); goTo("manage", { subjectId: t.subjectId }); }
      if (kind === "card") { const c = cards.find((x) => x.id === id); goTo("manage", { subjectId: c.subjectId }); }
    });
  });
}

function section(title, rowsHTML) {
  return `<div class="section-label">${title}</div><div class="stack" style="gap:6px;margin-bottom:12px">${rowsHTML.join("")}</div>`;
}

function rowHTML(title, meta, id, kind) {
  return `<div class="list-row" data-goto="${kind}:${id}">
    <div class="list-row-main"><span class="title" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHTML(title)}</span>
    ${meta ? `<span class="meta">${escapeHTML(meta)}</span>` : ""}</div></div>`;
}

function subjectName(subjects, id) { return subjects.find((s) => s.id === id)?.name || ""; }
function topicName(topics, id) { return topics.find((t) => t.id === id)?.name || ""; }

function escapeHTML(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}
