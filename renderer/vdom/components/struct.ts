import type { VNode } from "snabbdom";
import type {
  CompiledStructNode,
  EngineValue,
  ProjectionPath,
  Sigma,
  ValuePath,
} from "../../../dist/esm/index.js";
import type { VDOMContext } from "../context";
import type { Judgment, ViewNodeParams } from "../view";
import { h } from "../patch";
import { valuePathToString } from "../../utils";
import { issuesForProjectionPath, viewErrors } from "../helpers/errors";

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

export function viewStruct(
  node: CompiledStructNode,
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
  const idBase = projStr.replaceAll("/", "_");
  const issues = issuesForProjectionPath(sigma, projStr);
  const errorVNodes = viewErrors(issues, `${idBase}_struct`);

  const obj =
    value !== undefined && typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as Record<string, EngineValue>)
      : {};

  const childVNodes: VNode[] = [];
  for (const fieldName of node.fieldOrder) {
    const childNode = node.fields[fieldName];
    const childValue = obj[fieldName];
    const childVNode = viewNode({
      node: childNode,
      value: childValue,
      projectionPath: [...projectionPath, { type: "Field", name: fieldName }],
      valuePath: [...valuePath, fieldName],
      sigma,
      ctx,
      label: childNode.meta?.label ?? fieldName,
    });
    if (childVNode) childVNodes.push(childVNode);
  }

  const legendText = label ?? node.meta?.label ?? "Struct";

  return h("fieldset", {
    class: judgmentClasses(judgment),
    dataset: { projectionPath: projStr, valuePath: valStr },
    hook: { insert: createInsertHook(ctx, projStr) },
  }, [
    h("legend", legendText),
    h("div.errors", errorVNodes),
    h("div", childVNodes),
  ]);
}
