import type { State } from "../dist/esm/index.js";
import { projectionPathToString, valuePathToString } from "../dist/esm/index.js";

let hudRoot: HTMLElement | null = null;
let pending: State | null = null;
let scheduled = false;

function ensureHUD(): HTMLElement | null {
  const container = document.getElementById("app-debug");
  if (!container) return null;
  if (hudRoot && hudRoot.isConnected) return hudRoot;

  hudRoot = document.createElement("div");
  hudRoot.className = "hud";
  container.replaceChildren(hudRoot);
  return hudRoot;
}

function stateSummary(state: State) {
  const seen = new Set();
  const uniqueIssues = state.sigma.issues.filter((i) => {
    if (seen.has(i)) return false;
    seen.add(i);
    return true;
  });
  return {
    cursor: {
      projectionPath: projectionPathToString(state.cursor.projectionPath),
      valuePath: valuePathToString(state.cursor.valuePath),
    },
    judgment: state.sigma.root,
    issues: uniqueIssues.map((i) => ({
      code: i.code,
      message: i.message,
      projectionPath: projectionPathToString(i.projectionPath),
      valuePath: valuePathToString(i.valuePath),
    })),
    value: state.value,
    lastAction: state.lastAction,
  };
}

function renderHUDNow(state: State): void {
  const root = ensureHUD();
  if (!root) return;

  const summary = stateSummary(state);
  const pretty = JSON.stringify(summary, null, 2);

  const toolbar = document.createElement("div");
  const copyBtn = document.createElement("button");
  copyBtn.type = "button";
  copyBtn.textContent = "Copy state JSON";
  copyBtn.onclick = async () => {
    try {
      await navigator.clipboard.writeText(pretty);
    } catch {
      // Best-effort fallback.
      window.prompt("Copy state JSON:", pretty);
    }
  };
  toolbar.appendChild(copyBtn);

  const detailsCursor = document.createElement("details");
  detailsCursor.open = true;
  const sumCursor = document.createElement("summary");
  sumCursor.textContent = "Cursor";
  const preCursor = document.createElement("pre");
  preCursor.textContent = JSON.stringify(summary.cursor, null, 2);
  detailsCursor.append(sumCursor, preCursor);

  const detailsIssues = document.createElement("details");
  detailsIssues.open = true;
  const sumIssues = document.createElement("summary");
  sumIssues.textContent = `Issues (${summary.issues.length})`;
  const preIssues = document.createElement("pre");
  preIssues.textContent = JSON.stringify(summary.issues, null, 2);
  detailsIssues.append(sumIssues, preIssues);

  const detailsValue = document.createElement("details");
  detailsValue.open = true;
  const sumValue = document.createElement("summary");
  sumValue.textContent = "Value";
  const preValue = document.createElement("pre");
  preValue.textContent = JSON.stringify(summary.value, null, 2);
  detailsValue.append(sumValue, preValue);

  const detailsAction = document.createElement("details");
  detailsAction.open = false;
  const sumAction = document.createElement("summary");
  sumAction.textContent = "Last Action";
  const preAction = document.createElement("pre");
  preAction.textContent = JSON.stringify(summary.lastAction ?? null, null, 2);
  detailsAction.append(sumAction, preAction);

  root.replaceChildren(toolbar, detailsCursor, detailsIssues, detailsValue, detailsAction);
}

export function updateHUD(state: State): void {
  pending = state;
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    if (!pending) return;
    renderHUDNow(pending);
  });
}
