import type { VNode } from "snabbdom";
import type {
  CompiledNode,
  CompiledScalarNode,
  CompiledReferenceNode,
  CompiledStructNode,
  CompiledUnionNode,
  CompiledListNode,
  EngineValue,
  ProjectionPath,
  Sigma,
  State,
  ValuePath,
} from "../../dist/esm/index.js";
import type { VDOMContext } from "./context";
import { h } from "./patch";
import { projectionPathToString, valuePathToString } from "../utils";
import { viewScalar } from "./components/scalar";
import { viewReference } from "./components/reference";
import { viewStruct } from "./components/struct";
import { viewUnion } from "./components/union";
import { viewList } from "./components/list";

export type Judgment = "Valid" | "Invalid" | "Incomplete" | "Inactive";

export type ViewNodeParams = {
  node: CompiledNode;
  value: EngineValue;
  projectionPath: ProjectionPath;
  valuePath: ValuePath;
  sigma: Sigma;
  ctx: VDOMContext;
  label?: string;
};

function judgmentClasses(judgment: Judgment): Record<string, boolean> {
  return {
    node: true,
    "judgment-valid": judgment === "Valid",
    "judgment-invalid": judgment === "Invalid",
    "judgment-incomplete": judgment === "Incomplete",
  };
}


export function viewNode(params: ViewNodeParams): VNode | null {
  const { node, value, projectionPath, valuePath, sigma, ctx, label } = params;
  const projStr = projectionPathToString(projectionPath);
  const valStr = valuePathToString(valuePath);

  const nodeSigma = sigma.byProjectionPath.get(projStr);
  const judgment: Judgment = (nodeSigma?.judgment as Judgment) ?? "Valid";
  if (judgment === "Inactive") return null;

  if (node.kind === "Scalar") {
    return viewScalar(node as CompiledScalarNode, value, projStr, valStr, judgment, sigma, ctx, label);
  }

  if (node.kind === "Reference") {
    return viewReference(node as CompiledReferenceNode, value, projStr, valStr, judgment, sigma, ctx, label);
  }

  if (node.kind === "Struct") {
    return viewStruct(
      node as CompiledStructNode,
      value,
      projectionPath,
      valuePath,
      projStr,
      valStr,
      judgment,
      sigma,
      ctx,
      viewNode,
      label,
    );
  }

  if (node.kind === "Union") {
    return viewUnion(
      node as CompiledUnionNode,
      value,
      projectionPath,
      valuePath,
      projStr,
      valStr,
      judgment,
      sigma,
      ctx,
      viewNode,
      label,
    );
  }

  // List
  return viewList(
    node as CompiledListNode,
    value,
    projectionPath,
    valuePath,
    projStr,
    valStr,
    judgment,
    sigma,
    ctx,
    viewNode,
    label,
  );
}

export function viewEngineState(state: State, ctx: VDOMContext): VNode {
  const rootLabel =
    state.projection.meta?.label ?? state.projection.root.meta?.label ?? "Root";

  const rootVNode = viewNode({
    node: state.projection.root,
    value: state.value,
    projectionPath: [],
    valuePath: [],
    sigma: state.sigma,
    ctx,
    label: rootLabel,
  });

  return h("div", { attrs: { "data-role": "vdom-root" } }, rootVNode ? [rootVNode] : []);
}
