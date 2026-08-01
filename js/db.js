// db.js — the app's data layer.
//
// Subjects / topics / flashcards / study logs live in IndexedDB, which
// has a much larger storage ceiling than localStorage (typically hundreds
// of MB to low GB, vs ~5MB) and is the right place for flashcard content
// that may include images. This is what makes flashcard counts effectively
// unlimited and fixes silent save failures under localStorage's old quota.
//
// Settings / profile stay in localStorage — they're tiny, and reading them
// synchronously on load avoids a flash of the wrong theme before paint.

const DB_NAME = "flashcards-db";
const DB_VERSION = 1;
const STORES = ["subjects", "topics", "flashcards", "logs"];

const LS_KEYS = { settings: "ff.settings", profile: "ff.profile", backupStatus: "ff.backupStatus" };
const DEFAULT_SETTINGS = {
  theme: "light",
  accent: "teal",
  fontSize: "medium",
  dateFormat: "mm/dd/yyyy",
};

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/* ---------------- IndexedDB plumbing ---------------- */

let dbPromise = null;
function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const idb = req.result;
      STORES.forEach((name) => {
        if (!idb.objectStoreNames.contains(name)) {
          const store = idb.createObjectStore(name, { keyPath: "id" });
          if (name === "topics") store.createIndex("subjectId", "subjectId");
          if (name === "flashcards") store.createIndex("topicId", "topicId");
          if (name === "logs") store.createIndex("topicId", "topicId");
        }
      });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }).then(async (idb) => {
    await migrateFromLocalStorageIfNeeded(idb);
    return idb;
  });
  return dbPromise;
}

// One-time migration: earlier versions of this app kept subjects/topics/
// flashcards/logs in localStorage. Pull anything still sitting there into
// IndexedDB exactly once, so switching storage engines never loses data —
// including flashcards that looked "saved" under the old bug but weren't.
const OLD_LS_KEYS = {
  subjects: "ff.subjects",
  topics: "ff.topics",
  flashcards: "ff.flashcards",
  logs: "ff.logs",
};
const MIGRATION_FLAG = "ff.migrated_to_indexeddb_v1";

async function migrateFromLocalStorageIfNeeded(idb) {
  if (localStorage.getItem(MIGRATION_FLAG)) return;
  try {
    const toMigrate = {
      subjects: lsRead(OLD_LS_KEYS.subjects, []),
      topics: lsRead(OLD_LS_KEYS.topics, []),
      flashcards: lsRead(OLD_LS_KEYS.flashcards, []),
      logs: lsRead(OLD_LS_KEYS.logs, []),
    };
    const hasData = Object.values(toMigrate).some((arr) => Array.isArray(arr) && arr.length);
    if (hasData) {
      const tx = idb.transaction(STORES, "readwrite");
      STORES.forEach((name) => {
        const store = tx.objectStore(name);
        (toMigrate[name] || []).forEach((item) => store.put(item));
      });
      await txDone(tx);
    }
  } catch (e) {
    console.error("db: migration from localStorage failed", e);
  } finally {
    localStorage.setItem(MIGRATION_FLAG, "1");
  }
}

function reqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getAll(store) {
  const idb = await openDB();
  return reqToPromise(idb.transaction(store, "readonly").objectStore(store).getAll());
}

async function getOne(store, id) {
  const idb = await openDB();
  return reqToPromise(idb.transaction(store, "readonly").objectStore(store).get(id));
}

async function putOne(store, item) {
  const idb = await openDB();
  const tx = idb.transaction(store, "readwrite");
  tx.objectStore(store).put(item);
  await txDone(tx);
  return item;
}

async function deleteOne(store, id) {
  const idb = await openDB();
  const tx = idb.transaction(store, "readwrite");
  tx.objectStore(store).delete(id);
  await txDone(tx);
}

async function deleteMany(store, ids) {
  if (!ids.length) return;
  const idb = await openDB();
  const tx = idb.transaction(store, "readwrite");
  const os = tx.objectStore(store);
  ids.forEach((id) => os.delete(id));
  await txDone(tx);
}

async function putMany(store, items) {
  const idb = await openDB();
  const tx = idb.transaction(store, "readwrite");
  const os = tx.objectStore(store);
  items.forEach((item) => os.put(item));
  await txDone(tx);
}

async function clearStore(store) {
  const idb = await openDB();
  const tx = idb.transaction(store, "readwrite");
  tx.objectStore(store).clear();
  await txDone(tx);
}

function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error("Save was interrupted — try again."));
  });
}

/* ---------------- localStorage helpers (settings/profile only) ---------------- */

function lsRead(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}
function lsWrite(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

/* ---------------- profile & settings (sync) ---------------- */

export function getProfile() {
  return lsRead(LS_KEYS.profile, { name: "" });
}
export function setProfile(profile) {
  lsWrite(LS_KEYS.profile, profile);
}

export function getSettings() {
  return { ...DEFAULT_SETTINGS, ...lsRead(LS_KEYS.settings, {}) };
}
export function setSettings(patch) {
  const next = { ...getSettings(), ...patch };
  lsWrite(LS_KEYS.settings, next);
  return next;
}

export function getBackupStatus() {
  return lsRead(LS_KEYS.backupStatus, { lastExportAt: null, lastImportAt: null });
}
export function setBackupStatus(patch) {
  const next = { ...getBackupStatus(), ...patch };
  lsWrite(LS_KEYS.backupStatus, next);
  return next;
}

/* ---------------- subjects (async) ---------------- */

export async function getSubjects() {
  return getAll("subjects");
}
export async function addSubject(name) {
  const subj = { id: uid(), name };
  await putOne("subjects", subj);
  return subj;
}
export async function deleteSubject(id) {
  const topics = (await getAll("topics")).filter((t) => t.subjectId === id);
  const topicIds = topics.map((t) => t.id);
  const cards = (await getAll("flashcards")).filter((c) => topicIds.includes(c.topicId));
  await deleteMany("flashcards", cards.map((c) => c.id));
  await deleteMany("topics", topicIds);
  await deleteOne("subjects", id);
}

/* ---------------- topics (async) ---------------- */

export async function getTopics(subjectId = null) {
  const all = await getAll("topics");
  return subjectId ? all.filter((t) => t.subjectId === subjectId) : all;
}
export async function addTopic(subjectId, name) {
  const topic = { id: uid(), subjectId, name };
  await putOne("topics", topic);
  return topic;
}
export async function deleteTopic(id) {
  const cards = (await getAll("flashcards")).filter((c) => c.topicId === id);
  await deleteMany("flashcards", cards.map((c) => c.id));
  await deleteOne("topics", id);
}

/* ---------------- flashcards (async) ---------------- */

export async function getFlashcards(topicId = null) {
  const all = await getAll("flashcards");
  return topicId ? all.filter((c) => c.topicId === topicId) : all;
}
export async function getFlashcard(id) {
  return (await getOne("flashcards", id)) || null;
}
export async function addFlashcard({ topicId, subjectId, front, answer, explanation, image }) {
  const card = {
    id: uid(),
    topicId,
    subjectId,
    front,
    answer,
    explanation: explanation || "",
    image: image || null,
    createdAt: new Date().toISOString(),
  };
  await putOne("flashcards", card);
  return card;
}
export async function updateFlashcard(id, patch) {
  const existing = await getOne("flashcards", id);
  if (!existing) return null;
  const updated = { ...existing, ...patch };
  await putOne("flashcards", updated);
  return updated;
}
export async function deleteFlashcard(id) {
  await deleteOne("flashcards", id);
}

/* ---------------- study logs (async) ---------------- */

export async function getLogs() {
  return getAll("logs");
}
export async function addLog(entry) {
  const log = { id: uid(), date: new Date().toISOString(), ...entry };
  await putOne("logs", log);
  return log;
}

/* ---------------- backup / restore ---------------- */

export async function exportAll() {
  const [subjects, topics, flashcards, logs] = await Promise.all([
    getAll("subjects"), getAll("topics"), getAll("flashcards"), getAll("logs"),
  ]);
  return {
    exportedAt: new Date().toISOString(),
    version: 2,
    subjects, topics, flashcards, logs,
    settings: getSettings(),
    profile: getProfile(),
  };
}

export async function importAll(data) {
  if (!data || typeof data !== "object") throw new Error("Invalid backup file");
  if (Array.isArray(data.subjects)) { await clearStore("subjects"); await putMany("subjects", data.subjects); }
  if (Array.isArray(data.topics)) { await clearStore("topics"); await putMany("topics", data.topics); }
  if (Array.isArray(data.flashcards)) { await clearStore("flashcards"); await putMany("flashcards", data.flashcards); }
  if (Array.isArray(data.logs)) { await clearStore("logs"); await putMany("logs", data.logs); }
  if (data.settings) lsWrite(LS_KEYS.settings, { ...DEFAULT_SETTINGS, ...data.settings });
  if (data.profile) lsWrite(LS_KEYS.profile, data.profile);
}

export async function wipeAll() {
  await Promise.all(STORES.map((s) => clearStore(s)));
  localStorage.removeItem(LS_KEYS.settings);
  localStorage.removeItem(LS_KEYS.profile);
}
