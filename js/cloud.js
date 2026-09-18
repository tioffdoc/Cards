// cloud.js — optional Firebase-backed accounts + cross-device sync.
//
// This whole module is opt-in: until firebase-config.js has real values,
// isConfigured() returns false and nothing here ever touches the network
// or changes local behavior. The rest of the app works exactly as before
// with zero Firebase involvement.
//
// Design, in short:
//  - IndexedDB (via db.js) stays the source of truth the UI reads from —
//    instant, works offline, unchanged from before this feature existed.
//  - When signed in, every local write also gets pushed to Firestore
//    under users/{uid}/..., and remote changes (from other devices) get
//    pulled in via real-time listeners and written locally through
//    db.js's last-write-wins raw helpers.
//  - Deletes are soft (tombstones, see db.js) so a delete made on one
//    device while another is offline is never "lost" or "undone" once
//    that device reconnects.
//  - Flashcard images are synced as their own Firestore subcollection
//    (one document per image) rather than inline on the flashcard's main
//    document, because Firestore caps a single document at 1 MiB and a
//    card can carry several photos.

import * as db from "./db.js";
import { firebaseConfig } from "./firebase-config.js";

const SDK_VERSION = "10.13.2";
const MAX_IMAGE_BASE64_LENGTH = 900_000; // stays safely under Firestore's 1 MiB/doc cap

/* ================= configuration ================= */

let forcedConfigured = null; // test-only override, see __setForcedConfigured below
export function isConfigured() {
  if (forcedConfigured !== null) return forcedConfigured;
  return !!(firebaseConfig && firebaseConfig.apiKey && firebaseConfig.projectId);
}

/* ================= pure helpers (no SDK, no network — unit testable) ================= */

// A flashcard's `images` array is synced separately (see syncFlashcardImages),
// so the main Firestore document only carries everything else, plus a count
// the pull side uses to know whether it needs to fetch images at all.
export function flashcardToFirestoreFields(card) {
  const { images, ...rest } = card;
  return { ...rest, imageCount: Array.isArray(images) ? images.length : 0 };
}

// Splits a flashcard's images into ones safe to store as their own Firestore
// document and ones too large to sync (kept locally regardless — only the
// cloud copy, and therefore other devices, would miss that one picture).
export function partitionImagesForSync(images) {
  const ok = [];
  let skipped = 0;
  (images || []).forEach((img) => {
    if (typeof img === "string" && img.length > 0 && img.length <= MAX_IMAGE_BASE64_LENGTH) ok.push(img);
    else skipped += 1;
  });
  return { ok, skipped };
}

// Firestore image subcollection docs are keyed "0", "1", "2"... — this
// reassembles them back into an ordered array, coping with gaps.
export function assembleImagesFromDocs(docsArray) {
  const byIndex = new Map();
  docsArray.forEach(({ id, data }) => {
    const n = Number(id);
    if (Number.isInteger(n) && n >= 0 && data && typeof data.data === "string") byIndex.set(n, data.data);
  });
  const max = byIndex.size ? Math.max(...byIndex.keys()) : -1;
  const out = [];
  for (let i = 0; i <= max; i++) if (byIndex.has(i)) out.push(byIndex.get(i));
  return out;
}

export function friendlyAuthError(code) {
  switch (code) {
    case "auth/email-already-in-use":
      return "That email already has an account on this — try logging in instead.";
    case "auth/invalid-email":
      return "That doesn't look like a valid email address.";
    case "auth/weak-password":
      return "Choose a password with at least 6 characters.";
    case "auth/missing-password":
      return "Enter a password.";
    case "auth/wrong-password":
    case "auth/invalid-credential":
    case "auth/invalid-login-credentials":
      return "Incorrect email or password.";
    case "auth/user-not-found":
      return "No account found with that email.";
    case "auth/too-many-requests":
      return "Too many attempts — wait a bit and try again.";
    case "auth/network-request-failed":
      return "No internet connection.";
    case "auth/operation-not-allowed":
      return "Email/password sign-in isn't turned on for this Firebase project yet — enable it in the Firebase console under Authentication.";
    case "auth/user-disabled":
      return "This account has been disabled.";
    default:
      return code ? `Something went wrong (${code}).` : "Something went wrong. Try again.";
  }
}

export function friendlyNetworkError(err) {
  const code = err && err.code;
  const offline = typeof navigator !== "undefined" && navigator.onLine === false;
  if (offline) return "No internet connection — this will sync automatically once you're back online.";
  if (code === "permission-denied")
    return "Cloud sync was denied by the Firestore security rules — see the setup steps in README.md.";
  if (code === "unavailable") return "Could not reach the cloud sync service — will retry automatically.";
  return (err && err.message) || "Sync failed — will retry automatically.";
}

/* ================= lazy SDK loading ================= */
// Firebase's modular SDK ships as real ES modules, so it can be imported
// straight from a CDN URL with no bundler. Loaded lazily (only once the
// user actually opens Account or signs in) so a device with no internet
// connection is completely unaffected by any of this.

let sdkPromise = null;
function loadSdk() {
  if (sdkPromise) return sdkPromise;
  sdkPromise = Promise.all([
    import(/* webpackIgnore: true */ `https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-app.js`),
    import(/* webpackIgnore: true */ `https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-auth.js`),
    import(/* webpackIgnore: true */ `https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-firestore.js`),
  ]).then(([appMod, authMod, fsMod]) => ({ appMod, authMod, fsMod }));
  return sdkPromise;
}

let app = null, auth = null, firestore = null, authMod = null, fsMod = null;

async function ensureApp() {
  if (app) return;
  if (!isConfigured()) throw new Error("Cloud sync is not set up yet — add your Firebase project's details to js/firebase-config.js first.");
  const mods = await loadSdk();
  authMod = mods.authMod;
  fsMod = mods.fsMod;
  app = mods.appMod.initializeApp(firebaseConfig);
  auth = authMod.getAuth(app);
  firestore = fsMod.getFirestore(app);
}

/* ================= auth state + sync status (pub/sub) ================= */

let currentUser = null;
const authListeners = new Set();
export function getCurrentUser() {
  return currentUser ? { uid: currentUser.uid, email: currentUser.email } : null;
}
export function onAuthChange(cb) {
  authListeners.add(cb);
  cb(getCurrentUser());
  return () => authListeners.delete(cb);
}
function notifyAuth() {
  const val = getCurrentUser();
  authListeners.forEach((cb) => {
    try { cb(val); } catch (e) { console.error("cloud: auth listener failed", e); }
  });
}

let syncStatus = { state: "idle", lastSyncAt: null, error: null }; // idle | syncing | synced | error
const statusListeners = new Set();
export function getSyncStatus() {
  return syncStatus;
}
export function onSyncStatusChange(cb) {
  statusListeners.add(cb);
  cb(syncStatus);
  return () => statusListeners.delete(cb);
}
function setSyncStatus(patch) {
  syncStatus = { ...syncStatus, ...patch };
  statusListeners.forEach((cb) => {
    try { cb(syncStatus); } catch (e) { console.error("cloud: status listener failed", e); }
  });
}

/* ================= auth actions ================= */

// e.code means Firebase itself rejected the request (bad password, no
// account, etc) -> a specific, friendly message. No e.code usually means
// ensureApp()/loadSdk() failed before Firebase was even reached (offline,
// CDN unreachable) -> fall back to the network-error mapping instead.
function friendlyAuthOrNetworkError(e) {
  return e && e.code ? friendlyAuthError(e.code) : friendlyNetworkError(e);
}

export async function signUp(email, password) {
  try {
    await ensureApp();
    const cred = await authMod.createUserWithEmailAndPassword(auth, email, password);
    return cred.user;
  } catch (e) {
    throw new Error(friendlyAuthOrNetworkError(e));
  }
}

export async function logIn(email, password) {
  try {
    await ensureApp();
    const cred = await authMod.signInWithEmailAndPassword(auth, email, password);
    return cred.user;
  } catch (e) {
    throw new Error(friendlyAuthOrNetworkError(e));
  }
}

export async function logOut() {
  if (!auth) return;
  await authMod.signOut(auth);
  // local data is left untouched — signing out never deletes anything on this device
}

export async function resetPassword(email) {
  try {
    await ensureApp();
    await authMod.sendPasswordResetEmail(auth, email);
  } catch (e) {
    throw new Error(friendlyAuthOrNetworkError(e));
  }
}

/* ================= push (local -> cloud) ================= */

async function pushOne(store, item) {
  if (!currentUser || !firestore) return;
  const uid = currentUser.uid;
  const { doc, setDoc } = fsMod;
  if (store === "flashcards") {
    await setDoc(doc(firestore, "users", uid, "flashcards", item.id), flashcardToFirestoreFields(item));
    await syncFlashcardImages(uid, item.id, item.images || []);
  } else if (store === "profile") {
    await setDoc(doc(firestore, "users", uid, "meta", "profile"), item);
  } else if (store === "settings") {
    await setDoc(doc(firestore, "users", uid, "meta", "settings"), item);
  } else {
    // subjects, topics, logs
    await setDoc(doc(firestore, "users", uid, store, item.id), item);
  }
}

async function syncFlashcardImages(uid, cardId, images) {
  const { collection, doc, getDocs, writeBatch } = fsMod;
  const { ok, skipped } = partitionImagesForSync(images);
  const colRef = collection(firestore, "users", uid, "flashcards", cardId, "images");
  const existing = await getDocs(colRef);
  const batch = writeBatch(firestore);
  existing.forEach((d) => batch.delete(d.ref));
  ok.forEach((data, i) => batch.set(doc(colRef, String(i)), { data }));
  await batch.commit();
  if (skipped > 0) {
    setSyncStatus({ ...syncStatus, warning: `${skipped} image${skipped === 1 ? "" : "s"} were too large to sync to the cloud — still saved on this device.` });
  }
}

// Local-only record (no updatedAt yet — created before this feature existed)
// gets stamped with a real timestamp the first time it meets the cloud.
async function pushLocalRecord(store, local) {
  const stamped = local.updatedAt ? local : { ...local, updatedAt: Date.now() };
  if (!local.updatedAt) {
    // profile/settings are localStorage-backed, not IndexedDB object stores,
    // so they need their own raw setters rather than db.putRawIfNewer.
    if (store === "profile") db.putRawProfile(stamped);
    else if (store === "settings") db.putRawSettings(stamped);
    else await db.putRawIfNewer(store, stamped);
  }
  await pushOne(store, stamped);
}

/* ================= pull (cloud -> local) ================= */

async function fetchFlashcardImages(uid, cardId) {
  const { collection, getDocs } = fsMod;
  const colRef = collection(firestore, "users", uid, "flashcards", cardId, "images");
  const snap = await getDocs(colRef);
  const docsArray = [];
  snap.forEach((d) => docsArray.push({ id: d.id, data: d.data() }));
  return assembleImagesFromDocs(docsArray);
}

async function applyRemoteFlashcard(uid, id, data) {
  const applied = await db.putRawIfNewer("flashcards", { id, ...data, images: [] });
  if (!applied) return;
  const images = (data.imageCount || 0) > 0 ? await fetchFlashcardImages(uid, id) : [];
  await db.patchRawFields("flashcards", id, { images });
}

/* ================= full reconcile (initial login + manual "Sync now") ================= */

const RAW_GETTERS = {
  subjects: () => db.getSubjectsRaw(),
  topics: () => db.getTopicsRaw(),
  flashcards: () => db.getFlashcardsRaw(),
  logs: () => db.getLogs(),
};

async function reconcileStore(uid, store) {
  const { collection, getDocs } = fsMod;
  const remoteSnap = await getDocs(collection(firestore, "users", uid, store));
  const remoteById = new Map();
  remoteSnap.forEach((d) => remoteById.set(d.id, d.data()));

  // pull: any remote record newer than (or absent) locally
  for (const [id, data] of remoteById) {
    if (store === "flashcards") await applyRemoteFlashcard(uid, id, data);
    else await db.putRawIfNewer(store, { id, ...data });
  }

  // push: any local record missing remotely, or locally newer
  const localRaw = await RAW_GETTERS[store]();
  for (const local of localRaw) {
    const remote = remoteById.get(local.id);
    if (!remote || (local.updatedAt || 0) > (remote.updatedAt || 0) || (!local.updatedAt && !remote)) {
      await pushLocalRecord(store, local);
    }
  }
}

async function reconcileMeta(uid) {
  const { doc, getDoc } = fsMod;
  const profileSnap = await getDoc(doc(firestore, "users", uid, "meta", "profile"));
  const localProfile = db.getProfile();
  if (profileSnap.exists()) {
    const applied = db.applyRemoteProfile(profileSnap.data());
    if (!applied) await pushLocalRecord("profile", localProfile);
  } else if (localProfile.name) {
    await pushLocalRecord("profile", localProfile);
  }

  const settingsSnap = await getDoc(doc(firestore, "users", uid, "meta", "settings"));
  const localSettings = db.getSettings();
  if (settingsSnap.exists()) {
    const applied = db.applyRemoteSettings(settingsSnap.data());
    if (applied && onSettingsChanged) onSettingsChanged(db.getSettings());
    if (!applied) await pushLocalRecord("settings", localSettings);
  } else {
    await pushLocalRecord("settings", localSettings);
  }
}

async function reconcileAll(uid) {
  for (const store of ["subjects", "topics", "flashcards", "logs"]) {
    await reconcileStore(uid, store);
  }
  await reconcileMeta(uid);
}

/* ================= live listeners (while signed in) ================= */

let unsubscribers = [];

function attachListeners(uid) {
  const { collection, doc, onSnapshot } = fsMod;

  ["subjects", "topics", "flashcards", "logs"].forEach((store) => {
    const colRef = collection(firestore, "users", uid, store);
    const unsub = onSnapshot(
      colRef,
      (snap) => {
        snap.docChanges().forEach((change) => {
          if (change.type === "removed") return; // we only ever tombstone, never hard-delete
          const data = change.doc.data();
          const id = change.doc.id;
          const handle = store === "flashcards" ? applyRemoteFlashcard(uid, id, data) : db.putRawIfNewer(store, { id, ...data });
          Promise.resolve(handle).catch((e) => console.error("cloud: failed applying remote change", store, id, e));
        });
        touchLastSync();
      },
      (err) => {
        console.error("cloud: listener error", store, err);
        setSyncStatus({ state: "error", error: friendlyNetworkError(err) });
      }
    );
    unsubscribers.push(unsub);
  });

  const profileRef = doc(firestore, "users", uid, "meta", "profile");
  unsubscribers.push(onSnapshot(profileRef, (snap) => {
    if (snap.exists()) db.applyRemoteProfile(snap.data());
    touchLastSync();
  }));

  const settingsRef = doc(firestore, "users", uid, "meta", "settings");
  unsubscribers.push(onSnapshot(settingsRef, (snap) => {
    if (snap.exists()) {
      const applied = db.applyRemoteSettings(snap.data());
      if (applied && onSettingsChanged) onSettingsChanged(db.getSettings());
    }
    touchLastSync();
  }));
}

function touchLastSync() {
  setSyncStatus({ state: "synced", lastSyncAt: Date.now(), error: null });
}

/* ================= pending-push retry queue (for offline edits) ================= */

const PENDING_KEY = "ff.cloud.pendingPush";
function readPending() {
  try { return JSON.parse(localStorage.getItem(PENDING_KEY) || "[]"); } catch { return []; }
}
function writePending(list) {
  try { localStorage.setItem(PENDING_KEY, JSON.stringify(list)); } catch { /* best-effort */ }
}
function queuePendingPush(store, id) {
  const list = readPending();
  if (!list.some((p) => p.store === store && p.id === id)) {
    list.push({ store, id });
    writePending(list);
  }
}
async function lookupLocalRecord(store, id) {
  if (store === "profile") return db.getProfile();
  if (store === "settings") return db.getSettings();
  const list = await (RAW_GETTERS[store] ? RAW_GETTERS[store]() : Promise.resolve([]));
  return list.find((x) => x.id === id) || null;
}
async function drainPendingPushes() {
  const list = readPending();
  if (!list.length || !currentUser) return;
  const remaining = [];
  for (const entry of list) {
    try {
      const record = await lookupLocalRecord(entry.store, entry.id);
      if (record) await pushOne(entry.store, record);
    } catch (e) {
      remaining.push(entry);
    }
  }
  writePending(remaining);
}

/* ================= mutation hook (local write -> cloud push) ================= */

async function pushHandler(store, item) {
  if (!currentUser) return;
  try {
    await pushOne(store, item);
    touchLastSync();
  } catch (e) {
    console.error("cloud: push failed, will retry", store, item.id, e);
    queuePendingPush(store, item.id);
    setSyncStatus({ state: "error", error: friendlyNetworkError(e) });
  }
}

/* ================= lifecycle ================= */

function stopSync() {
  unsubscribers.forEach((u) => { try { u(); } catch { /* ignore */ } });
  unsubscribers = [];
  db.setMutationHook(null);
  setSyncStatus({ state: "idle", lastSyncAt: null, error: null });
}

let onSettingsChanged = null;
let initStarted = false;

// Called once from main.js at startup. Safe to call even when cloud sync
// isn't configured — it just does nothing in that case.
export function init(callbacks = {}) {
  onSettingsChanged = callbacks.onSettingsChanged || null;
  if (!isConfigured() || initStarted) return;
  initStarted = true;

  ensureApp()
    .then(() => {
      authMod.onAuthStateChanged(auth, async (user) => {
        currentUser = user;
        notifyAuth();
        if (user) {
          setSyncStatus({ state: "syncing", error: null });
          db.setMutationHook(pushHandler);
          try {
            await reconcileAll(user.uid);
            await drainPendingPushes();
            attachListeners(user.uid);
            setSyncStatus({ state: "synced", lastSyncAt: Date.now(), error: null });
          } catch (e) {
            console.error("cloud: initial sync failed", e);
            setSyncStatus({ state: "error", error: friendlyNetworkError(e) });
          }
        } else {
          stopSync();
        }
      });
    })
    .catch((e) => {
      console.error("cloud: failed to initialize Firebase", e);
      setSyncStatus({ state: "error", error: "Could not reach the cloud sync service." });
    });

  if (typeof window !== "undefined") {
    window.addEventListener("online", () => {
      if (currentUser) drainPendingPushes().catch(() => {});
    });
  }
}

// Manual "Sync now" — also used right after restoring a local JSON backup,
// so the restored data gets pushed up instead of waiting for the next
// individual edit.
export async function syncNow() {
  if (!isConfigured()) throw new Error("Cloud sync is not set up yet.");
  await ensureApp();
  if (!currentUser) throw new Error("Log in first to sync.");
  setSyncStatus({ state: "syncing", error: null });
  try {
    await reconcileAll(currentUser.uid);
    await drainPendingPushes();
    setSyncStatus({ state: "synced", lastSyncAt: Date.now(), error: null });
  } catch (e) {
    setSyncStatus({ state: "error", error: friendlyNetworkError(e) });
    throw e;
  }
}

/* ================= test-only seam =================
   Never called by the real app — index.html never imports these names,
   and normal usage never touches them. This exists so the sync/merge
   orchestration (reconcileAll, pushOne, the image subcollection
   round-trip, attachListeners, the pending-push retry queue) can be
   exercised in an automated test against a fake Firestore, without a
   live network connection or a real Firebase project. Safe to ship. */
export function __setForcedConfigured(v) {
  forcedConfigured = v;
}
export function __injectTestSdk({ authMod: au, fsMod: f, app: a, auth: au2, firestore: fs }) {
  authMod = au;
  fsMod = f;
  app = a;
  auth = au2;
  firestore = fs;
}
export async function __simulateAuthStateChange(user) {
  currentUser = user;
  notifyAuth();
  if (user) {
    setSyncStatus({ state: "syncing", error: null });
    db.setMutationHook(pushHandler);
    await reconcileAll(user.uid);
    await drainPendingPushes();
    attachListeners(user.uid);
    setSyncStatus({ state: "synced", lastSyncAt: Date.now(), error: null });
  } else {
    stopSync();
  }
}
export function __resetTestState() {
  app = null; auth = null; firestore = null; authMod = null; fsMod = null;
  currentUser = null;
  forcedConfigured = null;
  unsubscribers.forEach((u) => { try { u(); } catch { /* ignore */ } });
  unsubscribers = [];
  initStarted = false;
  syncStatus = { state: "idle", lastSyncAt: null, error: null };
  db.setMutationHook(null);
}
