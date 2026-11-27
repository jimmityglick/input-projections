import { stableStringify, type EngineValue } from "../dist/esm/shared/json.js";

export function saveControls(
  name: string,
  endpoint: string,
  initialTag: string | null,
  payload: () => EngineValue,
  isValid: () => boolean,
  initialStatus: string,
) {
  const controls = document.createElement("section");
  controls.className = "save-controls";
  const save = document.createElement("button");
  save.type = "button";
  save.textContent = `Save ${name}`;
  const label = document.createElement("label");
  const auto = document.createElement("input");
  auto.type = "checkbox";
  auto.setAttribute("role", "switch");
  const preference = `autosave:${endpoint}`;
  auto.checked = localStorage.getItem(preference) === "on";
  auto.setAttribute("aria-label", "Auto-save");
  label.append(auto, " Auto-save");
  const status = document.createElement("span");
  status.setAttribute("role", "status");
  status.textContent = initialStatus;
  controls.append(save, label, status);

  let tag = initialTag;
  // Compare JSON content, including entity keys, independent of object property order.
  let current = tag && isValid() ? stableStringify(payload()) : undefined;
  let saved = current;
  let cleanStatus = initialStatus;
  let pending = false;
  let timer: number | undefined;

  function available() {
    return !!tag && !pending && current !== undefined && current !== saved;
  }
  function schedule() {
    window.clearTimeout(timer);
    save.disabled = !available();
    if (auto.checked && available()) timer = window.setTimeout(submit, 800);
  }
  function changed() {
    if (!tag) return;
    current = isValid() ? stableStringify(payload()) : undefined;
    showDraftStatus();
    schedule();
  }
  function showDraftStatus() {
    if (pending) status.textContent = "Saving…";
    else if (current === undefined) status.textContent = "Draft incomplete or invalid — saving paused";
    else status.textContent = current === saved ? cleanStatus : "Unsaved changes";
  }
  async function submit() {
    window.clearTimeout(timer);
    if (!tag || !available()) return;
    const submitted = current;
    pending = true;
    save.disabled = true;
    status.textContent = "Saving…";
    try {
      const response = await fetch(endpoint, {
        method: "PUT",
        headers: {"Content-Type": "application/json", "If-Match": tag},
        body: JSON.stringify(payload()),
      });
      if (response.status === 412) {
        tag = null;
        throw new Error("The saved version changed. Refresh to load it. Your draft is still here.");
      }
      if (!response.ok) throw new Error((await response.text()).trim());
      tag = response.headers.get("ETag");
      if (!tag) throw new Error("Save response is missing its revision. Refresh to verify.");
      saved = submitted;
      cleanStatus = "Saved to SQLite";
    } catch (error) {
      status.textContent = String(error);
    } finally {
      pending = false;
      if (tag && (saved === submitted || current !== submitted)) showDraftStatus();
      save.disabled = !available();
      if (current !== submitted) schedule();
    }
  }
  save.onclick = submit;
  auto.onchange = () => {
    localStorage.setItem(preference, auto.checked ? "on" : "off");
    schedule();
  };
  schedule();
  return {controls, changed};
}
