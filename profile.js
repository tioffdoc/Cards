import * as db from "../db.js";
import { toast } from "../ui.js";
import { renderSettingsSection } from "./settings.js";
import { icon } from "../icons.js";

export function renderProfile(root) {
  const profile = db.getProfile();

  root.innerHTML = `
    <div class="stack">
      <section class="card">
        <div class="card-header"><h2>Your Name</h2></div>
        <label class="field">
          <span>Name</span>
          <input type="text" id="nameInput" value="${escapeHTML(profile.name || "")}" placeholder="e.g. John" />
        </label>
        <button class="btn btn-primary" id="saveName" style="margin-top:12px">Save</button>
      </section>

      <section class="card">
        <div class="card-header"><h2>Settings</h2></div>
        <div id="settingsBody"></div>
      </section>
    </div>
  `;

  root.querySelector("#saveName").addEventListener("click", () => {
    const name = root.querySelector("#nameInput").value.trim();
    db.setProfile({ ...profile, name });
    toast("Name saved");
  });

  renderSettingsSection(root.querySelector("#settingsBody"));
}

function escapeHTML(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}
