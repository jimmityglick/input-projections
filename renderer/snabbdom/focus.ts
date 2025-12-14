import type { Cursor } from "../../dist/esm/index.js";
import type { VDOMContext } from "./context";
import { projectionPathToString } from "../utils";

function findFirstActionable(root: HTMLElement): HTMLElement | null {
  const candidates = root.querySelectorAll("input, select, button");
  for (const el of candidates) {
    if (!(el instanceof HTMLElement)) continue;
    const disabled =
      (el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLButtonElement) &&
      el.disabled;
    if (el.tabIndex < 0) continue;
    if (!disabled) return el;
  }
  return null;
}

export function syncFocus(cursor: Cursor, container: HTMLElement, ctx: VDOMContext): void {
  const key = projectionPathToString(cursor.projectionPath);
  const wrapper = ctx.elByProjectionPath.get(key);
  if (!wrapper) return;
  if (!wrapper.isConnected) return;
  if (!container.contains(wrapper)) return;

  const target = findFirstActionable(wrapper);
  if (!target) return;
  if (document.activeElement === target) return;
  target.focus({ preventScroll: true });
}
