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

function syncControlledInputValue(vnode: VNode): void {
  const elm = vnode.elm;
  if (!(elm instanceof HTMLInputElement)) return;
  const desired = vnode.data?.props?.value;
  if (typeof desired !== "string") return;
  if (elm.value !== desired) {
    elm.value = desired;
  }
}

const controlledInputValueModule = {
  create: (_: VNode, vnode: VNode) => syncControlledInputValue(vnode),
  update: (_: VNode, vnode: VNode) => syncControlledInputValue(vnode),
};

const patch = init([
  classModule,
  propsModule,
  controlledInputValueModule,
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
