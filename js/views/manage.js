import * as db from "../db.js";
import { formatDate, cardImages } from "../utils.js";
import { icon } from "../icons.js";
import { openSheet, confirmDialog, toast } from "../ui.js";

let loc = { subjectId: null, topicId: null };

export async function renderManage(root, params) {
  if (params && params.subjectId) loc.subjectId = params.subjectId;
  if (!loc.subjectId) loc = { subjectId: null, topicId: null };
  await draw(root);
}

async function draw(root) {
  if (loc.topicId) return drawFlashcards(root);
  if (loc.subjectId) return drawTopics(root);
  return drawSubjects(root);
}

/* ---------------- Subjects ---------------- */

async function drawSubjects(root) {
  const [subjects, topics] = await Promise.all([db.getSubjects(), db.getTopics()]);
  root.innerHTML = `
    <div class="row between" style="margin-bottom:10px">
      <h1 style="font-size:var(--fs-h2);font-weight:800">Subjects</h1>
      <button class="icon-btn" id="addSubject" style="background:var(--accent-bg);color:var(--accent)">${icon("plus")}</button>
    </div>
    <div id="list">${subjects.length ? "" : emptyState("layers", "No subjects yet. Tap + to add one.")}</div>
  `;
  const list = root.querySelector("#list");
  subjects.forEach((s) => {
    const topicCount = topics.filter((t) => t.subjectId === s.id).length;
    list.appendChild(subjectRow(s, topicCount));
  });

  root.querySelector("#addSubject").addEventListener("click", () => {
    openTextSheet({ title: "New Subject", label: "Subject name", placeholder: "e.g. Cardiology" }, async (name) => {
      const s = await db.addSubject(name);
      loc.subjectId = s.id;
      await draw(root);
    });
  });
}

function subjectRow(s, topicCount) {
  const row = document.createElement("div");
  row.className = "list-row has-delete";
  row.style.position = "relative";
  row.innerHTML = `
    <div class="list-row-main">
      <span class="title">${escapeHTML(s.name)}</span>
      <span class="meta">${topicCount} topic${topicCount === 1 ? "" : "s"}</span>
      ${icon("chevronRight")}
    </div>`;
  row.querySelector(".list-row-main").addEventListener("click", async () => {
    loc.subjectId = s.id; loc.topicId = null;
    await draw(document.getElementById("view"));
  });
  const del = document.createElement("button");
  del.className = "icon-btn"; del.style.position = "absolute"; del.style.right = "2px"; del.style.top = "6px";
  del.innerHTML = icon("trash");
  del.addEventListener("click", (e) => { e.stopPropagation(); askDeleteSubject(s); });
  row.appendChild(del);
  return row;
}

function askDeleteSubject(s) {
  confirmDialog({
    title: `Delete "${s.name}"?`,
    message: "This removes the subject and all of its topics and flashcards.",
    onConfirm: async () => {
      await db.deleteSubject(s.id);
      toast("Subject deleted");
      await draw(document.getElementById("view"));
    },
  });
}

/* ---------------- Topics ---------------- */

async function drawTopics(root) {
  const subjects = await db.getSubjects();
  const subject = subjects.find((s) => s.id === loc.subjectId);
  if (!subject) { loc = { subjectId: null, topicId: null }; return drawSubjects(root); }
  const [topics, cards] = await Promise.all([db.getTopics(subject.id), db.getFlashcards()]);

  root.innerHTML = `
    <button class="btn btn-ghost" id="back" style="padding-left:0;margin-bottom:4px">&larr; Subjects</button>
    <div class="row between" style="margin-bottom:10px">
      <h1 style="font-size:var(--fs-h2);font-weight:800">${escapeHTML(subject.name)}</h1>
      <button class="icon-btn" id="addTopic" style="background:var(--accent-bg);color:var(--accent)">${icon("plus")}</button>
    </div>
    <div id="list">${topics.length ? "" : emptyState("layers", "No topics yet. Tap + to add one.")}</div>
  `;
  const list = root.querySelector("#list");
  topics.forEach((t) => {
    const cardCount = cards.filter((c) => c.topicId === t.id).length;
    list.appendChild(topicRow(t, cardCount));
  });

  root.querySelector("#back").addEventListener("click", async () => { loc.subjectId = null; await draw(root); });
  root.querySelector("#addTopic").addEventListener("click", () => {
    openTextSheet({ title: "New Topic", label: "Topic name", placeholder: "e.g. Arrhythmias" }, async (name) => {
      const t = await db.addTopic(subject.id, name);
      loc.topicId = t.id;
      await draw(root);
    });
  });
}

function topicRow(t, cardCount) {
  const row = document.createElement("div");
  row.className = "list-row has-delete";
  row.style.position = "relative";
  row.innerHTML = `
    <div class="list-row-main">
      <span class="title">${escapeHTML(t.name)}</span>
      <span class="meta">${cardCount} card${cardCount === 1 ? "" : "s"}</span>
      ${icon("chevronRight")}
    </div>`;
  row.querySelector(".list-row-main").addEventListener("click", async () => {
    loc.topicId = t.id;
    await draw(document.getElementById("view"));
  });
  const del = document.createElement("button");
  del.className = "icon-btn"; del.style.position = "absolute"; del.style.right = "2px"; del.style.top = "6px";
  del.innerHTML = icon("trash");
  del.addEventListener("click", (e) => {
    e.stopPropagation();
    confirmDialog({
      title: `Delete "${t.name}"?`,
      message: "This removes the topic and all of its flashcards.",
      onConfirm: async () => {
        await db.deleteTopic(t.id);
        toast("Topic deleted");
        await draw(document.getElementById("view"));
      },
    });
  });
  row.appendChild(del);
  return row;
}

/* ---------------- Flashcards ---------------- */

async function drawFlashcards(root) {
  const [subjects, topics] = await Promise.all([db.getSubjects(), db.getTopics()]);
  const subject = subjects.find((s) => s.id === loc.subjectId);
  const topic = topics.find((t) => t.id === loc.topicId);
  if (!subject || !topic) { loc.topicId = null; return drawTopics(root); }
  const cards = await db.getFlashcards(topic.id);
  const dateFormat = db.getSettings().dateFormat;

  root.innerHTML = `
    <button class="btn btn-ghost" id="back" style="padding-left:0;margin-bottom:4px">&larr; ${escapeHTML(subject.name)}</button>
    <div class="row between" style="margin-bottom:10px">
      <h1 style="font-size:var(--fs-h2);font-weight:800">${escapeHTML(topic.name)}</h1>
      <button class="icon-btn" id="addCard" style="background:var(--accent-bg);color:var(--accent)">${icon("plus")}</button>
    </div>
    <div id="list">${cards.length ? "" : emptyState("bookPlus", "No flashcards yet. Tap + to add one.")}</div>
  `;
  const list = root.querySelector("#list");
  cards.forEach((c) => list.appendChild(cardRow(c, dateFormat)));

  root.querySelector("#back").addEventListener("click", async () => { loc.topicId = null; await draw(root); });
  root.querySelector("#addCard").addEventListener("click", () => openCardEditor(null, subject.id, topic.id, root));
}

function cardRow(c, dateFormat) {
  const imgCount = cardImages(c).length;
  const row = document.createElement("div");
  row.className = "list-row has-delete";
  row.style.position = "relative";
  row.innerHTML = `
    <div class="list-row-main">
      <span class="title" style="max-width:60%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHTML(c.front)}</span>
      <span class="meta">
        ${imgCount ? `<span class="row" style="display:inline-flex;gap:3px;vertical-align:middle;margin-right:8px">${icon("image")} ${imgCount}</span>` : ""}
        Added ${formatDate(c.createdAt, dateFormat)}
      </span>
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
      onConfirm: async () => {
        await db.deleteFlashcard(c.id);
        toast("Flashcard deleted");
        await draw(document.getElementById("view"));
      },
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
        <span>Images (optional — pick as many as you like)</span>
        <input type="file" accept="image/*" multiple id="fImage" />
      </label>
      <p class="muted" id="imgStatus" style="font-size:var(--fs-caption)"></p>
      <div id="imgGrid" class="img-grid"></div>
      <button class="btn btn-primary btn-block" id="saveCard" style="margin-top:6px">SAVE</button>
      ${isEdit ? `<button class="btn btn-danger btn-block" id="deleteCard">Delete Flashcard</button>` : ""}
    </div>
  `, {
    onMount: (sheetEl, close) => {
      let images = cardImages(card); // handles legacy single-image cards too
      const statusEl = sheetEl.querySelector("#imgStatus");
      const gridEl = sheetEl.querySelector("#imgGrid");

      function renderGrid() {
        gridEl.innerHTML = images.map((src, i) => `
          <div class="img-thumb">
            <img src="${src}" alt="" />
            <button type="button" class="img-thumb-remove" data-remove="${i}" aria-label="Remove image">${icon("x")}</button>
          </div>
        `).join("");
        gridEl.querySelectorAll("[data-remove]").forEach((btn) => {
          btn.addEventListener("click", () => {
            images.splice(Number(btn.dataset.remove), 1);
            renderGrid();
            statusEl.textContent = images.length ? `${images.length} image${images.length === 1 ? "" : "s"} attached` : "";
          });
        });
      }
      renderGrid();
      if (images.length) statusEl.textContent = `${images.length} image${images.length === 1 ? "" : "s"} attached`;

      sheetEl.querySelector("#fImage").addEventListener("change", async (e) => {
        const files = Array.from(e.target.files || []);
        if (!files.length) return;
        statusEl.textContent = files.length > 1 ? `Compressing ${files.length} images…` : "Compressing image…";
        try {
          const compressed = await Promise.all(files.map((f) => compressImage(f)));
          images.push(...compressed);
          renderGrid();
          statusEl.textContent = `${images.length} image${images.length === 1 ? "" : "s"} attached`;
        } catch (err) {
          statusEl.textContent = "Couldn't process one of those images — try again.";
        }
        e.target.value = "";
      });

      sheetEl.querySelector("#saveCard").addEventListener("click", async () => {
        const front = sheetEl.querySelector("#fFront").value.trim();
        const answer = sheetEl.querySelector("#fAnswer").value.trim();
        const explanation = sheetEl.querySelector("#fExplain").value.trim();
        if (!front || !answer) { toast("Front and Back are required"); return; }

        const saveBtn = sheetEl.querySelector("#saveCard");
        saveBtn.disabled = true;
        saveBtn.textContent = "Saving…";
        try {
          if (isEdit) {
            await db.updateFlashcard(card.id, { front, answer, explanation, images });
            toast("Flashcard updated");
          } else {
            await db.addFlashcard({ subjectId, topicId, front, answer, explanation, images });
            toast("Flashcard added");
          }
          close();
          await draw(root);
        } catch (err) {
          saveBtn.disabled = false;
          saveBtn.textContent = "SAVE";
          toast("Couldn't save — " + (err.message || "please try again"));
        }
      });

      if (isEdit) {
        sheetEl.querySelector("#deleteCard").addEventListener("click", () => {
          close();
          confirmDialog({
            title: "Delete flashcard?",
            message: "This can't be undone.",
            onConfirm: async () => {
              await db.deleteFlashcard(card.id);
              toast("Flashcard deleted");
              await draw(root);
            },
          });
        });
      }
    },
  });
}

// Downscale + re-encode any picked image before storing it, so a single
// full-resolution phone photo doesn't balloon a flashcard's size. Long
// edge capped at 1400px, JPEG quality 0.82 — plenty for on-screen review.
function compressImage(file, maxDim = 1400, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Couldn't read that image"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Couldn't read that image"));
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          const scale = maxDim / Math.max(width, height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
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
