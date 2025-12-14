import type { VNode } from "snabbdom";
import type { CompiledScalarNode, EngineValue, Sigma } from "../../../dist/esm/index.js";
import type { VDOMContext } from "../context";
import type { Judgment } from "../view";
import { h } from "../patch";
import { nodeIdFromProjectionPath } from "../../utils";
import {
  issuesForProjectionPath,
  hasRelatedIssueForProjectionPath,
  viewErrors,
  computeAriaErrorAttrs,
} from "../helpers/errors";
import {
  createFocusHandler,
  createSetScalarHandler,
  createUnsetHandler,
  createCheckboxHandler,
} from "../helpers/handlers";

const UNSET = "__unset__";

function judgmentClasses(judgment: Judgment): Record<string, boolean> {
  return {
    node: true,
    "judgment-valid": judgment === "Valid",
    "judgment-invalid": judgment === "Invalid",
    "judgment-incomplete": judgment === "Incomplete",
  };
}

function createInsertHook(ctx: VDOMContext, projectionPathString: string) {
  return (vnode: VNode) => {
    const el = vnode.elm as HTMLElement | undefined;
    if (el) {
      ctx.elByProjectionPath.set(projectionPathString, el);
    }
  };
}

type ScalarViewParams = {
  node: CompiledScalarNode;
  value: EngineValue;
  projStr: string;
  valStr: string;
  judgment: Judgment;
  sigma: Sigma;
  ctx: VDOMContext;
  label?: string;
};

function viewHeader(
  label: string,
  projStr: string,
  inputId: string,
  sigma: Sigma,
): VNode {
  const hasRelated = hasRelatedIssueForProjectionPath(sigma, projStr);
  return h("div.node-header", [
    h(
      "label.node-label",
      {
        props: { htmlFor: inputId },
        class: { "has-related-issue": hasRelated },
        attrs: hasRelated ? { title: "Related constraint failed" } : {},
      },
      label
    ),
    h("code.node-path", projStr),
  ]);
}

function viewHint(hint: string | undefined): VNode {
  return h(
    "small.secondary",
    { style: { display: hint ? "" : "none" } },
    hint ?? ""
  );
}

function viewStringEnum(params: ScalarViewParams): VNode {
  const { node, value, projStr, valStr, judgment, sigma, ctx, label } = params;
  const enumValues = node.scalar.enum as string[];
  const idBase = nodeIdFromProjectionPath(projStr);
  const inputId = `${idBase}-input`;

  const issues = issuesForProjectionPath(sigma, projStr);
  const errorIds = issues.map((_, idx) => `${idBase}-err-${idx}`);
  const ariaAttrs = computeAriaErrorAttrs(errorIds, judgment);

  const current = value === undefined ? UNSET : typeof value === "string" ? value : UNSET;

  const options: VNode[] = [
    h("option", { props: { value: UNSET } }, "(unset)"),
    ...enumValues.map((v) => h("option", { props: { value: v } }, v)),
  ];

  const select = h("select", {
    props: { id: inputId, value: current },
    dataset: { projectionPath: projStr, valuePath: valStr },
    attrs: ariaAttrs,
    on: {
      change: createSetScalarHandler(ctx, valStr, (v) => (v === UNSET ? undefined : v)),
      focus: createFocusHandler(ctx, projStr, valStr),
    },
  }, options);

  const clearBtn = h("button.clear", {
    props: { type: "button", tabIndex: -1 },
    attrs: { "aria-label": "Clear (Unset)" },
    on: { click: createUnsetHandler(ctx, valStr) },
  }, "×");

  const errorVNodes = viewErrors(issues, idBase);
  const stack = h("div", { style: { display: "grid", gap: "0.25rem" } }, [select, ...errorVNodes]);

  const nodeLabel = label ?? node.meta?.label ?? "Value";
  const hint = node.meta?.hint ?? node.meta?.description;

  return h("div", {
    class: judgmentClasses(judgment),
    dataset: { projectionPath: projStr, valuePath: valStr },
    hook: { insert: createInsertHook(ctx, projStr) },
  }, [
    viewHeader(nodeLabel, projStr, inputId, sigma),
    h("div.control-row", [stack, clearBtn]),
    viewHint(hint),
  ]);
}

function viewStringText(params: ScalarViewParams): VNode {
  const { node, value, projStr, valStr, judgment, sigma, ctx, label } = params;
  const idBase = nodeIdFromProjectionPath(projStr);
  const inputId = `${idBase}-input`;

  const issues = issuesForProjectionPath(sigma, projStr);
  const errorIds = issues.map((_, idx) => `${idBase}-err-${idx}`);
  const ariaAttrs = computeAriaErrorAttrs(errorIds, judgment);

  const inputValue = typeof value === "string" ? value : "";
  const placeholder = value === undefined ? "(unset)" : "";

  const input = h("input", {
    props: { id: inputId, type: "text", value: inputValue, placeholder },
    dataset: { projectionPath: projStr, valuePath: valStr },
    attrs: ariaAttrs,
    on: {
      input: createSetScalarHandler(ctx, valStr, (v) => v),
      focus: createFocusHandler(ctx, projStr, valStr),
    },
  });

  const clearBtn = h("button.clear", {
    props: { type: "button", tabIndex: -1 },
    attrs: { "aria-label": "Clear (Unset)" },
    on: { click: createUnsetHandler(ctx, valStr) },
  }, "×");

  const errorVNodes = viewErrors(issues, idBase);
  const stack = h("div", { style: { display: "grid", gap: "0.25rem" } }, [input, ...errorVNodes]);

  const nodeLabel = label ?? node.meta?.label ?? "Value";
  const hint = node.meta?.hint ?? node.meta?.description;

  return h("div", {
    class: judgmentClasses(judgment),
    dataset: { projectionPath: projStr, valuePath: valStr },
    hook: { insert: createInsertHook(ctx, projStr) },
  }, [
    viewHeader(nodeLabel, projStr, inputId, sigma),
    h("div.control-row", [stack, clearBtn]),
    viewHint(hint),
  ]);
}

function viewNumberEnum(params: ScalarViewParams): VNode {
  const { node, value, projStr, valStr, judgment, sigma, ctx, label } = params;
  const enumValues = node.scalar.enum as number[];
  const idBase = nodeIdFromProjectionPath(projStr);
  const inputId = `${idBase}-input`;

  const issues = issuesForProjectionPath(sigma, projStr);
  const errorIds = issues.map((_, idx) => `${idBase}-err-${idx}`);
  const ariaAttrs = computeAriaErrorAttrs(errorIds, judgment);

  const current = typeof value === "number" ? String(value) : UNSET;

  const options: VNode[] = [
    h("option", { props: { value: UNSET } }, "(unset)"),
    ...enumValues.map((v) => h("option", { props: { value: String(v) } }, String(v))),
  ];

  const select = h("select", {
    props: { id: inputId, value: current },
    dataset: { projectionPath: projStr, valuePath: valStr },
    attrs: ariaAttrs,
    on: {
      change: createSetScalarHandler(ctx, valStr, (v) => (v === UNSET ? undefined : Number(v))),
      focus: createFocusHandler(ctx, projStr, valStr),
    },
  }, options);

  const clearBtn = h("button.clear", {
    props: { type: "button", tabIndex: -1 },
    attrs: { "aria-label": "Clear (Unset)" },
    on: { click: createUnsetHandler(ctx, valStr) },
  }, "×");

  const errorVNodes = viewErrors(issues, idBase);
  const stack = h("div", { style: { display: "grid", gap: "0.25rem" } }, [select, ...errorVNodes]);

  const nodeLabel = label ?? node.meta?.label ?? "Value";
  const hint = node.meta?.hint ?? node.meta?.description;

  return h("div", {
    class: judgmentClasses(judgment),
    dataset: { projectionPath: projStr, valuePath: valStr },
    hook: { insert: createInsertHook(ctx, projStr) },
  }, [
    viewHeader(nodeLabel, projStr, inputId, sigma),
    h("div.control-row", [stack, clearBtn]),
    viewHint(hint),
  ]);
}

function viewNumberInput(params: ScalarViewParams): VNode {
  const { node, value, projStr, valStr, judgment, sigma, ctx, label } = params;
  const idBase = nodeIdFromProjectionPath(projStr);
  const inputId = `${idBase}-input`;

  const issues = issuesForProjectionPath(sigma, projStr);
  const errorIds = issues.map((_, idx) => `${idBase}-err-${idx}`);
  const ariaAttrs = computeAriaErrorAttrs(errorIds, judgment);

  const inputValue = typeof value === "number" ? String(value) : "";
  const placeholder = value === undefined ? "(unset)" : "";

  const input = h("input", {
    props: { id: inputId, type: "number", value: inputValue, placeholder },
    dataset: { projectionPath: projStr, valuePath: valStr },
    attrs: ariaAttrs,
    on: {
      input: createSetScalarHandler(ctx, valStr, (v) => (v === "" ? undefined : Number(v))),
      focus: createFocusHandler(ctx, projStr, valStr),
    },
  });

  const clearBtn = h("button.clear", {
    props: { type: "button", tabIndex: -1 },
    attrs: { "aria-label": "Clear (Unset)" },
    on: { click: createUnsetHandler(ctx, valStr) },
  }, "×");

  const errorVNodes = viewErrors(issues, idBase);
  const stack = h("div", { style: { display: "grid", gap: "0.25rem" } }, [input, ...errorVNodes]);

  const nodeLabel = label ?? node.meta?.label ?? "Value";
  const hint = node.meta?.hint ?? node.meta?.description;

  return h("div", {
    class: judgmentClasses(judgment),
    dataset: { projectionPath: projStr, valuePath: valStr },
    hook: { insert: createInsertHook(ctx, projStr) },
  }, [
    viewHeader(nodeLabel, projStr, inputId, sigma),
    h("div.control-row", [stack, clearBtn]),
    viewHint(hint),
  ]);
}

function viewBoolean(params: ScalarViewParams): VNode {
  const { node, value, projStr, valStr, judgment, sigma, ctx, label } = params;
  const idBase = nodeIdFromProjectionPath(projStr);
  const inputId = `${idBase}-input`;

  const issues = issuesForProjectionPath(sigma, projStr);
  const errorIds = issues.map((_, idx) => `${idBase}-err-${idx}`);
  const ariaAttrs = computeAriaErrorAttrs(errorIds, judgment);

  const input = h("input", {
    props: { id: inputId, type: "checkbox", checked: value === true },
    dataset: { projectionPath: projStr, valuePath: valStr },
    attrs: ariaAttrs,
    on: {
      change: createCheckboxHandler(ctx, valStr),
      focus: createFocusHandler(ctx, projStr, valStr),
    },
  });

  const errorVNodes = viewErrors(issues, idBase);
  const stack = h("div", { style: { display: "grid", gap: "0.25rem" } }, [input, ...errorVNodes]);

  const nodeLabel = label ?? node.meta?.label ?? "Value";
  const hint = node.meta?.hint ?? node.meta?.description;

  return h("div", {
    class: judgmentClasses(judgment),
    dataset: { projectionPath: projStr, valuePath: valStr },
    hook: { insert: createInsertHook(ctx, projStr) },
  }, [
    viewHeader(nodeLabel, projStr, inputId, sigma),
    h("div.control-row", [stack]),
    viewHint(hint),
  ]);
}

function viewNull(params: ScalarViewParams): VNode {
  const { node, value, projStr, valStr, judgment, sigma, ctx, label } = params;
  const idBase = nodeIdFromProjectionPath(projStr);
  const inputId = `${idBase}-input`;

  const issues = issuesForProjectionPath(sigma, projStr);
  const errorIds = issues.map((_, idx) => `${idBase}-err-${idx}`);
  const ariaAttrs = computeAriaErrorAttrs(errorIds, judgment);

  const displayValue = value === null ? "null" : "(unset)";

  const input = h("input", {
    props: { id: inputId, type: "text", value: displayValue, disabled: true },
    attrs: ariaAttrs,
  });

  const setNullBtn = h("button", {
    props: { type: "button" },
    dataset: { projectionPath: projStr, valuePath: valStr },
    on: {
      click: createSetScalarHandler(ctx, valStr, () => null),
      focus: createFocusHandler(ctx, projStr, valStr),
    },
  }, "Set null");

  const clearBtn = h("button.clear", {
    props: { type: "button", tabIndex: -1 },
    attrs: { "aria-label": "Clear (Unset)" },
    on: { click: createUnsetHandler(ctx, valStr) },
  }, "×");

  const buttons = h("div", { style: { display: "flex", gap: "0.5rem" } }, [setNullBtn, clearBtn]);

  const errorVNodes = viewErrors(issues, idBase);
  const stack = h("div", { style: { display: "grid", gap: "0.25rem" } }, [input, ...errorVNodes]);

  const nodeLabel = label ?? node.meta?.label ?? "Value";
  const hint = node.meta?.hint ?? node.meta?.description;

  return h("div", {
    class: judgmentClasses(judgment),
    dataset: { projectionPath: projStr, valuePath: valStr },
    hook: { insert: createInsertHook(ctx, projStr) },
  }, [
    viewHeader(nodeLabel, projStr, inputId, sigma),
    h("div.control-row", [stack, buttons]),
    viewHint(hint),
  ]);
}

export function viewScalar(
  node: CompiledScalarNode,
  value: EngineValue,
  projStr: string,
  valStr: string,
  judgment: Judgment,
  sigma: Sigma,
  ctx: VDOMContext,
  label?: string,
): VNode {
  const params: ScalarViewParams = { node, value, projStr, valStr, judgment, sigma, ctx, label };

  if (node.scalar.type === "string") {
    if (node.scalar.enum) return viewStringEnum(params);
    return viewStringText(params);
  }

  if (node.scalar.type === "number") {
    if (node.scalar.enum) return viewNumberEnum(params);
    return viewNumberInput(params);
  }

  if (node.scalar.type === "boolean") {
    return viewBoolean(params);
  }

  // null
  return viewNull(params);
}
