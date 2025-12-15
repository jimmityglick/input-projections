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
  const selectId = `${idBase}-discriminator`;

  const discValuePath = [...valuePath, node.discriminator];
  const discValStr = valuePathToString(discValuePath);

  const selected = selectUnionVariant(node, value);

  const options: VNode[] = [
    h("option", { props: { value: UNSET, selected: selected === undefined } }, "(select variant)"),
    ...node.variantOrder.map((key) =>
      h("option", { props: { value: key, selected: key === selected } }, key)
    ),
  ];

  const createChangeHandler = () => (e: Event) => {
    const target = e.currentTarget as HTMLSelectElement;
    const discVp = parseValuePath(discValStr);
    const at = discVp.length > 0 ? discVp.slice(0, -1) : [];

    if (target.value === UNSET) {
      ctx.dispatch({ type: "Unset", at: discVp });
      return;
    }

    ctx.dispatch({ type: "SelectVariant", at, variantKey: target.value });

    const variantNode = node.variants[target.value];
    if (variantNode?.kind === "Scalar" && variantNode.scalar.type === "null") {
      ctx.dispatch({ type: "SetScalar", at: [...at, "data"], value: null });
    }
  };

  const select = h("select", {
    props: { id: selectId, value: selected ?? UNSET },
    dataset: { projectionPath: projStr, valuePath: discValStr },
    on: {
      change: createChangeHandler(),
      focus: createFocusHandler(ctx, projStr, discValStr),
    },
  }, options);

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
    h("div.errors", errorVNodes),
    h("div", contentChildren),
  ]);
}
