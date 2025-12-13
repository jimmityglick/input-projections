import type { Engine } from "../dist/esm/index.js";
import type { RenderContext } from "./types";
import { reconcileChildren } from "./utils";
import { processNode } from "./traverse";
import { syncFocus } from "./focus";
import { updateHUD } from "./hud";

export function renderEngineState(engine: Engine, container: HTMLElement, ctx: RenderContext): void {
  const state = engine.getState();
  const rootLabel = state.projection.meta?.label ?? "Root";
  const rootEl = processNode(
    state.projection.root,
    state.value,
    [],
    [],
    state.sigma,
    ctx,
    rootLabel,
  );

  const desired: HTMLElement[] = [];
  if (rootEl) desired.push(rootEl);
  reconcileChildren(container, desired);

  syncFocus(state.cursor, container, ctx);
  updateHUD(state);
}

