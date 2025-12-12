import type { Issue } from "../shared/issues";
import type { EngineArray, EngineObject, EngineValue } from "../shared/json";
import { isEngineArray, isEngineObject } from "../shared/json";
import type { ProjectionPath, ValuePath } from "../shared/paths";
import { appendProjectionPath, appendValuePath, projectionPathToString } from "../shared/paths";
import type { CompiledNode, CompiledProjection, CompiledStructNode, CompiledUnionNode } from "../static/compile";
import { aggregateOverActive, type Judgment } from "./judgment";
import { validateReferenceValue, validateScalarValue } from "./constraints";
import { hasUniqueDefinedItems } from "./unique";
import { evaluateRelation } from "./relations";

export type NodeSigma = {
  judgment: Judgment;
  issues: Issue[];
};

export type Sigma = {
  root: Judgment;
  byProjectionPath: Map<string, NodeSigma>;
  issues: Issue[];
};

function mkIssue(
  code: string,
  message: string,
  projectionPath: ProjectionPath,
  valuePath: ValuePath,
): Issue {
  return { severity: "error", code, message, projectionPath, valuePath };
}

type JudgeCtx = {
  byProjectionPath: Map<string, NodeSigma>;
  issues: Issue[];
};

function record(ctx: JudgeCtx, projectionPath: ProjectionPath, nodeSigma: NodeSigma, active: boolean) {
  ctx.byProjectionPath.set(projectionPathToString(projectionPath), nodeSigma);
  if (active) ctx.issues.push(...nodeSigma.issues);
}

function isMissing(value: EngineValue): boolean {
  return value === undefined;
}

function judgeNode(
  node: CompiledNode,
  value: EngineValue,
  projectionPath: ProjectionPath,
  valuePath: ValuePath,
  ctx: JudgeCtx,
  requiredPresence: boolean,
  active: boolean,
): NodeSigma {
  if (!active) {
    const s: NodeSigma = { judgment: "Inactive", issues: [] };
    record(ctx, projectionPath, s, false);
    return s;
  }

  if (requiredPresence && isMissing(value)) {
    const s: NodeSigma = {
      judgment: "Incomplete",
      issues: [mkIssue("missing_required", "value is required", projectionPath, valuePath)],
    };
    record(ctx, projectionPath, s, true);
    return s;
  }

  if (node.kind === "Scalar") {
    const required = Boolean(node.required) || requiredPresence;
    if (isMissing(value)) {
      const s: NodeSigma = required
        ? { judgment: "Incomplete", issues: [mkIssue("missing_required", "value is required", projectionPath, valuePath)] }
        : { judgment: "Valid", issues: [] };
      record(ctx, projectionPath, s, true);
      return s;
    }
    const issues = validateScalarValue(node.scalar, value, projectionPath, valuePath);
    const s: NodeSigma = { judgment: issues.length > 0 ? "Invalid" : "Valid", issues };
    record(ctx, projectionPath, s, true);
    return s;
  }

  if (node.kind === "Reference") {
    const required = Boolean(node.required) || requiredPresence;
    if (isMissing(value)) {
      const s: NodeSigma = required
        ? { judgment: "Incomplete", issues: [mkIssue("missing_required", "value is required", projectionPath, valuePath)] }
        : { judgment: "Valid", issues: [] };
      record(ctx, projectionPath, s, true);
      return s;
    }
    const issues = validateReferenceValue(node.format, value, projectionPath, valuePath);
    const s: NodeSigma = { judgment: issues.length > 0 ? "Invalid" : "Valid", issues };
    record(ctx, projectionPath, s, true);
    return s;
  }

  if (node.kind === "Struct") {
    return judgeStruct(node, value, projectionPath, valuePath, ctx, requiredPresence, active);
  }
  if (node.kind === "Union") {
    return judgeUnion(node, value, projectionPath, valuePath, ctx, requiredPresence, active);
  }
  return judgeList(node, value, projectionPath, valuePath, ctx, requiredPresence, active);
}

function getObject(value: EngineValue): EngineObject | undefined {
  if (value === undefined) return undefined;
  if (!isEngineObject(value)) return undefined;
  return value;
}

function getArray(value: EngineValue): EngineArray | undefined {
  if (value === undefined) return undefined;
  if (!isEngineArray(value)) return undefined;
  return value;
}

function judgeStruct(
  node: CompiledStructNode,
  value: EngineValue,
  projectionPath: ProjectionPath,
  valuePath: ValuePath,
  ctx: JudgeCtx,
  requiredPresence: boolean,
  active: boolean,
): NodeSigma {
  if (value !== undefined && !isEngineObject(value)) {
    const s: NodeSigma = {
      judgment: "Invalid",
      issues: [mkIssue("type_mismatch", "expected object", projectionPath, valuePath)],
    };
    record(ctx, projectionPath, s, active);
    return s;
  }

  const obj = getObject(value) ?? {};
  const childJudgments: Judgment[] = [];
  const childIssues: Issue[] = [];
  const fieldJudgmentByName = new Map<string, Judgment>();

  for (const fieldName of node.fieldOrder) {
    const childNode = node.fields[fieldName];
    const childValue = obj[fieldName];

    const childRequired =
      node.requiredSet.has(fieldName) ||
      (childNode.kind === "Scalar" && Boolean(childNode.required)) ||
      (childNode.kind === "Reference" && Boolean(childNode.required));

    const childSigma = judgeNode(
      childNode,
      childValue,
      appendProjectionPath(projectionPath, { type: "Field", name: fieldName }),
      appendValuePath(valuePath, fieldName),
      ctx,
      childRequired,
      true,
    );
    fieldJudgmentByName.set(fieldName, childSigma.judgment);
    childJudgments.push(childSigma.judgment);
    childIssues.push(...childSigma.issues);
  }

  let judgment = aggregateOverActive(childJudgments);
  const issues: Issue[] = [...childIssues];

  if (judgment !== "Invalid" && node.relations && node.relations.length > 0) {
    for (const rel of node.relations) {
      const leftVal = obj[rel.left];
      const rightVal = obj[rel.right];
      const leftJ = fieldJudgmentByName.get(rel.left) ?? "Valid";
      const rightJ = fieldJudgmentByName.get(rel.right) ?? "Valid";
      const relIssues = evaluateRelation(rel, leftVal, rightVal, leftJ, rightJ, projectionPath, valuePath);
      if (relIssues.length > 0) {
        issues.push(...relIssues);
        judgment = "Invalid";
      }
    }
  }

  const s: NodeSigma = { judgment, issues };
  record(ctx, projectionPath, s, active);
  return s;
}

function selectUnionVariant(
  node: CompiledUnionNode,
  value: EngineValue,
): { selected?: string; issue?: Issue; invalid?: boolean; incomplete?: boolean } {
  if (value !== undefined && !isEngineObject(value)) {
    return {
      invalid: true,
    };
  }

  const obj = getObject(value) ?? {};
  const discValue = obj[node.discriminator];

  if (discValue === undefined) {
    if (node.default !== undefined) return { selected: node.default };
    return { incomplete: true };
  }

  if (typeof discValue !== "string") return { invalid: true };
  if (!(discValue in node.variants)) return { invalid: true };
  return { selected: discValue };
}

function judgeUnion(
  node: CompiledUnionNode,
  value: EngineValue,
  projectionPath: ProjectionPath,
  valuePath: ValuePath,
  ctx: JudgeCtx,
  requiredPresence: boolean,
  active: boolean,
): NodeSigma {
  if (value !== undefined && !isEngineObject(value)) {
    const s: NodeSigma = {
      judgment: "Invalid",
      issues: [mkIssue("type_mismatch", "expected object", projectionPath, valuePath)],
    };
    record(ctx, projectionPath, s, active);
    return s;
  }

  const obj = getObject(value) ?? {};
  const selection = selectUnionVariant(node, value);

  if (selection.incomplete) {
    const s: NodeSigma = {
      judgment: requiredPresence ? "Incomplete" : "Incomplete",
      issues: [mkIssue("union_missing_discriminator", "missing discriminator", projectionPath, valuePath)],
    };
    record(ctx, projectionPath, s, active);
    return s;
  }

  if (selection.invalid) {
    const s: NodeSigma = {
      judgment: "Invalid",
      issues: [mkIssue("union_invalid_discriminator", "invalid discriminator", projectionPath, valuePath)],
    };
    record(ctx, projectionPath, s, active);
    return s;
  }

  const selectedKey = selection.selected as string;
  const variantNode = node.variants[selectedKey];
  const dataValue = obj.data;

  const variantSigma = judgeNode(
    variantNode,
    dataValue,
    appendProjectionPath(projectionPath, { type: "Variant", key: selectedKey }),
    appendValuePath(valuePath, "data"),
    ctx,
    true,
    true,
  );

  const s: NodeSigma = { judgment: variantSigma.judgment, issues: [...variantSigma.issues] };
  record(ctx, projectionPath, s, active);
  return s;
}

function judgeList(
  node: Extract<CompiledNode, { kind: "List" }>,
  value: EngineValue,
  projectionPath: ProjectionPath,
  valuePath: ValuePath,
  ctx: JudgeCtx,
  requiredPresence: boolean,
  active: boolean,
): NodeSigma {
  if (value !== undefined && !isEngineArray(value)) {
    const s: NodeSigma = {
      judgment: "Invalid",
      issues: [mkIssue("type_mismatch", "expected array", projectionPath, valuePath)],
    };
    record(ctx, projectionPath, s, active);
    return s;
  }

  const arr = getArray(value) ?? [];
  const issues: Issue[] = [];

  if (arr.length > node.maxItems) {
    issues.push(mkIssue("list_too_long", `must have <= ${node.maxItems} items`, projectionPath, valuePath));
  }

  if (typeof node.minItems === "number" && arr.length < node.minItems) {
    issues.push(mkIssue("list_too_short", `must have >= ${node.minItems} items`, projectionPath, valuePath));
  }

  if (node.uniqueItems) {
    if (!hasUniqueDefinedItems(arr)) {
      issues.push(mkIssue("list_unique_items", "items must be unique", projectionPath, valuePath));
    }
  }

  const itemJudgments: Judgment[] = [];
  const itemIssues: Issue[] = [];
  const len = Math.min(arr.length, node.maxItems);
  for (let i = 0; i < len; i += 1) {
    const itemSigma = judgeNode(
      node.item,
      arr[i],
      appendProjectionPath(projectionPath, { type: "Item", index: i }),
      appendValuePath(valuePath, i),
      ctx,
      true,
      true,
    );
    itemJudgments.push(itemSigma.judgment);
    itemIssues.push(...itemSigma.issues);
  }

  let judgment = aggregateOverActive(itemJudgments);
  if (issues.some((i) => i.code === "list_too_long")) judgment = "Invalid";
  else if (issues.some((i) => i.code === "list_too_short") && judgment !== "Invalid") judgment = "Incomplete";
  if (issues.some((i) => i.code === "list_unique_items") && judgment !== "Invalid") judgment = "Invalid";

  const s: NodeSigma = { judgment, issues: [...issues, ...itemIssues] };
  record(ctx, projectionPath, s, active);
  return s;
}

export function judge(projection: CompiledProjection, value: EngineValue): Sigma {
  const ctx: JudgeCtx = { byProjectionPath: new Map(), issues: [] };
  const rootSigma = judgeNode(projection.root, value, [], [], ctx, true, true);
  return {
    root: rootSigma.judgment,
    byProjectionPath: ctx.byProjectionPath,
    issues: ctx.issues,
  };
}
