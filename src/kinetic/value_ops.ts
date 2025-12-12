import type { EngineArray, EngineObject, EngineValue } from "../shared/json";
import { isEngineArray, isEngineObject } from "../shared/json";
import type { ValuePath } from "../shared/paths";

export function getAt(root: EngineValue, path: ValuePath): EngineValue {
  let cur: EngineValue = root;
  for (const seg of path) {
    if (cur === undefined) return undefined;
    if (typeof seg === "string") {
      if (!isEngineObject(cur)) return undefined;
      cur = cur[seg];
      continue;
    }
    if (!isEngineArray(cur)) return undefined;
    cur = cur[seg];
  }
  return cur;
}

function ensureObject(value: EngineValue): EngineObject {
  if (isEngineObject(value)) return value;
  return {};
}

function ensureArray(value: EngineValue): EngineArray {
  if (isEngineArray(value)) return value;
  return [];
}

export function setAt(root: EngineValue, path: ValuePath, value: EngineValue): EngineValue {
  if (path.length === 0) return value;

  const [head, ...tail] = path;
  if (typeof head === "string") {
    const obj = ensureObject(root);
    const prev = obj[head];
    const nextChild = setAt(prev, tail, value);
    if (prev === nextChild && isEngineObject(root)) return root;
    return { ...obj, [head]: nextChild };
  }

  const arr = ensureArray(root);
  const idx = head;
  const prev = arr[idx];
  const nextChild = setAt(prev, tail, value);
  if (prev === nextChild && isEngineArray(root)) return root;

  const next = arr.slice();
  while (next.length <= idx) next.push(undefined);
  next[idx] = nextChild;
  return next;
}

export function unsetAt(root: EngineValue, path: ValuePath): EngineValue {
  if (path.length === 0) return undefined;
  const [head, ...tail] = path;

  if (typeof head === "string") {
    if (!isEngineObject(root)) return root;
    if (tail.length === 0) {
      if (!(head in root)) return root;
      const next: EngineObject = { ...root };
      delete next[head];
      return next;
    }
    const prev = root[head];
    const nextChild = unsetAt(prev, tail);
    if (prev === nextChild) return root;
    return { ...root, [head]: nextChild };
  }

  if (!isEngineArray(root)) return root;
  const idx = head;
  if (idx < 0 || idx >= root.length) return root;
  if (tail.length === 0) {
    const next = root.slice();
    next[idx] = undefined;
    return next;
  }
  const prev = root[idx];
  const nextChild = unsetAt(prev, tail);
  if (prev === nextChild) return root;
  const next = root.slice();
  next[idx] = nextChild;
  return next;
}

export function listAddAt(root: EngineValue, path: ValuePath, maxItems: number): EngineValue {
  const current = getAt(root, path);
  const arr = ensureArray(current);
  if (arr.length >= maxItems) return root;
  const next = arr.slice();
  next.push(undefined);
  return setAt(root, path, next);
}

export function listRemoveAt(
  root: EngineValue,
  path: ValuePath,
  index: number,
  minItems: number | undefined,
): EngineValue {
  const current = getAt(root, path);
  const arr = ensureArray(current);
  if (minItems !== undefined && arr.length <= minItems) return root;
  if (index < 0 || index >= arr.length) return root;
  const next = arr.slice();
  next.splice(index, 1);
  return setAt(root, path, next);
}
