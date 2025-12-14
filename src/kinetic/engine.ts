import type { Result } from "../shared/result";
import { ok } from "../shared/result";
import type { EngineValue } from "../shared/json";
import type { ParseIssue } from "../shared/issues";
import type { ProjectionDefinition } from "../static/schema-types";
import { parseProjection } from "../static/parse";
import { compileProjection, type CompiledProjection } from "../static/compile";
import { judge, type Sigma } from "../logic/judge";
import type { ProjectionPath, ValuePath } from "../shared/paths";
import { projectionPathToString, valuePathToString } from "../shared/paths";
import { enumerateActionable, type Cursor } from "./traverse";
import { normalizeValue } from "./normalize";
import { listAddAt, listRemoveAt, setAt, unsetAt, getAt } from "./value_ops";

export type Action =
  | { type: "SetScalar"; at: ValuePath; value: string | number | boolean | null }
  | { type: "Unset"; at: ValuePath }
  | { type: "SelectVariant"; at: ValuePath; variantKey: string }
  | { type: "ListAdd"; at: ValuePath }
  | { type: "ListRemove"; at: ValuePath; index: number }
  | { type: "MoveCursor"; toProjectionPath?: ProjectionPath; toValuePath?: ValuePath };

export type State = {
  projection: CompiledProjection;
  value: EngineValue;
  cursor: Cursor;
  sigma: Sigma;
  lastAction?: Action;
};

export type { Cursor } from "./traverse";

export type Engine = {
  getState(): State;
  dispatch(action: Action): State;
  reset(initialValue?: EngineValue): State;
  next(): State;
  prev(): State;
  set(value: string | number | boolean | null): State;
  select(variantKey: string): State;
};

function cursorKey(c: Cursor): string {
  return `${projectionPathToString(c.projectionPath)}::${valuePathToString(c.valuePath)}`;
}

function normalizeCursor(projection: CompiledProjection, value: EngineValue, requested?: Cursor): Cursor {
  const actionable = enumerateActionable(projection, value);
  if (actionable.length === 0) return { projectionPath: [], valuePath: [] };
  const byKey = new Map(actionable.map((c) => [cursorKey(c), c]));
  if (requested) {
    const found = byKey.get(cursorKey(requested));
    if (found) return found;
  }
  return actionable[0];
}

function findListNode(projection: CompiledProjection, value: EngineValue, at: ValuePath): Extract<CompiledProjection["root"], { kind: "List" }> | null {
  let node = projection.root;
  let curValue: EngineValue = value;
  for (const seg of at) {
    if (node.kind === "Struct") {
      if (typeof seg !== "string") return null;
      if (curValue !== undefined && typeof curValue === "object" && !Array.isArray(curValue)) {
        curValue = (curValue as Record<string, EngineValue>)[seg];
      } else {
        curValue = undefined;
      }
      node = node.fields[seg];
      continue;
    }
    if (node.kind === "Union") {
      if (typeof seg !== "string") return null;
      if (seg === node.discriminator) return null;
      if (seg !== "data") return null;
      const unionObj =
        curValue !== undefined && typeof curValue === "object" && !Array.isArray(curValue)
          ? (curValue as Record<string, EngineValue>)
          : {};
      const disc = unionObj[node.discriminator];
      const selected =
        disc === undefined
          ? node.default
          : typeof disc === "string" && disc in node.variants
            ? disc
            : undefined;
      if (!selected) return null;
      curValue = unionObj.data;
      node = node.variants[selected];
      continue;
    }
    if (node.kind === "List") {
      if (typeof seg !== "number") return null;
      if (Array.isArray(curValue)) curValue = (curValue as EngineValue[])[seg];
      else curValue = undefined;
      node = node.item;
      continue;
    }
    return null;
  }
  if (node.kind !== "List") return null;
  return node;
}

function applyAction(state: State, action: Action): { value: EngineValue; cursorRequest?: Cursor } {
  if (action.type === "SetScalar") return { value: setAt(state.value, action.at, action.value) };
  if (action.type === "Unset") return { value: unsetAt(state.value, action.at) };

  if (action.type === "SelectVariant") {
    // `at` is expected to be the Union container's value path.
    // We set `at + [discriminator]` and explicitly clear `data` when variant changes.
    // Best-effort: if union node can't be found, no-op.
    const unionObj = getAt(state.value, action.at);
    if (unionObj !== undefined && (typeof unionObj !== "object" || Array.isArray(unionObj))) return { value: state.value };

    // Find the union node by walking the projection.
    let node = state.projection.root;
    let curValue: EngineValue = state.value;
    for (const seg of action.at) {
      if (node.kind === "Struct") {
        if (typeof seg !== "string") return { value: state.value };
        node = node.fields[seg];
        if (curValue !== undefined && typeof curValue === "object" && !Array.isArray(curValue)) curValue = (curValue as Record<string, EngineValue>)[seg];
        else curValue = undefined;
        continue;
      }
      if (node.kind === "Union") {
        if (typeof seg !== "string") return { value: state.value };
        if (seg === node.discriminator) return { value: state.value };
        if (seg !== "data") return { value: state.value };
        const unionValueObj =
          curValue !== undefined && typeof curValue === "object" && !Array.isArray(curValue)
            ? (curValue as Record<string, EngineValue>)
            : {};
        const disc = unionValueObj[node.discriminator];
        const selected =
          disc === undefined
            ? node.default
            : typeof disc === "string" && disc in node.variants
              ? disc
              : undefined;
        if (!selected) return { value: state.value };
        node = node.variants[selected];
        curValue = unionValueObj.data;
        continue;
      }
      if (node.kind === "List") {
        if (typeof seg !== "number") return { value: state.value };
        node = node.item;
        if (Array.isArray(curValue)) curValue = (curValue as EngineValue[])[seg];
        else curValue = undefined;
        continue;
      }
      return { value: state.value };
    }
    if (node.kind !== "Union") return { value: state.value };

    // Check if variant is actually changing - if so, clear data
    const currentObj = getAt(state.value, action.at);
    const currentDisc =
      currentObj !== undefined && typeof currentObj === "object" && !Array.isArray(currentObj)
        ? (currentObj as Record<string, EngineValue>)[node.discriminator]
        : undefined;
    const currentVariant = typeof currentDisc === "string" ? currentDisc : node.default;

    let next = setAt(state.value, [...action.at, node.discriminator], action.variantKey);
    // Clear data when switching to a different variant
    if (currentVariant !== action.variantKey) {
      next = unsetAt(next, [...action.at, "data"]);
    }
    return { value: next, cursorRequest: { projectionPath: state.cursor.projectionPath, valuePath: [...action.at, node.discriminator] } };
  }

  if (action.type === "ListAdd") {
    const listNode = findListNode(state.projection, state.value, action.at);
    if (!listNode) return { value: state.value };
    return { value: listAddAt(state.value, action.at, listNode.maxItems) };
  }

  if (action.type === "ListRemove") {
    const listNode = findListNode(state.projection, state.value, action.at);
    if (!listNode) return { value: state.value };
    return { value: listRemoveAt(state.value, action.at, action.index, listNode.minItems) };
  }

  // MoveCursor
  const requested: Cursor | undefined =
    action.toProjectionPath || action.toValuePath
      ? {
          projectionPath: action.toProjectionPath ?? state.cursor.projectionPath,
          valuePath: action.toValuePath ?? state.cursor.valuePath,
        }
      : undefined;
  return { value: state.value, cursorRequest: requested };
}

function step(state: State, action: Action): State {
  const applied = applyAction(state, action);
  const normalizedValue = normalizeValue(state.projection.root, applied.value, state.value);
  const sigma = judge(state.projection, normalizedValue);
  const cursor = normalizeCursor(state.projection, normalizedValue, applied.cursorRequest ?? state.cursor);
  return {
    projection: state.projection,
    value: normalizedValue,
    cursor,
    sigma,
    lastAction: action,
  };
}

export function createEngine(input: unknown | ProjectionDefinition): Engine {
  const parsed = ((): Result<ProjectionDefinition, ParseIssue[]> => {
    if (input && typeof input === "object" && "root" in (input as Record<string, unknown>) && "version" in (input as Record<string, unknown>)) {
      return ok(input as ProjectionDefinition);
    }
    return parseProjection(input);
  })();

  if (!parsed.ok) {
    const msg = parsed.error.map((i) => `${i.path}: ${i.code}: ${i.message}`).join("\n");
    throw new Error(`Invalid projection:\n${msg}`);
  }

  const compiled = compileProjection(parsed.value);

  let state: State = (() => {
    const initialValue: EngineValue = undefined;
    const sigma = judge(compiled, initialValue);
    const cursor = normalizeCursor(compiled, initialValue);
    return { projection: compiled, value: initialValue, cursor, sigma };
  })();

  return {
    getState() {
      return state;
    },
    dispatch(action: Action) {
      state = step(state, action);
      return state;
    },
    reset(initialValue?: EngineValue) {
      const normalizedValue = normalizeValue(compiled.root, initialValue, state.value);
      const sigma = judge(compiled, normalizedValue);
      const cursor = normalizeCursor(compiled, normalizedValue);
      state = { projection: compiled, value: normalizedValue, cursor, sigma };
      return state;
    },
    next() {
      const list = enumerateActionable(compiled, state.value);
      const idx = list.findIndex((c) => cursorKey(c) === cursorKey(state.cursor));
      const next = idx >= 0 && idx + 1 < list.length ? list[idx + 1] : list[0];
      state = { ...state, cursor: next, lastAction: { type: "MoveCursor", toProjectionPath: next.projectionPath, toValuePath: next.valuePath } };
      return state;
    },
    prev() {
      const list = enumerateActionable(compiled, state.value);
      const idx = list.findIndex((c) => cursorKey(c) === cursorKey(state.cursor));
      const prev = idx > 0 ? list[idx - 1] : list[list.length - 1];
      state = { ...state, cursor: prev, lastAction: { type: "MoveCursor", toProjectionPath: prev.projectionPath, toValuePath: prev.valuePath } };
      return state;
    },
    set(value: string | number | boolean | null) {
      state = step(state, { type: "SetScalar", at: state.cursor.valuePath, value });
      return state;
    },
    select(variantKey: string) {
      // If currently on union discriminator, select at union container path.
      const valuePath = state.cursor.valuePath;
      const at = valuePath.length > 0 ? valuePath.slice(0, -1) : [];
      state = step(state, { type: "SelectVariant", at, variantKey });
      return state;
    },
  };
}
