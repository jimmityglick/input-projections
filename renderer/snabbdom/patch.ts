import {
  init,
  toVNode,
  h,
  classModule,
  propsModule,
  attributesModule,
  datasetModule,
  eventListenersModule,
} from "snabbdom";
import type { VNode } from "snabbdom";

export type { VNode };
export { h, toVNode };

const patch = init([
  classModule,
  propsModule,
  attributesModule,
  datasetModule,
  eventListenersModule,
]);

export type PatchState = {
  container: HTMLElement;
  vnode: VNode | null;
};

export function createPatchState(container: HTMLElement): PatchState {
  return { container, vnode: null };
}

export function applyPatch(state: PatchState, newVNode: VNode): void {
  if (state.vnode === null) {
    let mountPoint = state.container.querySelector<HTMLElement>('[data-role="vdom-root"]');
    if (!mountPoint) {
      mountPoint = document.createElement("div");
      // Keep `data-role` in the dataset so `toVNode(...)` represents it as `data.dataset.role`
      // and patching doesn't remove it via datasetModule.
      mountPoint.dataset.role = "vdom-root";
      // Ensure we don't accidentally accumulate multiple root mounts if the page already has
      // stale content from previous renderer instances (e.g., fixture switches).
      state.container.replaceChildren(mountPoint);
    }
    state.vnode = patch(toVNode(mountPoint), newVNode);
  } else {
    state.vnode = patch(state.vnode, newVNode);
  }
}
