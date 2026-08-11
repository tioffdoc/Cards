// ui.js — small shared UI primitives used by every view: toasts,
// confirm dialogs, and bottom sheets. No dependencies on views/db.

let toastHost = null;
function ensureToastHost() {
  if (!toastHost) {
    toastHost = document.createElement("div");
    toastHost.className = "toast-host";
    document.body.appendChild(toastHost);
  }
  return toastHost;
}

export function toast(message, ms = 2200) {
  const host = ensureToastHost();
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = message;
  host.appendChild(el);
  setTimeout(() => el.remove(), ms);
}

export function confirmDialog({ title, message, confirmLabel = "Delete", danger = true, onConfirm }) {
  const scrim = document.createElement("div");
  scrim.className = "sheet-scrim";
  scrim.innerHTML = `
    <div class="sheet" role="dialog" aria-modal="true">
      <div class="sheet-handle"></div>
      <div class="sheet-title">${title}</div>
      <p class="muted" style="margin-bottom:16px">${message}</p>
      <div class="stack">
        <button class="btn ${danger ? "btn-danger" : "btn-primary"} btn-block" data-act="confirm">${confirmLabel}</button>
        <button class="btn btn-secondary btn-block" data-act="cancel">Cancel</button>
      </div>
    </div>`;
  document.body.appendChild(scrim);
  scrim.addEventListener("click", (e) => {
    if (e.target === scrim || e.target.dataset.act === "cancel") scrim.remove();
    if (e.target.dataset.act === "confirm") {
      scrim.remove();
      onConfirm && onConfirm();
    }
  });
}

export function openSheet(innerHTML, { onMount } = {}) {
  const scrim = document.createElement("div");
  scrim.className = "sheet-scrim";
  scrim.innerHTML = `<div class="sheet" role="dialog" aria-modal="true"><div class="sheet-handle"></div>${innerHTML}</div>`;
  document.body.appendChild(scrim);
  scrim.addEventListener("click", (e) => {
    if (e.target === scrim) scrim.remove();
  });
  const close = () => scrim.remove();
  onMount && onMount(scrim.querySelector(".sheet"), close);
  return close;
}

// tap-to-reveal delete affordance for list rows (used by manage.js & search.js)
export function wireRowReveal(rowEl) {
  rowEl.querySelector(".list-row-main").addEventListener("click", (e) => {
    if (rowEl.dataset.armed === "1") {
      rowEl.dataset.armed = "0";
      rowEl.classList.remove("reveal");
    }
  });
}
