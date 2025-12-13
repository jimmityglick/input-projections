import type { DispatchFn, Renderer } from "./types";
import { clearCache } from "./cache";
import { renderEngineState } from "./render";

export function createRenderer(dispatch: DispatchFn): Renderer {
  const cache = new Map<string, HTMLElement>();

  return {
    render(engine, container) {
      renderEngineState(engine, container, { cache, dispatch });
    },
    destroy() {
      clearCache(cache);
    },
  };
}

