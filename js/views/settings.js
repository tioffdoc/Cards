import * as db from "../db.js";
import { formatDate } from "../utils.js";
import { icon } from "../icons.js";
import { toast, confirmDialog } from "../ui.js";
import { goTo } from "../nav.js";

const ACCENTS = [
  { id: "teal", hex: "#1F7A63" },
  { id: "blue", hex: "#2E6FA7" },
  { id: "violet", hex: "#6754A6" },
  { id: "coral", hex: "#C0563B" },
  { id: "rose", hex: "#B23A5D" },
];
const DATE_FORMATS = ["dd/mm/yyyy", "mm/dd/yyyy", "yyyy/mm/dd"];

export function applySettingsToDocument(settings) {
  document.documentElement.setAttribute("data-theme", settings.theme);
  document.documentElement.setAttribute("data-accent", settings.accent);
  document.documentElement.setAttribute("data-font-size", settings.fontSize);
}

function formatDateTime(iso, dateFormat) {
  if (!iso) return "Never";
  const d = new Date(iso);
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return `${formatDate(d, dateFormat)} at ${time}`;
}

export function renderSettingsSection(container) {
  const settings = db.getSettings();
  const status = db.getBackupStatus();

  container.innerHTML = `
    <div class="settings-row">
      <div><div class="label">Appearance</div><div class="sub">Light or dark theme</div></div>
      <div class="segmented" style="width:150px" id="themeSeg">
        <button data-theme="light" class="${settings.theme === "light" ? "active" : ""}">${icon("sun")}</button>
        <button data-theme="dark" class="${settings.theme === "dark" ? "active" : ""}">${icon("moon")}</button>
      </div>
    </div>

    <div class="settings-row" style="display:block">
      <div class="label" style="margin-bottom:10px">Accent color</div>
      <div class="swatch-row" id="accentRow">
        ${ACCENTS.map((a) => `<button class="swatch ${settings.accent === a.id ? "selected" : ""}" data-accent="${a.id}" style="background:${a.hex}">${settings.accent === a.id ? icon("check") : ""}</button>`).join("")}
      </div>
    </div>

    <div class="settings-row">
      <div><div class="label">Font size</div><div class="sub">Applies across the app</div></div>
      <div class="segmented" style="width:190px" id="fontSeg">
        <button data-font="small" class="${settings.fontSize === "small" ? "active" : ""}">Small</button>
        <button data-font="medium" class="${settings.fontSize === "medium" ? "active" : ""}">Medium</button>
        <button data-font="large" class="${settings.fontSize === "large" ? "active" : ""}">Large</button>
      </div>
    </div>

    <div class="settings-row" style="display:block">
      <div class="label" style="margin-bottom:8px">Date format</div>
      <div class="stack" style="gap:0">
        ${DATE_FORMATS.map((f) => `<label class="radio-row"><input type="radio" name="dateFmt" value="${f}" ${settings.dateFormat === f ? "checked" : ""}/> ${f}</label>`).join("")}
      </div>
    </div>

    <div class="settings-row" style="display:block">
      <div class="label" style="margin-bottom:6px">Backup and restore</div>
      <p class="muted" style="font-size:var(--fs-caption);margin:0 0 12px">
        Last exported: ${formatDateTime(status.lastExportAt, settings.dateFormat)}<br/>
        Last restored: ${formatDateTime(status.lastImportAt, settings.dateFormat)}
      </p>
      <p class="muted" style="font-size:var(--fs-caption);margin:0 0 12px">
        Syncing devices manually: export here, send yourself the file (AirDrop, email, iCloud/Google Drive), then Restore on the other device. Always export from whichever device has the newest data first — Restore replaces everything on the device you run it on.
      </p>
      <div class="row" style="gap:10px">
        <button class="btn btn-secondary" id="exportBtn" style="flex:1">${icon("download")} Export</button>
        <button class="btn btn-secondary" id="importBtn" style="flex:1">${icon("upload")} Restore</button>
      </div>
      <input type="file" accept="application/json" id="importFile" style="display:none" />
    </div>
  `;

  container.querySelectorAll("#themeSeg [data-theme]").forEach((btn) => btn.addEventListener("click", () => {
    const s = db.setSettings({ theme: btn.dataset.theme });
    applySettingsToDocument(s);
    renderSettingsSection(container);
  }));

  container.querySelectorAll("#accentRow [data-accent]").forEach((btn) => btn.addEventListener("click", () => {
    const s = db.setSettings({ accent: btn.dataset.accent });
    applySettingsToDocument(s);
    renderSettingsSection(container);
  }));

  container.querySelectorAll("#fontSeg [data-font]").forEach((btn) => btn.addEventListener("click", () => {
    const s = db.setSettings({ fontSize: btn.dataset.font });
    applySettingsToDocument(s);
    renderSettingsSection(container);
  }));

  container.querySelectorAll('input[name="dateFmt"]').forEach((r) => r.addEventListener("change", (e) => {
    db.setSettings({ dateFormat: e.target.value });
    renderSettingsSection(container);
  }));

  container.querySelector("#exportBtn").addEventListener("click", async () => {
    const data = await db.exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `flashcards-backup-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    db.setBackupStatus({ lastExportAt: new Date().toISOString() });
    toast("Backup exported");
    renderSettingsSection(container);
  });

  const fileInput = container.querySelector("#importFile");
  container.querySelector("#importBtn").addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        confirmDialog({
          title: "Restore backup?",
          message: "This replaces your current subjects, topics, flashcards, and progress with the contents of this file.",
          confirmLabel: "Restore",
          onConfirm: async () => {
            await db.importAll(data);
            db.setBackupStatus({ lastImportAt: new Date().toISOString() });
            const s = db.getSettings();
            applySettingsToDocument(s);
            toast("Backup restored");
            goTo("home");
          },
        });
      } catch (err) {
        toast("That file isn't a valid backup");
      }
      fileInput.value = "";
    };
    reader.readAsText(file);
  });
}
