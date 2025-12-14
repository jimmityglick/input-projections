import type { DispatchFn, Renderer } from "../types";
import { createPatchState, applyPatch } from "./patch";
import type { PatchState } from "./patch";
import { createVDOMContext } from "./context";
import type { VDOMContext } from "./context";
import { viewEngineState } from "./view";
import { syncFocus } from "./focus";
import { updateHUD } from "../hud";

export function createRendererSnabbdom(dispatch: DispatchFn): Renderer {
  const ctx: VDOMContext = createVDOMContext(dispatch);
  let patchState: PatchState | null = null;

  return {
    render(engine, container) {
      if (patchState === null) {
        patchState = createPatchState(container);
      }

      const state = engine.getState();
      const vnode = viewEngineState(state, ctx);
      applyPatch(patchState, vnode);

      syncFocus(state.cursor, container, ctx);
      updateHUD(state);
    },

    destroy() {
      ctx.elByProjectionPath.clear();
      patchState = null;
    },
  };
}
