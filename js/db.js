// db.js — the only module that touches localStorage directly.
// Everything else in the app goes through these functions.

const KEYS = {
  subjects: "ff.subjects",
  topics: "ff.topics",
  flashcards: "ff.flashcards",
  logs: "ff.logs",
  settings: "ff.settings",
  profile: "ff.profile",
};

const DEFAULT_SETTINGS = {
  theme: "light",          // light | dark
  accent: "teal",          // teal | blue | violet | coral | rose
  fontSize: "medium",      // small | medium | large
  dateFormat: "mm/dd/yyyy",// dd/mm/yyyy | mm/dd/yyyy | yyyy/mm/dd
};

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    console.error("db: failed to read", key, e);
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    console.error("db: failed to write", key, e);
    return false;
  }
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/* ---------------- profile & settings ---------------- */

export function getProfile() {
  return read(KEYS.profile, { name: "" });
}
export function setProfile(profile) {
  write(KEYS.profile, profile);
}

export function getSettings() {
  return { ...DEFAULT_SETTINGS, ...read(KEYS.settings, {}) };
}
export function setSettings(patch) {
  const next = { ...getSettings(), ...patch };
  write(KEYS.settings, next);
  return next;
}

/* ---------------- subjects ---------------- */

export function getSubjects() {
  return read(KEYS.subjects, []);
}
export function addSubject(name) {
  const subjects = getSubjects();
  const subj = { id: uid(), name };
  subjects.push(subj);
  write(KEYS.subjects, subjects);
  return subj;
}
export function deleteSubject(id) {
  write(KEYS.subjects, getSubjects().filter((s) => s.id !== id));
  // cascade
  const topicsToRemove = getTopics().filter((t) => t.subjectId === id).map((t) => t.id);
  write(KEYS.topics, getTopics().filter((t) => t.subjectId !== id));
  write(KEYS.flashcards, getFlashcards().filter((f) => !topicsToRemove.includes(f.topicId)));
}

/* ---------------- topics ---------------- */

export function getTopics(subjectId = null) {
  const topics = read(KEYS.topics, []);
  return subjectId ? topics.filter((t) => t.subjectId === subjectId) : topics;
}
export function addTopic(subjectId, name) {
  const topics = getTopics();
  const topic = { id: uid(), subjectId, name };
  topics.push(topic);
  write(KEYS.topics, topics);
  return topic;
}
export function deleteTopic(id) {
  write(KEYS.topics, getTopics().filter((t) => t.id !== id));
  write(KEYS.flashcards, getFlashcards().filter((f) => f.topicId !== id));
}

/* ---------------- flashcards ---------------- */

export function getFlashcards(topicId = null) {
  const cards = read(KEYS.flashcards, []);
  return topicId ? cards.filter((c) => c.topicId === topicId) : cards;
}
export function getFlashcard(id) {
  return getFlashcards().find((c) => c.id === id) || null;
}
export function addFlashcard({ topicId, subjectId, front, answer, explanation, image }) {
  const cards = getFlashcards();
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
  cards.push(card);
  write(KEYS.flashcards, cards);
  return card;
}
export function updateFlashcard(id, patch) {
  const cards = getFlashcards();
  const idx = cards.findIndex((c) => c.id === id);
  if (idx === -1) return null;
  cards[idx] = { ...cards[idx], ...patch };
  write(KEYS.flashcards, cards);
  return cards[idx];
}
export function deleteFlashcard(id) {
  write(KEYS.flashcards, getFlashcards().filter((c) => c.id !== id));
}

/* ---------------- study logs ---------------- */
// one entry per answered flashcard: { id, flashcardId, topicId, subjectId,
//   date (ISO), correct (bool), responseMs, difficulty }

export function getLogs() {
  return read(KEYS.logs, []);
}
export function addLog(entry) {
  const logs = getLogs();
  const log = { id: uid(), date: new Date().toISOString(), ...entry };
  logs.push(log);
  write(KEYS.logs, logs);
  return log;
}

/* ---------------- backup / restore ---------------- */

export function exportAll() {
  return {
    exportedAt: new Date().toISOString(),
    version: 1,
    subjects: getSubjects(),
    topics: getTopics(),
    flashcards: getFlashcards(),
    logs: getLogs(),
    settings: getSettings(),
    profile: getProfile(),
  };
}

export function importAll(data) {
  if (!data || typeof data !== "object") throw new Error("Invalid backup file");
  if (Array.isArray(data.subjects)) write(KEYS.subjects, data.subjects);
  if (Array.isArray(data.topics)) write(KEYS.topics, data.topics);
  if (Array.isArray(data.flashcards)) write(KEYS.flashcards, data.flashcards);
  if (Array.isArray(data.logs)) write(KEYS.logs, data.logs);
  if (data.settings) write(KEYS.settings, { ...DEFAULT_SETTINGS, ...data.settings });
  if (data.profile) write(KEYS.profile, data.profile);
}

export function wipeAll() {
  Object.values(KEYS).forEach((k) => localStorage.removeItem(k));
}
