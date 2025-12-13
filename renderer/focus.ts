import type { Cursor } from "../dist/esm/index.js";
import type { RenderContext } from "./types";
import { projectionPathToString, findFirstActionable } from "./utils";

export function syncFocus(cursor: Cursor, container: HTMLElement, ctx: RenderContext): void {
  const key = projectionPathToString(cursor.projectionPath);
  const wrapper = ctx.cache.get(key);
  if (!wrapper) return;
  if (!wrapper.isConnected) return;
  if (!container.contains(wrapper)) return;

  const target = findFirstActionable(wrapper);
  if (!target) return;
  if (document.activeElement === target) return;
  target.focus();
}

