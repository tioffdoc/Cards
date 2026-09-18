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
//
// Every subject/topic/flashcard carries `updatedAt` (epoch ms) and
// `deleted` (bool). These exist for optional cloud sync (see cloud.js):
// deletes are soft (tombstoned, not physically removed) so that if this
// device is offline when a delete happens elsewhere, it still finds out
// about it later instead of the item silently reappearing; `updatedAt`
// lets sync decide which of two conflicting copies of a record is newer.
// None of this changes local-only behavior — getSubjects()/getTopics()/
// getFlashcards() still return exactly what the UI expects, with
// tombstones filtered out.

const DB_NAME = "flashcards-db";
const DB_VERSION = 1;
const STORES = ["subjects", "topics", "flashcards", "logs"];

const LS_KEYS = {
  settings: "ff.settings",
  profile: "ff.profile",
  backupStatus: "ff.backupStatus",
};
const DEFAULT_SETTINGS = {
  theme: "light",
  accent: "teal",
  fontSize: "medium",
  dateFormat: "mm/dd/yyyy",
};

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/* ---------------- cloud-sync mutation hook ----------------
   cloud.js registers itself here (only once signed in) so every local,
   user-driven write also gets pushed to the cloud. Writes that originate
   FROM the cloud pull path never go through this — they use the separate
   putRawIfNewer()/patchRawFields() functions below, which never notify —
   otherwise a pulled remote change would immediately get pushed straight
   back, looping. When nobody's registered (the default), this is a no-op,
   so local-only use is completely unaffected. */
let mutationHook = null;
export function setMutationHook(fn) {
  mutationHook = fn;
}
function notify(store, item) {
  if (!mutationHook) return;
  try {
    mutationHook(store, item);
  } catch (e) {
    console.error("db: mutation hook failed", e);
  }
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
  const next = { ...profile, updatedAt: Date.now() };
  lsWrite(LS_KEYS.profile, next);
  notify("profile", next);
  return next;
}
// Used only by cloud.js when a pulled remote profile wins a conflict —
// writes without notifying, so it never bounces straight back to the cloud.
export function applyRemoteProfile(remoteProfile) {
  const current = getProfile();
  if ((remoteProfile.updatedAt || 0) <= (current.updatedAt || 0)) return false;
  lsWrite(LS_KEYS.profile, remoteProfile);
  return true;
}
// Used only by cloud.js: persists a (freshly timestamped) profile straight
// to localStorage without calling notify() — mirrors putRawIfNewer for the
// IndexedDB-backed stores, so a legacy profile with no updatedAt yet gets a
// timestamp saved locally before being pushed to the cloud, without
// bouncing back through the mutation hook as a second push.
export function putRawProfile(item) {
  lsWrite(LS_KEYS.profile, item);
}

export function getSettings() {
  return { ...DEFAULT_SETTINGS, ...lsRead(LS_KEYS.settings, {}) };
}
export function setSettings(patch) {
  const next = { ...getSettings(), ...patch, updatedAt: Date.now() };
  lsWrite(LS_KEYS.settings, next);
  notify("settings", next);
  return next;
}
export function applyRemoteSettings(remoteSettings) {
  const current = getSettings();
  if ((remoteSettings.updatedAt || 0) <= (current.updatedAt || 0)) return false;
  lsWrite(LS_KEYS.settings, { ...DEFAULT_SETTINGS, ...remoteSettings });
  return true;
}
// Used only by cloud.js: same as putRawProfile above, but for settings.
export function putRawSettings(item) {
  lsWrite(LS_KEYS.settings, { ...DEFAULT_SETTINGS, ...item });
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
  return (await getAll("subjects")).filter((s) => !s.deleted);
}
// Includes soft-deleted tombstones — used by cloud sync only.
export async function getSubjectsRaw() {
  return getAll("subjects");
}
export async function addSubject(name) {
  const subj = { id: uid(), name, updatedAt: Date.now(), deleted: false };
  await putOne("subjects", subj);
  notify("subjects", subj);
  return subj;
}
export async function deleteSubject(id) {
  const now = Date.now();
  const topics = (await getAll("topics")).filter((t) => t.subjectId === id && !t.deleted);
  const topicIds = topics.map((t) => t.id);
  const cards = (await getAll("flashcards")).filter((c) => topicIds.includes(c.topicId) && !c.deleted);

  for (const c of cards) {
    const tomb = { ...c, deleted: true, updatedAt: now };
    await putOne("flashcards", tomb);
    notify("flashcards", tomb);
  }
  for (const t of topics) {
    const tomb = { ...t, deleted: true, updatedAt: now };
    await putOne("topics", tomb);
    notify("topics", tomb);
  }
  const existing = await getOne("subjects", id);
  const tomb = { ...(existing || { id }), deleted: true, updatedAt: now };
  await putOne("subjects", tomb);
  notify("subjects", tomb);
}

/* ---------------- topics (async) ---------------- */

export async function getTopics(subjectId = null) {
  const all = (await getAll("topics")).filter((t) => !t.deleted);
  return subjectId ? all.filter((t) => t.subjectId === subjectId) : all;
}
export async function getTopicsRaw() {
  return getAll("topics");
}
export async function addTopic(subjectId, name) {
  const topic = { id: uid(), subjectId, name, updatedAt: Date.now(), deleted: false };
  await putOne("topics", topic);
  notify("topics", topic);
  return topic;
}
export async function deleteTopic(id) {
  const now = Date.now();
  const cards = (await getAll("flashcards")).filter((c) => c.topicId === id && !c.deleted);
  for (const c of cards) {
    const tomb = { ...c, deleted: true, updatedAt: now };
    await putOne("flashcards", tomb);
    notify("flashcards", tomb);
  }
  const existing = await getOne("topics", id);
  const tomb = { ...(existing || { id }), deleted: true, updatedAt: now };
  await putOne("topics", tomb);
  notify("topics", tomb);
}

/* ---------------- flashcards (async) ---------------- */

export async function getFlashcards(topicId = null) {
  const all = (await getAll("flashcards")).filter((c) => !c.deleted);
  return topicId ? all.filter((c) => c.topicId === topicId) : all;
}
export async function getFlashcardsRaw() {
  return getAll("flashcards");
}
export async function getFlashcard(id) {
  const card = await getOne("flashcards", id);
  return card && !card.deleted ? card : null;
}
export async function addFlashcard({ topicId, subjectId, front, answer, explanation, images }) {
  const card = {
    id: uid(),
    topicId,
    subjectId,
    front,
    answer,
    explanation: explanation || "",
    images: Array.isArray(images) ? images : [],
    createdAt: new Date().toISOString(),
    updatedAt: Date.now(),
    deleted: false,
  };
  await putOne("flashcards", card);
  notify("flashcards", card);
  return card;
}
export async function updateFlashcard(id, patch) {
  const existing = await getOne("flashcards", id);
  if (!existing) return null;
  const updated = { ...existing, ...patch, updatedAt: Date.now() };
  await putOne("flashcards", updated);
  notify("flashcards", updated);
  return updated;
}
export async function deleteFlashcard(id) {
  const existing = await getOne("flashcards", id);
  const tomb = { ...(existing || { id }), deleted: true, updatedAt: Date.now() };
  await putOne("flashcards", tomb);
  notify("flashcards", tomb);
}

/* ---------------- study logs (async) ---------------- */
// Logs are append-only (never edited or deleted), so they need no
// tombstones — a plain union by id is always safe.

export async function getLogs() {
  return getAll("logs");
}
export async function addLog(entry) {
  const log = { id: uid(), date: new Date().toISOString(), updatedAt: Date.now(), ...entry };
  await putOne("logs", log);
  notify("logs", log);
  return log;
}

/* ---------------- cloud-sync raw helpers ----------------
   Used only by cloud.js. These bypass notify() entirely (pull-path
   writes must never re-trigger a push) and apply a plain
   last-write-wins rule keyed on `updatedAt`. */

export async function putRawIfNewer(store, remoteItem) {
  const idb = await openDB();
  const tx = idb.transaction(store, "readwrite");
  const os = tx.objectStore(store);
  const existing = await reqToPromise(os.get(remoteItem.id));
  let applied = false;
  if (!existing || (remoteItem.updatedAt || 0) > (existing.updatedAt || 0)) {
    os.put(remoteItem);
    applied = true;
  }
  await txDone(tx);
  return applied;
}

// Enriches an already-written record with extra fields (used to attach a
// flashcard's images, fetched separately from Firestore) without touching
// updatedAt or firing the mutation hook.
export async function patchRawFields(store, id, patch) {
  const idb = await openDB();
  const tx = idb.transaction(store, "readwrite");
  const os = tx.objectStore(store);
  const existing = await reqToPromise(os.get(id));
  if (existing) os.put({ ...existing, ...patch });
  await txDone(tx);
}

/* ---------------- backup / restore ---------------- */

export async function exportAll() {
  const [subjects, topics, flashcards, logs] = await Promise.all([
    getSubjects(), getTopics(), getFlashcards(), getLogs(),
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
  const now = Date.now();
  const stamp = (arr) => (arr || []).map((item) => ({ ...item, updatedAt: now, deleted: false }));
  if (Array.isArray(data.subjects)) { await clearStore("subjects"); await putMany("subjects", stamp(data.subjects)); }
  if (Array.isArray(data.topics)) { await clearStore("topics"); await putMany("topics", stamp(data.topics)); }
  if (Array.isArray(data.flashcards)) { await clearStore("flashcards"); await putMany("flashcards", stamp(data.flashcards)); }
  if (Array.isArray(data.logs)) { await clearStore("logs"); await putMany("logs", (data.logs || []).map((l) => ({ ...l, updatedAt: now }))); }
  if (data.settings) lsWrite(LS_KEYS.settings, { ...DEFAULT_SETTINGS, ...data.settings, updatedAt: now });
  if (data.profile) lsWrite(LS_KEYS.profile, { ...data.profile, updatedAt: now });
}

export async function wipeAll() {
  await Promise.all(STORES.map((s) => clearStore(s)));
  localStorage.removeItem(LS_KEYS.settings);
  localStorage.removeItem(LS_KEYS.profile);
}
