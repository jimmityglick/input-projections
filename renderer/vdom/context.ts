import type { DispatchFn } from "../types";

export type VDOMContext = {
  dispatch: DispatchFn;
  elByProjectionPath: Map<string, HTMLElement>;
};

export function createVDOMContext(dispatch: DispatchFn): VDOMContext {
  return {
    dispatch,
    elByProjectionPath: new Map(),
  };
}
