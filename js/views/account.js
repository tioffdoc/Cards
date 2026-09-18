// account.js — the "Cloud sync" card shown inside Profile. Handles both
// states: cloud sync not configured yet (firebase-config.js still has
// firebaseConfig = null), and configured (sign up / log in / signed-in
// status + manual sync + sign out). Purely UI — all the actual sync logic
// lives in cloud.js, which this just calls into and reacts to.

import * as cloud from "../cloud.js";
import { icon } from "../icons.js";
import { toast } from "../ui.js";
import { formatDate } from "../utils.js";
import * as db from "../db.js";

export function renderAccountSection(container) {
  if (!cloud.isConfigured()) {
    container.innerHTML = `
      <div class="settings-row" style="display:block">
        <div class="row" style="gap:8px;margin-bottom:8px">${icon("cloud")}<div class="label">Cloud sync</div></div>
        <p class="muted" style="font-size:var(--fs-caption);margin:0">
          Not set up yet. Cloud sync lets you log into the same account on another
          device (phone, iPad, laptop) and keeps everything backed up automatically —
          so clearing your browser's data, or losing a device, can't wipe your
          flashcards. It's free and takes about 10 minutes to turn on — see the
          "Cloud sync setup" section in README.md. Until then, Export/Restore below
          still works fine for moving data between devices by hand.
        </p>
      </div>`;
    return;
  }

  let mode = "login"; // "login" | "signup"
  let lastEmail = "";
  let submitting = false;

  function onChange() {
    // The view may have been swapped out (router replaced #view's innerHTML)
    // since this section subscribed — stop reacting and unsubscribe rather
    // than rendering into a detached element forever.
    if (!container.isConnected) {
      unsubAuth && unsubAuth();
      unsubStatus && unsubStatus();
      return;
    }
    render();
  }
  const unsubAuth = cloud.onAuthChange(onChange);
  const unsubStatus = cloud.onSyncStatusChange(onChange);

  function render() {
    const user = cloud.getCurrentUser();
    if (user) renderSignedIn(user);
    else renderAuthForm();
  }

  function renderSignedIn(user) {
    const status = cloud.getSyncStatus();
    const settings = db.getSettings();
    container.innerHTML = `
      <div class="settings-row" style="display:block">
        <div class="row" style="gap:8px;margin-bottom:4px">${icon("cloud")}<div class="label">Cloud sync</div></div>
        <p class="muted" style="font-size:var(--fs-caption);margin:0 0 12px">${escapeHTML(user.email)}</p>
        <div style="margin-bottom:12px">${statusPill(status, settings)}</div>
        ${status.warning ? `<p class="muted" style="font-size:var(--fs-caption);color:var(--warn);margin:0 0 12px">${escapeHTML(status.warning)}</p>` : ""}
        ${status.state === "error" && status.error ? `<p class="muted" style="font-size:var(--fs-caption);color:var(--down);margin:0 0 12px">${escapeHTML(status.error)}</p>` : ""}
        <div class="row" style="gap:10px">
          <button class="btn btn-secondary" id="syncNowBtn" style="flex:1">${icon("refresh")} Sync now</button>
          <button class="btn btn-secondary" id="signOutBtn" style="flex:1">Sign out</button>
        </div>
      </div>
    `;
    container.querySelector("#syncNowBtn").addEventListener("click", async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      try {
        await cloud.syncNow();
        toast("Synced");
      } catch (err) {
        toast(err.message || "Sync failed");
      } finally {
        btn.disabled = false;
      }
    });
    container.querySelector("#signOutBtn").addEventListener("click", async () => {
      await cloud.logOut();
      toast("Signed out — your flashcards stay on this device");
    });
  }

  function renderAuthForm() {
    container.innerHTML = `
      <div class="settings-row" style="display:block">
        <div class="row" style="gap:8px;margin-bottom:4px">${icon("cloud")}<div class="label">Cloud sync</div></div>
        <p class="muted" style="font-size:var(--fs-caption);margin:0 0 14px">
          Sign in to back up your flashcards to the cloud and use the same data on another device.
        </p>
        <div class="segmented" style="margin-bottom:14px" id="modeSeg">
          <button data-mode="login" class="${mode === "login" ? "active" : ""}">Log in</button>
          <button data-mode="signup" class="${mode === "signup" ? "active" : ""}">Sign up</button>
        </div>
        <div class="stack" style="gap:10px">
          <label class="field">
            <span>Email</span>
            <input type="email" id="emailInput" placeholder="you@example.com" value="${escapeHTML(lastEmail)}" autocomplete="email" />
          </label>
          <label class="field">
            <span>Password</span>
            <input type="password" id="passwordInput" placeholder="${mode === "signup" ? "At least 6 characters" : "Your password"}" autocomplete="${mode === "signup" ? "new-password" : "current-password"}" />
          </label>
        </div>
        <button class="btn btn-primary" id="submitBtn" style="margin-top:14px">${icon("lock")} ${mode === "signup" ? "Create account" : "Log in"}</button>
        ${mode === "login" ? `<button class="btn btn-ghost btn-block" id="forgotBtn" style="margin-top:2px">Forgot password?</button>` : ""}
        <p id="authError" class="muted" style="font-size:var(--fs-caption);color:var(--down);margin:10px 0 0;display:none"></p>
      </div>
    `;

    container.querySelectorAll("#modeSeg [data-mode]").forEach((btn) => btn.addEventListener("click", () => {
      mode = btn.dataset.mode;
      renderAuthForm();
    }));

    const errEl = container.querySelector("#authError");
    function showError(msg) {
      errEl.textContent = msg;
      errEl.style.display = "block";
    }

    container.querySelector("#submitBtn").addEventListener("click", async (e) => {
      if (submitting) return;
      const email = container.querySelector("#emailInput").value.trim();
      const password = container.querySelector("#passwordInput").value;
      errEl.style.display = "none";
      if (!email || !password) { showError("Enter your email and password."); return; }

      const btn = e.currentTarget;
      submitting = true;
      btn.disabled = true;
      const originalLabel = btn.innerHTML;
      btn.textContent = mode === "signup" ? "Creating account…" : "Logging in…";
      try {
        if (mode === "signup") await cloud.signUp(email, password);
        else await cloud.logIn(email, password);
        lastEmail = email;
        toast(mode === "signup" ? "Account created — syncing your flashcards…" : "Logged in — syncing your flashcards…");
        // No manual re-render needed: cloud.js's onAuthStateChanged listener
        // fires onChange() above once Firebase confirms the signed-in user.
      } catch (err) {
        showError(err.message || "Something went wrong.");
        submitting = false;
        btn.disabled = false;
        btn.innerHTML = originalLabel;
      }
    });

    const forgotBtn = container.querySelector("#forgotBtn");
    if (forgotBtn) {
      forgotBtn.addEventListener("click", async () => {
        const email = container.querySelector("#emailInput").value.trim();
        errEl.style.display = "none";
        if (!email) { showError("Enter your email above first, then tap this again."); return; }
        try {
          await cloud.resetPassword(email);
          toast("Password reset email sent");
        } catch (err) {
          showError(err.message || "Something went wrong.");
        }
      });
    }
  }

  render();
}

function statusPill(status, settings) {
  const when = status.lastSyncAt ? formatDate(new Date(status.lastSyncAt), settings.dateFormat) : null;
  if (status.state === "syncing") return `<span class="pill neutral">${icon("refresh")} Syncing…</span>`;
  if (status.state === "error") return `<span class="pill down">${icon("cloud")} Sync error</span>`;
  if (status.state === "synced") return `<span class="pill up">${icon("check")} Synced${when ? ` · ${when}` : ""}</span>`;
  return `<span class="pill neutral">${icon("cloud")} Idle</span>`;
}

function escapeHTML(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}
