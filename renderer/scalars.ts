import type { EngineValue, Sigma } from "../dist/esm/index.js";
import type { CompiledReferenceNode, CompiledScalarNode } from "../dist/esm/index.js";
import type { RenderContext } from "./types";
import { getOrCreate } from "./cache";
import { createErrorElements, issuesForProjectionPath } from "./errors";
import {
  nodeIdFromProjectionPath,
  parseProjectionPath,
  parseValuePath,
  reconcileChildren,
  setJudgmentClasses,
} from "./utils";

function bindCursorFocus(el: HTMLElement, ctx: RenderContext): void {
  el.onfocus = (e) => {
    const target = e.currentTarget as HTMLElement;
    const projPathStr = target.dataset.projectionPath;
    const valPathStr = target.dataset.valuePath;
    if (!projPathStr || !valPathStr) return;
    ctx.dispatch({
      type: "MoveCursor",
      toProjectionPath: parseProjectionPath(projPathStr),
      toValuePath: parseValuePath(valPathStr),
    });
  };
}

function bindClearButton(btn: HTMLButtonElement, ctx: RenderContext): void {
  btn.onclick = (e) => {
    const target = e.currentTarget as HTMLButtonElement;
    const valPathStr = target.dataset.valuePath;
    if (!valPathStr) return;
    ctx.dispatch({ type: "Unset", at: parseValuePath(valPathStr) });
  };
  bindCursorFocus(btn, ctx);
}

function renderErrorsInto(
  inputEl: HTMLElement,
  sigma: Sigma,
  projectionPathString: string,
  inputIdBase: string,
  judgment: string,
): HTMLElement[] {
  const issues = issuesForProjectionPath(sigma, projectionPathString);
  const errorEls = createErrorElements(issues, inputIdBase);

  const describedBy = errorEls.map((e) => e.id).filter(Boolean);
  if (inputEl instanceof HTMLInputElement || inputEl instanceof HTMLSelectElement) {
    if (describedBy.length > 0) inputEl.setAttribute("aria-describedby", describedBy.join(" "));
    else inputEl.removeAttribute("aria-describedby");
    if (judgment === "Invalid" || judgment === "Incomplete") inputEl.setAttribute("aria-invalid", "true");
    else inputEl.removeAttribute("aria-invalid");
  }
  return errorEls;
}

function renderTextLike(
  nodeMeta: { label?: string; hint?: string; description?: string } | undefined,
  textEl: HTMLInputElement | HTMLSelectElement,
  clearBtn: HTMLButtonElement | null,
  value: EngineValue,
  ctx: RenderContext,
  valuePathString: string,
  projectionPathString: string,
  judgment: string,
  sigma: Sigma,
  wrapper: HTMLElement,
): void {
  textEl.dataset.valuePath = valuePathString;
  textEl.dataset.projectionPath = projectionPathString;

  if (textEl instanceof HTMLInputElement) bindCursorFocus(textEl, ctx);
  if (textEl instanceof HTMLSelectElement) bindCursorFocus(textEl, ctx);

  if (clearBtn) {
    // Secondary action: keep clickable, but remove from sequential keyboard navigation (Tab order).
    clearBtn.tabIndex = -1;
    clearBtn.dataset.valuePath = valuePathString;
    clearBtn.dataset.projectionPath = projectionPathString;
    bindClearButton(clearBtn, ctx);
  }

  const inputIdBase = nodeIdFromProjectionPath(projectionPathString);
  textEl.id = `${inputIdBase}-input`;

  const header = wrapper.querySelector<HTMLElement>(':scope > [data-role="header"]')!;
  const labelEl = header.querySelector<HTMLLabelElement>(':scope > [data-role="label"]')!;
  const pathEl = header.querySelector<HTMLElement>(':scope > [data-role="path"]')!;
  labelEl.htmlFor = textEl.id;
  labelEl.textContent = nodeMeta?.label ?? "Value";
  pathEl.textContent = projectionPathString;

  const hintEl = wrapper.querySelector<HTMLElement>(':scope > [data-role="hint"]')!;
  const hint = nodeMeta?.hint ?? nodeMeta?.description ?? "";
  hintEl.textContent = hint;
  hintEl.style.display = hint ? "" : "none";
}

export function renderScalar(
  node: CompiledScalarNode,
  value: EngineValue,
  projectionPathString: string,
  valuePathString: string,
  judgment: string,
  sigma: Sigma,
  ctx: RenderContext,
  labelOverride?: string,
): HTMLElement {
  const wrapper = getOrCreate(ctx.cache, projectionPathString, () => {
    const root = document.createElement("div");
    const header = document.createElement("div");
    header.dataset.role = "header";
    header.className = "node-header";

    const labelEl = document.createElement("label");
    labelEl.dataset.role = "label";
    labelEl.className = "node-label";

    const pathEl = document.createElement("code");
    pathEl.dataset.role = "path";
    pathEl.className = "node-path";

    header.append(labelEl, pathEl);

    const controlRow = document.createElement("div");
    controlRow.dataset.role = "controls";
    controlRow.className = "control-row";

    const stack = document.createElement("div");
    stack.dataset.role = "stack";
    stack.style.display = "grid";
    stack.style.gap = "0.25rem";

    const hint = document.createElement("small");
    hint.dataset.role = "hint";
    hint.className = "secondary";

    controlRow.append(stack);
    root.append(header, controlRow, hint);
    return root;
  });

  setJudgmentClasses(wrapper, judgment);
  wrapper.dataset.projectionPath = projectionPathString;
  wrapper.dataset.valuePath = valuePathString;

  const controlRow = wrapper.querySelector<HTMLElement>(':scope > [data-role="controls"]')!;
  const stack = controlRow.querySelector<HTMLElement>(':scope > [data-role="stack"]')!;

  const meta = {
    label: labelOverride ?? node.meta?.label,
    description: node.meta?.description,
    hint: node.meta?.hint,
  };
  const idBase = nodeIdFromProjectionPath(projectionPathString);

  if (node.scalar.type === "string") {
    if (node.scalar.enum) {
      const select = (controlRow.querySelector("select") ??
        document.createElement("select")) as HTMLSelectElement;
      const clearBtn = (controlRow.querySelector("button.clear") ??
        document.createElement("button")) as HTMLButtonElement;
      clearBtn.type = "button";
      clearBtn.className = "clear";
      clearBtn.textContent = "×";
      clearBtn.setAttribute("aria-label", "Clear (Unset)");

      const UNSET = "__unset__";
      const desiredOptions: HTMLOptionElement[] = [];
      const optUnset = document.createElement("option");
      optUnset.value = UNSET;
      optUnset.textContent = "(unset)";
      desiredOptions.push(optUnset);
      for (const v of node.scalar.enum) {
        const opt = document.createElement("option");
        opt.value = v;
        opt.textContent = v;
        desiredOptions.push(opt);
      }
      reconcileChildren(select, desiredOptions);

      const current = value === undefined ? UNSET : typeof value === "string" ? value : UNSET;
      select.value = current;

      select.onchange = (e) => {
        const target = e.currentTarget as HTMLSelectElement;
        const vpStr = target.dataset.valuePath;
        if (!vpStr) return;
        const vp = parseValuePath(vpStr);
        if (target.value === UNSET) {
          ctx.dispatch({ type: "Unset", at: vp });
          return;
        }
        ctx.dispatch({ type: "SetScalar", at: vp, value: target.value });
      };

      renderTextLike(meta, select, clearBtn, value, ctx, valuePathString, projectionPathString, judgment, sigma, wrapper);
      const errorEls = renderErrorsInto(select, sigma, projectionPathString, idBase, judgment);
      reconcileChildren(stack, [select, ...errorEls]);
      reconcileChildren(controlRow, [stack, clearBtn]);
      return wrapper;
    }

    const input = (controlRow.querySelector("input") ??
      document.createElement("input")) as HTMLInputElement;
    input.type = "text";
    const clearBtn = (controlRow.querySelector("button.clear") ??
      document.createElement("button")) as HTMLButtonElement;
    clearBtn.type = "button";
    clearBtn.className = "clear";
    clearBtn.textContent = "×";
    clearBtn.setAttribute("aria-label", "Clear (Unset)");

    input.value = typeof value === "string" ? value : "";
    input.placeholder = value === undefined ? "(unset)" : "";

    input.oninput = (e) => {
      const target = e.currentTarget as HTMLInputElement;
      const vpStr = target.dataset.valuePath;
      if (!vpStr) return;
      const vp = parseValuePath(vpStr);
      ctx.dispatch({ type: "SetScalar", at: vp, value: target.value });
    };

    renderTextLike(meta, input, clearBtn, value, ctx, valuePathString, projectionPathString, judgment, sigma, wrapper);
    const errorEls = renderErrorsInto(input, sigma, projectionPathString, idBase, judgment);
    reconcileChildren(stack, [input, ...errorEls]);
    reconcileChildren(controlRow, [stack, clearBtn]);
    return wrapper;
  }

  if (node.scalar.type === "number") {
    if (node.scalar.enum) {
      const select = (controlRow.querySelector("select") ??
        document.createElement("select")) as HTMLSelectElement;
      const clearBtn = (controlRow.querySelector("button.clear") ??
        document.createElement("button")) as HTMLButtonElement;
      clearBtn.type = "button";
      clearBtn.className = "clear";
      clearBtn.textContent = "×";
      clearBtn.setAttribute("aria-label", "Clear (Unset)");

      const UNSET = "__unset__";
      const desiredOptions: HTMLOptionElement[] = [];
      const optUnset = document.createElement("option");
      optUnset.value = UNSET;
      optUnset.textContent = "(unset)";
      desiredOptions.push(optUnset);
      for (const v of node.scalar.enum) {
        const opt = document.createElement("option");
        opt.value = String(v);
        opt.textContent = String(v);
        desiredOptions.push(opt);
      }
      reconcileChildren(select, desiredOptions);

      const current = typeof value === "number" ? String(value) : UNSET;
      select.value = current;

      select.onchange = (e) => {
        const target = e.currentTarget as HTMLSelectElement;
        const vpStr = target.dataset.valuePath;
        if (!vpStr) return;
        const vp = parseValuePath(vpStr);
        if (target.value === UNSET) {
          ctx.dispatch({ type: "Unset", at: vp });
          return;
        }
        ctx.dispatch({ type: "SetScalar", at: vp, value: Number(target.value) });
      };

      renderTextLike(meta, select, clearBtn, value, ctx, valuePathString, projectionPathString, judgment, sigma, wrapper);
      const errorEls = renderErrorsInto(select, sigma, projectionPathString, idBase, judgment);
      reconcileChildren(stack, [select, ...errorEls]);
      reconcileChildren(controlRow, [stack, clearBtn]);
      return wrapper;
    }

    const input = (controlRow.querySelector("input") ??
      document.createElement("input")) as HTMLInputElement;
    input.type = "number";
    const clearBtn = (controlRow.querySelector("button.clear") ??
      document.createElement("button")) as HTMLButtonElement;
    clearBtn.type = "button";
    clearBtn.className = "clear";
    clearBtn.textContent = "×";
    clearBtn.setAttribute("aria-label", "Clear (Unset)");

    input.value = typeof value === "number" ? String(value) : "";
    input.placeholder = value === undefined ? "(unset)" : "";

    input.oninput = (e) => {
      const target = e.currentTarget as HTMLInputElement;
      const vpStr = target.dataset.valuePath;
      if (!vpStr) return;
      const vp = parseValuePath(vpStr);
      if (target.value === "") {
        ctx.dispatch({ type: "Unset", at: vp });
        return;
      }
      ctx.dispatch({ type: "SetScalar", at: vp, value: Number(target.value) });
    };

    renderTextLike(meta, input, clearBtn, value, ctx, valuePathString, projectionPathString, judgment, sigma, wrapper);
    const errorEls = renderErrorsInto(input, sigma, projectionPathString, idBase, judgment);
    reconcileChildren(stack, [input, ...errorEls]);
    reconcileChildren(controlRow, [stack, clearBtn]);
    return wrapper;
  }

  if (node.scalar.type === "boolean") {
    const input = (controlRow.querySelector("input") ??
      document.createElement("input")) as HTMLInputElement;
    input.type = "checkbox";
    input.checked = value === true;
    input.onchange = (e) => {
      const target = e.currentTarget as HTMLInputElement;
      const vpStr = target.dataset.valuePath;
      if (!vpStr) return;
      const vp = parseValuePath(vpStr);
      ctx.dispatch({ type: "SetScalar", at: vp, value: target.checked });
    };
    renderTextLike(meta, input, null, value, ctx, valuePathString, projectionPathString, judgment, sigma, wrapper);
    const errorEls = renderErrorsInto(input, sigma, projectionPathString, idBase, judgment);
    reconcileChildren(stack, [input, ...errorEls]);
    reconcileChildren(controlRow, [stack]);
    return wrapper;
  }

  // null
  const input = (controlRow.querySelector("input") ??
    document.createElement("input")) as HTMLInputElement;
  input.type = "text";
  input.disabled = true;
  input.value = value === null ? "null" : "(unset)";

  const buttons = (controlRow.querySelector("div[data-role=\"buttons\"]") ??
    document.createElement("div")) as HTMLDivElement;
  buttons.dataset.role = "buttons";
  buttons.style.display = "flex";
  buttons.style.gap = "0.5rem";

  const setBtn = (buttons.querySelector("button[data-role=\"set-null\"]") ??
    document.createElement("button")) as HTMLButtonElement;
  setBtn.type = "button";
  setBtn.dataset.role = "set-null";
  setBtn.textContent = "Set null";
  setBtn.onclick = (e) => {
    const target = e.currentTarget as HTMLButtonElement;
    const vpStr = target.dataset.valuePath;
    if (!vpStr) return;
    ctx.dispatch({ type: "SetScalar", at: parseValuePath(vpStr), value: null });
  };
  bindCursorFocus(setBtn, ctx);

  const clearBtn = (buttons.querySelector("button.clear") ??
    document.createElement("button")) as HTMLButtonElement;
  clearBtn.type = "button";
  clearBtn.className = "clear";
  clearBtn.textContent = "×";
  clearBtn.setAttribute("aria-label", "Clear (Unset)");

  buttons.dataset.valuePath = valuePathString;
  buttons.dataset.projectionPath = projectionPathString;
  setBtn.dataset.valuePath = valuePathString;
  setBtn.dataset.projectionPath = projectionPathString;

  reconcileChildren(buttons, [setBtn, clearBtn]);
  renderTextLike(meta, input, clearBtn, value, ctx, valuePathString, projectionPathString, judgment, sigma, wrapper);
  const errorEls = renderErrorsInto(input, sigma, projectionPathString, idBase, judgment);
  reconcileChildren(stack, [input, ...errorEls]);
  reconcileChildren(controlRow, [stack, buttons]);
  return wrapper;
}

export function renderReference(
  node: CompiledReferenceNode,
  value: EngineValue,
  projectionPathString: string,
  valuePathString: string,
  judgment: string,
  sigma: Sigma,
  ctx: RenderContext,
  labelOverride?: string,
): HTMLElement {
  const wrapper = getOrCreate(ctx.cache, projectionPathString, () => {
    const root = document.createElement("div");
    const header = document.createElement("div");
    header.dataset.role = "header";
    header.className = "node-header";

    const labelEl = document.createElement("label");
    labelEl.dataset.role = "label";
    labelEl.className = "node-label";

    const pathEl = document.createElement("code");
    pathEl.dataset.role = "path";
    pathEl.className = "node-path";

    header.append(labelEl, pathEl);

    const controlRow = document.createElement("div");
    controlRow.dataset.role = "controls";
    controlRow.className = "control-row";

    const stack = document.createElement("div");
    stack.dataset.role = "stack";
    stack.style.display = "grid";
    stack.style.gap = "0.25rem";

    const hint = document.createElement("small");
    hint.dataset.role = "hint";
    hint.className = "secondary";

    controlRow.append(stack);
    root.append(header, controlRow, hint);
    return root;
  });

  setJudgmentClasses(wrapper, judgment);
  wrapper.dataset.projectionPath = projectionPathString;
  wrapper.dataset.valuePath = valuePathString;

  const controlRow = wrapper.querySelector<HTMLElement>(':scope > [data-role="controls"]')!;
  const stack = controlRow.querySelector<HTMLElement>(':scope > [data-role="stack"]')!;

  const meta = {
    label: labelOverride ?? node.meta?.label ?? node.target,
    description: node.meta?.description,
    hint: node.meta?.hint,
  };
  const idBase = nodeIdFromProjectionPath(projectionPathString);

  const formatEnum = node.format?.enum;
  if (formatEnum) {
    const select = (controlRow.querySelector("select") ??
      document.createElement("select")) as HTMLSelectElement;
    const clearBtn = (controlRow.querySelector("button.clear") ??
      document.createElement("button")) as HTMLButtonElement;
    clearBtn.type = "button";
    clearBtn.className = "clear";
    clearBtn.textContent = "×";
    clearBtn.setAttribute("aria-label", "Clear (Unset)");

    const UNSET = "__unset__";
    const desiredOptions: HTMLOptionElement[] = [];
    const optUnset = document.createElement("option");
    optUnset.value = UNSET;
    optUnset.textContent = "(unset)";
    desiredOptions.push(optUnset);
    for (const v of formatEnum) {
      const opt = document.createElement("option");
      opt.value = v;
      opt.textContent = v;
      desiredOptions.push(opt);
    }
    reconcileChildren(select, desiredOptions);

    const current = value === undefined ? UNSET : typeof value === "string" ? value : UNSET;
    select.value = current;

    select.onchange = (e) => {
      const target = e.currentTarget as HTMLSelectElement;
      const vpStr = target.dataset.valuePath;
      if (!vpStr) return;
      const vp = parseValuePath(vpStr);
      if (target.value === UNSET) {
        ctx.dispatch({ type: "Unset", at: vp });
        return;
      }
      ctx.dispatch({ type: "SetScalar", at: vp, value: target.value });
    };

    renderTextLike(meta, select, clearBtn, value, ctx, valuePathString, projectionPathString, judgment, sigma, wrapper);
    const errorEls = renderErrorsInto(select, sigma, projectionPathString, idBase, judgment);
    reconcileChildren(stack, [select, ...errorEls]);
    reconcileChildren(controlRow, [stack, clearBtn]);
    return wrapper;
  }

  const input = (controlRow.querySelector("input") ??
    document.createElement("input")) as HTMLInputElement;
  input.type = "text";

  const clearBtn = (controlRow.querySelector("button.clear") ??
    document.createElement("button")) as HTMLButtonElement;
  clearBtn.type = "button";
  clearBtn.className = "clear";
  clearBtn.textContent = "×";
  clearBtn.setAttribute("aria-label", "Clear (Unset)");

  input.value = typeof value === "string" ? value : "";
  input.placeholder = value === undefined ? "(unset)" : "";

  input.oninput = (e) => {
    const target = e.currentTarget as HTMLInputElement;
    const vpStr = target.dataset.valuePath;
    if (!vpStr) return;
    const vp = parseValuePath(vpStr);
    ctx.dispatch({ type: "SetScalar", at: vp, value: target.value });
  };

  renderTextLike(meta, input, clearBtn, value, ctx, valuePathString, projectionPathString, judgment, sigma, wrapper);
  const errorEls = renderErrorsInto(input, sigma, projectionPathString, idBase, judgment);
  reconcileChildren(stack, [input, ...errorEls]);
  reconcileChildren(controlRow, [stack, clearBtn]);
  return wrapper;
}
