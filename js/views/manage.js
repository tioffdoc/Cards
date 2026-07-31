import * as db from "../db.js";
import { formatDate } from "../utils.js";
import { icon } from "../icons.js";
import { openSheet, confirmDialog, toast } from "../ui.js";

let loc = { subjectId: null, topicId: null };

export function renderManage(root, params) {
  if (params && params.subjectId) loc.subjectId = params.subjectId;
  if (!loc.subjectId) loc = { subjectId: null, topicId: null };
  draw(root);
}

function draw(root) {
  if (loc.topicId) return drawFlashcards(root);
  if (loc.subjectId) return drawTopics(root);
  return drawSubjects(root);
}

/* ---------------- Subjects ---------------- */

function drawSubjects(root) {
  const subjects = db.getSubjects();
  root.innerHTML = `
    <div class="row between" style="margin-bottom:10px">
      <h1 style="font-size:var(--fs-h2);font-weight:800">Subjects</h1>
      <button class="icon-btn" id="addSubject" style="background:var(--accent-bg);color:var(--accent)">${icon("plus")}</button>
    </div>
    <div id="list">${subjects.length ? "" : emptyState("layers", "No subjects yet. Tap + to add one.")}</div>
  `;
  const list = root.querySelector("#list");
  subjects.forEach((s) => list.appendChild(subjectRow(s)));

  root.querySelector("#addSubject").addEventListener("click", () => {
    openTextSheet({ title: "New Subject", label: "Subject name", placeholder: "e.g. Cardiology" }, (name) => {
      const s = db.addSubject(name);
      loc.subjectId = s.id;
      draw(root);
    });
  });
}

function subjectRow(s) {
  const topicCount = db.getTopics(s.id).length;
  const row = document.createElement("div");
  row.className = "list-row has-delete";
  row.innerHTML = `
    <div class="list-row-main">
      <span class="title">${escapeHTML(s.name)}</span>
      <span class="meta">${topicCount} topic${topicCount === 1 ? "" : "s"}</span>
      ${icon("chevronRight")}
    </div>`;
  row.querySelector(".list-row-main").addEventListener("click", () => { loc.subjectId = s.id; loc.topicId = null; draw(document.getElementById("view")); });
  row.addEventListener("contextmenu", (e) => { e.preventDefault(); askDeleteSubject(s); });
  const del = document.createElement("button");
  del.className = "icon-btn"; del.style.position = "absolute"; del.style.right = "2px"; del.style.top = "6px";
  del.innerHTML = icon("trash");
  del.addEventListener("click", (e) => { e.stopPropagation(); askDeleteSubject(s); });
  row.style.position = "relative";
  row.appendChild(del);
  return row;
}

function askDeleteSubject(s) {
  confirmDialog({
    title: `Delete "${s.name}"?`,
    message: "This removes the subject and all of its topics and flashcards.",
    onConfirm: () => { db.deleteSubject(s.id); toast("Subject deleted"); draw(document.getElementById("view")); },
  });
}

/* ---------------- Topics ---------------- */

function drawTopics(root) {
  const subject = db.getSubjects().find((s) => s.id === loc.subjectId);
  if (!subject) { loc = { subjectId: null, topicId: null }; return drawSubjects(root); }
  const topics = db.getTopics(subject.id);

  root.innerHTML = `
    <button class="btn btn-ghost" id="back" style="padding-left:0;margin-bottom:4px">&larr; Subjects</button>
    <div class="row between" style="margin-bottom:10px">
      <h1 style="font-size:var(--fs-h2);font-weight:800">${escapeHTML(subject.name)}</h1>
      <button class="icon-btn" id="addTopic" style="background:var(--accent-bg);color:var(--accent)">${icon("plus")}</button>
    </div>
    <div id="list">${topics.length ? "" : emptyState("layers", "No topics yet. Tap + to add one.")}</div>
  `;
  const list = root.querySelector("#list");
  topics.forEach((t) => list.appendChild(topicRow(t)));

  root.querySelector("#back").addEventListener("click", () => { loc.subjectId = null; draw(root); });
  root.querySelector("#addTopic").addEventListener("click", () => {
    openTextSheet({ title: "New Topic", label: "Topic name", placeholder: "e.g. Arrhythmias" }, (name) => {
      const t = db.addTopic(subject.id, name);
      loc.topicId = t.id;
      draw(root);
    });
  });
}

function topicRow(t) {
  const cardCount = db.getFlashcards(t.id).length;
  const row = document.createElement("div");
  row.className = "list-row has-delete";
  row.style.position = "relative";
  row.innerHTML = `
    <div class="list-row-main">
      <span class="title">${escapeHTML(t.name)}</span>
      <span class="meta">${cardCount} card${cardCount === 1 ? "" : "s"}</span>
      ${icon("chevronRight")}
    </div>`;
  row.querySelector(".list-row-main").addEventListener("click", () => { loc.topicId = t.id; draw(document.getElementById("view")); });
  const del = document.createElement("button");
  del.className = "icon-btn"; del.style.position = "absolute"; del.style.right = "2px"; del.style.top = "6px";
  del.innerHTML = icon("trash");
  del.addEventListener("click", (e) => {
    e.stopPropagation();
    confirmDialog({
      title: `Delete "${t.name}"?`,
      message: "This removes the topic and all of its flashcards.",
      onConfirm: () => { db.deleteTopic(t.id); toast("Topic deleted"); draw(document.getElementById("view")); },
    });
  });
  row.appendChild(del);
  return row;
}

/* ---------------- Flashcards ---------------- */

function drawFlashcards(root) {
  const subject = db.getSubjects().find((s) => s.id === loc.subjectId);
  const topic = db.getTopics().find((t) => t.id === loc.topicId);
  if (!subject || !topic) { loc.topicId = null; return drawTopics(root); }
  const cards = db.getFlashcards(topic.id);

  root.innerHTML = `
    <button class="btn btn-ghost" id="back" style="padding-left:0;margin-bottom:4px">&larr; ${escapeHTML(subject.name)}</button>
    <div class="row between" style="margin-bottom:10px">
      <h1 style="font-size:var(--fs-h2);font-weight:800">${escapeHTML(topic.name)}</h1>
      <button class="icon-btn" id="addCard" style="background:var(--accent-bg);color:var(--accent)">${icon("plus")}</button>
    </div>
    <div id="list">${cards.length ? "" : emptyState("bookPlus", "No flashcards yet. Tap + to add one.")}</div>
  `;
  const list = root.querySelector("#list");
  cards.forEach((c) => list.appendChild(cardRow(c)));

  root.querySelector("#back").addEventListener("click", () => { loc.topicId = null; draw(root); });
  root.querySelector("#addCard").addEventListener("click", () => openCardEditor(null, subject.id, topic.id, root));
}

function cardRow(c) {
  const dateFormat = db.getSettings().dateFormat;
  const row = document.createElement("div");
  row.className = "list-row has-delete";
  row.style.position = "relative";
  row.innerHTML = `
    <div class="list-row-main">
      <span class="title" style="max-width:60%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHTML(c.front)}</span>
      <span class="meta">Added ${formatDate(c.createdAt, dateFormat)}</span>
      ${icon("chevronRight")}
    </div>`;
  row.querySelector(".list-row-main").addEventListener("click", () => openCardEditor(c, c.subjectId, c.topicId, document.getElementById("view")));
  const del = document.createElement("button");
  del.className = "icon-btn"; del.style.position = "absolute"; del.style.right = "2px"; del.style.top = "6px";
  del.innerHTML = icon("trash");
  del.addEventListener("click", (e) => {
    e.stopPropagation();
    confirmDialog({
      title: "Delete flashcard?",
      message: "This can't be undone.",
      onConfirm: () => { db.deleteFlashcard(c.id); toast("Flashcard deleted"); draw(document.getElementById("view")); },
    });
  });
  row.appendChild(del);
  return row;
}

function openCardEditor(card, subjectId, topicId, root) {
  const isEdit = !!card;
  openSheet(`
    <div class="sheet-title">${isEdit ? "Edit Flashcard" : "New Flashcard"}</div>
    <div class="stack">
      <label class="field"><span>Front — Question</span><textarea id="fFront">${card ? escapeHTML(card.front) : ""}</textarea></label>
      <label class="field"><span>Back — Answer</span><textarea id="fAnswer">${card ? escapeHTML(card.answer) : ""}</textarea></label>
      <label class="field"><span>Explanation (optional)</span><textarea id="fExplain">${card ? escapeHTML(card.explanation) : ""}</textarea></label>
      <label class="field">
        <span>Image (optional)</span>
        <input type="file" accept="image/*" id="fImage" />
      </label>
      <div id="imgPreviewWrap">${card && card.image ? `<img src="${card.image}" style="max-width:100%;border-radius:8px" id="imgPreview"/>` : ""}</div>
      <button class="btn btn-primary btn-block" id="saveCard" style="margin-top:6px">SAVE</button>
      ${isEdit ? `<button class="btn btn-danger btn-block" id="deleteCard">Delete Flashcard</button>` : ""}
    </div>
  `, {
    onMount: (sheetEl, close) => {
      let imageData = card ? card.image : null;
      sheetEl.querySelector("#fImage").addEventListener("change", (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          imageData = reader.result;
          sheetEl.querySelector("#imgPreviewWrap").innerHTML = `<img src="${imageData}" style="max-width:100%;border-radius:8px"/>`;
        };
        reader.readAsDataURL(file);
      });

      sheetEl.querySelector("#saveCard").addEventListener("click", () => {
        const front = sheetEl.querySelector("#fFront").value.trim();
        const answer = sheetEl.querySelector("#fAnswer").value.trim();
        const explanation = sheetEl.querySelector("#fExplain").value.trim();
        if (!front || !answer) { toast("Front and Back are required"); return; }
        if (isEdit) {
          db.updateFlashcard(card.id, { front, answer, explanation, image: imageData });
          toast("Flashcard updated");
        } else {
          db.addFlashcard({ subjectId, topicId, front, answer, explanation, image: imageData });
          toast("Flashcard added");
        }
        close();
        draw(root);
      });

      if (isEdit) {
        sheetEl.querySelector("#deleteCard").addEventListener("click", () => {
          close();
          confirmDialog({
            title: "Delete flashcard?",
            message: "This can't be undone.",
            onConfirm: () => { db.deleteFlashcard(card.id); toast("Flashcard deleted"); draw(root); },
          });
        });
      }
    },
  });
}

/* ---------------- shared bits ---------------- */

function openTextSheet({ title, label, placeholder }, onSave) {
  openSheet(`
    <div class="sheet-title">${title}</div>
    <label class="field"><span>${label}</span><input type="text" id="tVal" placeholder="${placeholder || ""}" /></label>
    <button class="btn btn-primary btn-block" id="tSave" style="margin-top:14px">SAVE</button>
  `, {
    onMount: (sheetEl, close) => {
      const input = sheetEl.querySelector("#tVal");
      input.focus();
      sheetEl.querySelector("#tSave").addEventListener("click", () => {
        const val = input.value.trim();
        if (!val) { toast("Name is required"); return; }
        close();
        onSave(val);
      });
    },
  });
}

function emptyState(iconName, text) {
  return `<div class="center-empty">${icon(iconName)}<p>${text}</p></div>`;
}

function escapeHTML(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}
