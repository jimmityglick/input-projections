import { stableStringify, type EngineValue } from "../dist/esm/shared/json.js";

export function saveControls(
  name: string,
  endpoint: string,
  initialTag: string | null,
  payload: () => EngineValue,
  isValid: () => boolean,
  initialStatus: string,
  onSubmit?: (snapshot: EngineValue) => (confirmed: boolean) => void,
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
  let settleSubmission: ((confirmed: boolean) => void) | undefined;
  let unconfirmed: string | undefined;
  let timer: number | undefined;

  function available() {
    return !!tag && !pending && current !== undefined && current !== saved;
  }
  function schedule() {
    window.clearTimeout(timer);
    save.disabled = pending || (unconfirmed === undefined && !available());
    if (auto.checked && unconfirmed === undefined && available()) timer = window.setTimeout(submit, 800);
  }
  function changed() {
    if (!tag) return;
    current = isValid() ? stableStringify(payload()) : undefined;
    if (unconfirmed === undefined) showDraftStatus();
    schedule();
  }
  function showDraftStatus() {
    if (pending) status.textContent = "Saving…";
    else if (current === undefined) status.textContent = "Draft incomplete or invalid — saving paused";
    else status.textContent = current === saved ? cleanStatus : "Unsaved changes";
  }
  function conflict() {
    tag = null;
    status.textContent = "The saved version changed. Your draft is still here. Refresh to load the saved version.";
  }
  async function write(body: string, baseTag: string) {
    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: "PUT", headers: {"Content-Type": "application/json", "If-Match": baseTag}, body,
      });
    } catch {
      return null; // No acknowledgement. Read the server value before another write.
    }
    if (response.status === 412) {
      conflict();
      return null;
    }
    if (!response.ok) throw new Error((await response.text()).trim());
    return response.headers.get("ETag");
  }
  async function verifySave() {
    const response = await fetch(endpoint, {cache: "no-store"});
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const observedTag = response.headers.get("ETag");
    if (!observedTag) throw new Error("Missing revision");
    const observed = stableStringify(await response.json());
    if (observed === unconfirmed) {
      saved = observed;
      tag = observedTag;
      cleanStatus = "Saved to SQLite";
      return;
    }
    if (observedTag === tag && observed === saved) {
      if (current === saved) status.textContent = cleanStatus;
      else if (current === undefined) status.textContent = "Draft incomplete or invalid — saving paused";
      else status.textContent = "Server still has the previous version. You can retry Save.";
    } else {
      conflict();
    }
  }
  async function submit() {
    window.clearTimeout(timer);
    if (!tag || pending || (unconfirmed === undefined && !available())) return;
    // Capture the submitted value separately from any edits made while awaiting HTTP.
    const submitted = unconfirmed ?? current;
    pending = true;
    save.disabled = true;
    try {
      if (unconfirmed === undefined) {
        status.textContent = "Saving…";
        const snapshot = payload();
        settleSubmission = onSubmit?.(snapshot);
        const nextTag = await write(JSON.stringify(snapshot), tag);
        if (!tag) return;
        if (nextTag) {
          saved = submitted;
          tag = nextTag;
          cleanStatus = "Saved to SQLite";
        } else {
          unconfirmed = submitted;
        }
      }
      if (unconfirmed !== undefined) {
        status.textContent = "Checking the saved version…";
        await verifySave();
        unconfirmed = undefined;
      }
    } catch (error) {
      status.textContent = unconfirmed === undefined ? String(error)
        : "Could not verify the save. Your draft is still here. Check again when connected.";
    } finally {
      if (unconfirmed === undefined) {
        settleSubmission?.(saved === submitted);
        settleSubmission = undefined;
      }
      pending = false;
      save.textContent = unconfirmed === undefined ? `Save ${name}` : "Check saved version";
      if (tag && unconfirmed === undefined && (saved === submitted || current !== submitted)) showDraftStatus();
      save.disabled = unconfirmed === undefined && !available();
      if (tag && unconfirmed === undefined && current !== submitted) schedule();
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
