import type { VNode } from "snabbdom";
import type {
  CompiledUnionNode,
  EngineValue,
  ProjectionPath,
  Sigma,
  ValuePath,
} from "../../../dist/esm/index.js";
import type { VDOMContext } from "../context";
import type { Judgment, ViewNodeParams } from "../view";
import { h } from "../patch";
import { nodeIdFromProjectionPath, parseValuePath, valuePathToString } from "../../utils";
import { issuesForProjectionPath, viewErrors } from "../helpers/errors";
import { createFocusHandler } from "../helpers/handlers";
import { resolveLayout } from "../layout";

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

function selectUnionVariant(node: CompiledUnionNode, value: EngineValue): string | undefined {
  if (value !== undefined && (typeof value !== "object" || value === null || Array.isArray(value))) {
    return undefined;
  }
  const obj =
    value !== undefined && typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as Record<string, EngineValue>)
      : {};
  const discValue = obj[node.discriminator];
  if (discValue === undefined) return node.default;
  if (typeof discValue !== "string") return undefined;
  if (!(discValue in node.variants)) return undefined;
  return discValue;
}

export function viewUnion(
  node: CompiledUnionNode,
  value: EngineValue,
  projectionPath: ProjectionPath,
  valuePath: ValuePath,
  projStr: string,
  valStr: string,
  judgment: Judgment,
  sigma: Sigma,
  ctx: VDOMContext,
  viewNode: (params: ViewNodeParams) => VNode | null,
  label?: string,
): VNode {
  const idBase = nodeIdFromProjectionPath(projStr);

  const discValuePath = [...valuePath, node.discriminator];
  const discValStr = valuePathToString(discValuePath);

  const selected = selectUnionVariant(node, value);

  const issues = issuesForProjectionPath(sigma, projStr);
  const errorVNodes = viewErrors(issues, `${idBase}_union`);

  const contentChildren: VNode[] = [];
  if (selected) {
    const obj =
      value !== undefined && typeof value === "object" && value !== null && !Array.isArray(value)
        ? (value as Record<string, EngineValue>)
        : {};
    const childVNode = viewNode({
      node: node.variants[selected],
      value: obj.data,
      projectionPath: [...projectionPath, { type: "Variant", key: selected }],
      valuePath: [...valuePath, "data"],
      sigma,
      ctx,
      label: node.variants[selected].meta?.label ?? selected,
    });
    if (childVNode) contentChildren.push(childVNode);
  }

  const nodeLabel = label ?? node.meta?.label ?? "Union";
  const layout = resolveLayout("Union", node.meta?.layout);

  const unset = () => {
    ctx.dispatch({ type: "Unset", at: parseValuePath(discValStr) });
  };

  const selectVariant = (variantKey: string) => {
    ctx.dispatch({ type: "SelectVariant", at: valuePath, variantKey });

    const variantNode = node.variants[variantKey];
    if (variantNode?.kind === "Scalar" && variantNode.scalar.type === "null") {
      ctx.dispatch({ type: "SetScalar", at: [...valuePath, "data"], value: null });
    }
  };

  const content = h("div", contentChildren);
  const errors = h("div.errors", errorVNodes);
  const headerLabel =
    layout === "dropdown"
      ? h("label.node-label", { props: { htmlFor: `${idBase}-discriminator` } }, nodeLabel)
      : h("span.node-label", nodeLabel);
  const header = h("div.node-header", [headerLabel, h("code.node-path", projStr)]);

  if (layout === "tabs") {
    const tabButtons: VNode[] = [
      h("button.tab", {
        props: { type: "button" },
        class: { active: selected === undefined },
        dataset: { projectionPath: projStr, valuePath: discValStr },
        on: { click: unset, focus: createFocusHandler(ctx, projStr, discValStr) },
      }, "(select)"),
      ...node.variantOrder.map((key) =>
        h("button.tab", {
          props: { type: "button" },
          class: { active: key === selected },
          dataset: { projectionPath: projStr, valuePath: discValStr },
          on: { click: () => selectVariant(key), focus: createFocusHandler(ctx, projStr, discValStr) },
        }, key)
      ),
    ];

    return h("div", {
      class: { ...judgmentClasses(judgment), "union-tabs": true },
      dataset: { projectionPath: projStr, valuePath: valStr },
      hook: { insert: createInsertHook(ctx, projStr) },
    }, [
      header,
      h("div.control-row", [h("div.tab-bar", tabButtons)]),
      errors,
      content,
    ]);
  }

  if (layout === "radio") {
    const groupName = `${idBase}-radio`;
    const radioOptions: VNode[] = [
      h("label", [
        h("input", {
          props: { type: "radio", name: groupName, checked: selected === undefined, value: UNSET },
          dataset: { projectionPath: projStr, valuePath: discValStr },
          on: {
            change: unset,
            focus: createFocusHandler(ctx, projStr, discValStr),
          },
        }),
        "(select)",
      ]),
      ...node.variantOrder.map((key) =>
        h("label", [
          h("input", {
            props: { type: "radio", name: groupName, checked: key === selected, value: key },
            dataset: { projectionPath: projStr, valuePath: discValStr },
            on: {
              change: () => selectVariant(key),
              focus: createFocusHandler(ctx, projStr, discValStr),
            },
          }),
          key,
        ])
      ),
    ];

    return h("div", {
      class: { ...judgmentClasses(judgment), "union-radio": true },
      dataset: { projectionPath: projStr, valuePath: valStr },
      hook: { insert: createInsertHook(ctx, projStr) },
    }, [
      header,
      h("div.control-row", [h("div.radio-group", radioOptions)]),
      errors,
      content,
    ]);
  }

  if (layout === "segmented") {
    const segments: VNode[] = [
      h("button.segment", {
        props: { type: "button" },
        class: { active: selected === undefined },
        dataset: { projectionPath: projStr, valuePath: discValStr },
        on: { click: unset, focus: createFocusHandler(ctx, projStr, discValStr) },
      }, "(select)"),
      ...node.variantOrder.map((key) =>
        h("button.segment", {
          props: { type: "button" },
          class: { active: key === selected },
          dataset: { projectionPath: projStr, valuePath: discValStr },
          on: { click: () => selectVariant(key), focus: createFocusHandler(ctx, projStr, discValStr) },
        }, key)
      ),
    ];

    return h("div", {
      class: { ...judgmentClasses(judgment), "union-segmented": true },
      dataset: { projectionPath: projStr, valuePath: valStr },
      hook: { insert: createInsertHook(ctx, projStr) },
    }, [
      header,
      h("div.control-row", [h("div.segmented-control", segments)]),
      errors,
      content,
    ]);
  }

  // Default: dropdown
  const selectId = `${idBase}-discriminator`;
  const options: VNode[] = [
    h("option", { props: { value: UNSET, selected: selected === undefined } }, "(select variant)"),
    ...node.variantOrder.map((key) =>
      h("option", { props: { value: key, selected: key === selected } }, key)
    ),
  ];

  const createChangeHandler = () => (e: Event) => {
    const target = e.currentTarget as HTMLSelectElement;
    if (target.value === UNSET) {
      unset();
      return;
    }
    selectVariant(target.value);
  };

  const select = h("select", {
    props: { id: selectId, value: selected ?? UNSET },
    dataset: { projectionPath: projStr, valuePath: discValStr },
    on: {
      change: createChangeHandler(),
      focus: createFocusHandler(ctx, projStr, discValStr),
    },
  }, options);

  return h("div", {
    class: judgmentClasses(judgment),
    dataset: { projectionPath: projStr, valuePath: valStr },
    hook: { insert: createInsertHook(ctx, projStr) },
  }, [
    h("div.node-header", [
      h("label.node-label", { props: { htmlFor: selectId } }, nodeLabel),
      h("code.node-path", projStr),
    ]),
    h("div.control-row", [select]),
    errors,
    content,
  ]);
}
