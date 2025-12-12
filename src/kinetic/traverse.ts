import type { EngineValue } from "../shared/json";
import { isEngineArray, isEngineObject } from "../shared/json";
import type { ProjectionPath, ValuePath } from "../shared/paths";
import { appendProjectionPath, appendValuePath } from "../shared/paths";
import type { CompiledNode, CompiledProjection, CompiledStructNode, CompiledUnionNode } from "../static/compile";

export type Cursor = { projectionPath: ProjectionPath; valuePath: ValuePath };

function selectUnionVariant(node: CompiledUnionNode, value: EngineValue): string | undefined {
  if (value !== undefined && !isEngineObject(value)) return undefined;
  const obj = (isEngineObject(value) ? value : {}) as Record<string, EngineValue>;
  const discValue = obj[node.discriminator];
  if (discValue === undefined) return node.default;
  if (typeof discValue !== "string") return undefined;
  if (!(discValue in node.variants)) return undefined;
  return discValue;
}

function traverseNode(
  node: CompiledNode,
  value: EngineValue,
  projectionPath: ProjectionPath,
  valuePath: ValuePath,
  out: Cursor[],
) {
  if (node.kind === "Scalar" || node.kind === "Reference") {
    out.push({ projectionPath, valuePath });
    return;
  }

  if (node.kind === "Struct") {
    const obj = isEngineObject(value) ? value : undefined;
    for (const fieldName of (node as CompiledStructNode).fieldOrder) {
      traverseNode(
        (node as CompiledStructNode).fields[fieldName],
        obj ? obj[fieldName] : undefined,
        appendProjectionPath(projectionPath, { type: "Field", name: fieldName }),
        appendValuePath(valuePath, fieldName),
        out,
      );
    }
    return;
  }

  if (node.kind === "Union") {
    const u = node as CompiledUnionNode;
    // Union discriminator is always actionable.
    out.push({ projectionPath, valuePath: appendValuePath(valuePath, u.discriminator) });

    const selected = selectUnionVariant(u, value);
    if (!selected) return;

    const obj = isEngineObject(value) ? value : undefined;
    traverseNode(
      u.variants[selected],
      obj ? obj.data : undefined,
      appendProjectionPath(projectionPath, { type: "Variant", key: selected }),
      appendValuePath(valuePath, "data"),
      out,
    );
    return;
  }

  // List
  out.push({ projectionPath, valuePath });
  const arr = isEngineArray(value) ? value : undefined;
  if (!arr) return;
  for (let i = 0; i < arr.length; i += 1) {
    traverseNode(
      node.item,
      arr[i],
      appendProjectionPath(projectionPath, { type: "Item", index: i }),
      appendValuePath(valuePath, i),
      out,
    );
  }
}

export function enumerateActionable(projection: CompiledProjection, value: EngineValue): Cursor[] {
  const out: Cursor[] = [];
  traverseNode(projection.root, value, [], [], out);
  return out;
}
