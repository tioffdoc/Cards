import * as db from "./db.js";
import { icons } from "./icons.js";
import { registerRouter, registerDrawer } from "./nav.js";
import { applySettingsToDocument } from "./views/settings.js";
import { renderHome } from "./views/home.js";
import { renderStudy } from "./views/study.js";
import { renderManage } from "./views/manage.js";
import { renderSearch } from "./views/search.js";
import { renderProfile } from "./views/profile.js";

const view = document.getElementById("view");
const menuBtn = document.getElementById("menuBtn");
const profileBtn = document.getElementById("profileBtn");
const titleBtn = document.getElementById("titleBtn");
const drawer = document.getElementById("drawer");
const drawerScrim = document.getElementById("drawerScrim");
const navSearch = document.getElementById("navSearch");
const navAdd = document.getElementById("navAdd");

// icons that live in shell chrome (not owned by a view)
menuBtn.innerHTML = icons.menu;
profileBtn.innerHTML = icons.person;
navSearch.innerHTML = `${icons.search} Search`;
navAdd.innerHTML = `${icons.bookPlus} Add Flashcard`;

/* ---------------- theme bootstrap ---------------- */
applySettingsToDocument(db.getSettings());

/* ---------------- request persistent storage ----------------
   Reduces the odds the browser silently clears local data under
   storage pressure. Not fully honored by all iOS versions, but this
   is the standard, correct signal to send. */
if (navigator.storage && navigator.storage.persist) {
  navigator.storage.persisted().then((already) => {
    if (already) return;
    navigator.storage.persist().then((granted) => {
      console.log("[storage] persistence " + (granted ? "granted" : "not granted"));
    });
  });
}

/* ---------------- router ---------------- */

const routes = {
  home: renderHome,
  study: renderStudy,
  manage: renderManage,
  search: renderSearch,
  profile: renderProfile,
};

async function goTo(route, params = {}) {
  const renderer = routes[route] || routes.home;
  window.scrollTo(0, 0);
  closeDrawer();
  view.dataset.route = route;
  try {
    await renderer(view, params);
  } catch (err) {
    console.error("Failed to render", route, err);
    view.innerHTML = `<div class="center-empty"><p>Something went wrong loading this screen. Try again.</p></div>`;
  }
}
registerRouter(goTo);

/* ---------------- drawer ---------------- */

function openDrawer() { drawer.classList.add("open"); drawerScrim.classList.add("open"); }
function closeDrawer() { drawer.classList.remove("open"); drawerScrim.classList.remove("open"); }
function setDrawer(open) { open ? openDrawer() : closeDrawer(); }
registerDrawer(setDrawer);

menuBtn.addEventListener("click", () => openDrawer());
drawerScrim.addEventListener("click", () => closeDrawer());
navSearch.addEventListener("click", () => goTo("search"));
navAdd.addEventListener("click", () => goTo("manage"));
titleBtn.addEventListener("click", () => goTo("home"));
profileBtn.addEventListener("click", () => goTo("profile"));

/* ---------------- initial route ---------------- */
goTo("home");

/* ---------------- service worker (offline support + auto-update) ---------------- */
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch((err) => console.error("SW registration failed", err));

    // When a newly-deployed service worker takes over, the page it's already
    // running is still the old code in memory — reload once, silently, so
    // future fixes show up automatically instead of needing a force-quit.
    let reloaded = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (reloaded) return;
      reloaded = true;
      window.location.reload();
    });
  });
}
