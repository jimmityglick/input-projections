import type { EngineArray, EngineObject, EngineValue } from "../shared/json";
import { isEngineArray, isEngineObject } from "../shared/json";
import type { CompiledNode, CompiledStructNode, CompiledUnionNode } from "../static/compile";

function pruneStructValue(node: CompiledStructNode, value: EngineValue, prev: EngineValue): EngineValue {
  if (!isEngineObject(value)) return value;
  const out: EngineObject = {};
  let changed = false;
  for (const fieldName of node.fieldOrder) {
    const child = node.fields[fieldName];
    const childVal = value[fieldName];
    const prevChildVal = isEngineObject(prev) ? prev[fieldName] : undefined;
    const nextChildVal = normalizeNode(child, childVal, prevChildVal);
    if (nextChildVal !== undefined) out[fieldName] = nextChildVal;
    if (nextChildVal !== childVal) changed = true;
  }
  for (const key of Object.keys(value)) {
    if (!(key in node.fields)) changed = true;
  }
  return changed ? out : value;
}

function getUnionSelection(node: CompiledUnionNode, value: EngineValue): string | undefined {
  if (!isEngineObject(value)) return undefined;
  const disc = value[node.discriminator];
  if (disc === undefined) return node.default;
  if (typeof disc !== "string") return undefined;
  if (!(disc in node.variants)) return undefined;
  return disc;
}

function pruneUnionValue(node: CompiledUnionNode, value: EngineValue, prev: EngineValue): EngineValue {
  if (value === undefined) {
    if (node.default === undefined) return undefined;
    return { [node.discriminator]: node.default };
  }
  if (!isEngineObject(value)) return value;

  const prevSelection = getUnionSelection(node, prev);
  const nextSelection = getUnionSelection(node, value);

  const nextObj: EngineObject = {};
  let changed = false;

  // Materialize default discriminator if missing.
  const discValue = value[node.discriminator];
  if (discValue === undefined && node.default !== undefined) {
    nextObj[node.discriminator] = node.default;
    changed = true;
  } else {
    nextObj[node.discriminator] = discValue;
  }

  // If the union has no active selection, its `data` is inactive and should be removed.
  // Otherwise, only clear when switching between two concrete selections.
  const shouldClearData =
    nextSelection === undefined ||
    (prevSelection !== undefined && prevSelection !== nextSelection);
  const rawData = shouldClearData ? undefined : value.data;
  if (shouldClearData && value.data !== undefined) changed = true;

  if (nextSelection) {
    const prevData = isEngineObject(prev) ? prev.data : undefined;
    const normalizedData = normalizeNode(node.variants[nextSelection], rawData, prevData);
    if (normalizedData !== undefined) nextObj.data = normalizedData;
    if (normalizedData !== rawData) changed = true;
  } else {
    if (value.data !== undefined) changed = true;
  }

  for (const key of Object.keys(value)) {
    if (key !== node.discriminator && key !== "data") changed = true;
  }

  if (!changed) return value;
  // Drop undefined discriminator key if still missing.
  if (nextObj[node.discriminator] === undefined) delete nextObj[node.discriminator];
  return nextObj;
}

function pruneListValue(node: Extract<CompiledNode, { kind: "List" }>, value: EngineValue, prev: EngineValue): EngineValue {
  if (value === undefined) return undefined;
  if (!isEngineArray(value)) return value;
  const prevArr = isEngineArray(prev) ? prev : undefined;
  const out: EngineArray = value.slice(0, node.maxItems);
  let changed = out.length !== value.length;

  // When list size changed, items may have shifted indices. Don't pass prev items
  // to avoid incorrect comparisons (e.g., union variant mismatch clearing data).
  const sizeChanged = prevArr === undefined || prevArr.length !== out.length;

  for (let i = 0; i < out.length; i += 1) {
    const prevItem = sizeChanged ? undefined : prevArr[i];
    const nextItem = normalizeNode(node.item, out[i], prevItem);
    if (nextItem !== out[i]) {
      out[i] = nextItem;
      changed = true;
    }
  }
  return changed ? out : value;
}

export function normalizeNode(node: CompiledNode, value: EngineValue, prev: EngineValue): EngineValue {
  if (node.kind === "Scalar" || node.kind === "Reference") return value;
  if (node.kind === "Struct") return pruneStructValue(node, value, prev);
  if (node.kind === "Union") return pruneUnionValue(node, value, prev);
  return pruneListValue(node, value, prev);
}

export function normalizeValue(root: CompiledNode, value: EngineValue, prev: EngineValue): EngineValue {
  return normalizeNode(root, value, prev);
}
