import type { EngineValue, Sigma } from "../dist/esm/index.js";
import type { CompiledNode, ProjectionPath, ValuePath } from "../dist/esm/index.js";
import type { RenderContext } from "./types";
import { projectionPathToString, valuePathToString } from "./utils";
import { renderScalar, renderReference } from "./scalars";
import { renderList, renderStruct, renderUnion } from "./containers";

export function processNode(
  node: CompiledNode,
  value: EngineValue,
  projectionPath: ProjectionPath,
  valuePath: ValuePath,
  sigma: Sigma,
  ctx: RenderContext,
  label?: string,
): HTMLElement | null {
  const projStr = projectionPathToString(projectionPath);
  const valStr = valuePathToString(valuePath);

  const nodeSigma = sigma.byProjectionPath.get(projStr);
  const judgment = nodeSigma?.judgment ?? "Valid";
  if (judgment === "Inactive") return null;

  if (node.kind === "Scalar") {
    return renderScalar(node, value, projStr, valStr, judgment, sigma, ctx, label);
  }
  if (node.kind === "Reference") {
    return renderReference(node, value, projStr, valStr, judgment, sigma, ctx, label);
  }
  if (node.kind === "Struct") {
    return renderStruct(node, value, projectionPath, valuePath, projStr, judgment, sigma, ctx, label);
  }
  if (node.kind === "Union") {
    return renderUnion(node, value, projectionPath, valuePath, projStr, judgment, sigma, ctx, label);
  }
  return renderList(node, value, projectionPath, valuePath, projStr, judgment, sigma, ctx, label);
}

