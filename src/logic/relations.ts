import type { Issue } from "../shared/issues";
import type { EngineValue } from "../shared/json";
import type { ProjectionPath, ValuePath } from "../shared/paths";
import { appendProjectionPath, appendValuePath } from "../shared/paths";
import type { Judgment } from "./judgment";
import type { Relation } from "../static/schema-types";

function mkIssue(
  rel: Relation,
  projectionPath: ProjectionPath,
  valuePath: ValuePath,
): Issue {
  const leftProjectionPath = appendProjectionPath(projectionPath, { type: "Field", name: rel.left });
  const rightProjectionPath = appendProjectionPath(projectionPath, { type: "Field", name: rel.right });
  const leftValuePath = appendValuePath(valuePath, rel.left);
  const rightValuePath = appendValuePath(valuePath, rel.right);

  return {
    severity: "error",
    code: "relation_failed",
    message: rel.label,
    projectionPath,
    valuePath,
    relatedProjectionPaths:
      rel.left === rel.right ? [leftProjectionPath] : [leftProjectionPath, rightProjectionPath],
    relatedValuePaths: rel.left === rel.right ? [leftValuePath] : [leftValuePath, rightValuePath],
  };
}

function isComparableScalar(value: EngineValue): value is string | number | boolean | null {
  return (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}

export function evaluateRelation(
  rel: Relation,
  leftValue: EngineValue,
  rightValue: EngineValue,
  leftJudgment: Judgment,
  rightJudgment: Judgment,
  projectionPath: ProjectionPath,
  valuePath: ValuePath,
): Issue[] {
  if (leftValue === undefined || rightValue === undefined) return [];
  if (leftJudgment !== "Valid" || rightJudgment !== "Valid") return [];
  if (!isComparableScalar(leftValue) || !isComparableScalar(rightValue)) return [];

  const op = rel.op;
  if (op === "eq") return leftValue === rightValue ? [] : [mkIssue(rel, projectionPath, valuePath)];
  if (op === "neq") return leftValue !== rightValue ? [] : [mkIssue(rel, projectionPath, valuePath)];

  const bothNumbers = typeof leftValue === "number" && typeof rightValue === "number";
  const bothStrings = typeof leftValue === "string" && typeof rightValue === "string";
  if (!bothNumbers && !bothStrings) return [];

  if (op === "gt") return leftValue > rightValue ? [] : [mkIssue(rel, projectionPath, valuePath)];
  if (op === "lt") return leftValue < rightValue ? [] : [mkIssue(rel, projectionPath, valuePath)];
  if (op === "gte") return leftValue >= rightValue ? [] : [mkIssue(rel, projectionPath, valuePath)];
  return leftValue <= rightValue ? [] : [mkIssue(rel, projectionPath, valuePath)];
}
