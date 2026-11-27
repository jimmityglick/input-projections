import type { Action, Engine, EngineValue } from "./types";

import { saveControls } from "./save_controls";

const endpoint = "/api/work-queue";

export async function loadWorkQueue(engine: Engine) {
  let keys: string[] = [];
  let revision: string | null = null;
  let message: string;
  function replace(value: EngineValue) {
    keys = Array.isArray(value) ? value.map(() => crypto.randomUUID()) : [];
    saver.changed();
  }

  function edited(action: Action, oldValue: EngineValue) {
    const value = engine.getState().value;
    if (oldValue === value) return;
    if (!Array.isArray(value)) keys = [];
    if (action.type === "ListRemove" && action.at.length === 0) keys.splice(action.index, 1);
    if (action.type === "ListAdd" && action.at.length === 0) keys.push(crypto.randomUUID());
    saver.changed();
  }


  try {
    const response = await fetch(endpoint, {cache: "no-store"});
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const rows = await response.json();
    const tag = response.headers.get("ETag");
    if (!tag || !Array.isArray(rows) || rows.some(row => typeof row?.key !== "string" || !row.value)) {
      throw new Error("Invalid queue response");
    }
    const state = engine.reset(rows.map(row => row.value));
    if (state.sigma.root !== "Valid") throw new Error("Saved queue failed projection validation");
    keys = rows.map(row => row.key);
    revision = tag;
    message = rows.length ? "Loaded saved queue" : "Empty saved queue — seed rows or add a work item";
  } catch (error) {
    message = `Queue unavailable: ${String(error)}. Local editing only.`;
  }

  const saver = saveControls("queue", endpoint, revision, () => {
    const value = engine.getState().value;
    if (!Array.isArray(value)) throw new Error("Expected a queue");
    return value.map((row, i) => ({key: keys[i], value: row}));
  }, () => engine.getState().sigma.root === "Valid", message);
  return {controls: saver.controls, replace, edited};
}
