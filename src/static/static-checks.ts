import type { ParseIssue } from "../shared/issues";
import type {
  Node,
  ProjectionDefinition,
  ReferenceFormat,
  ScalarConstraints,
  StructNode,
  UnionNode,
} from "./schema-types";

function issue(code: string, message: string, path: string): ParseIssue {
  return { code, message, path };
}

function isFiniteNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function checkStringBounds(
  fmt: ReferenceFormat | Extract<ScalarConstraints, { type: "string" }>,
  pointer: string,
  issues: ParseIssue[],
) {
  if (fmt.minLength !== undefined && !isFiniteNonNegativeInteger(fmt.minLength)) {
    issues.push(issue("invalid_minLength", "minLength must be a non-negative integer", pointer));
  }
  if (fmt.maxLength !== undefined && !isFiniteNonNegativeInteger(fmt.maxLength)) {
    issues.push(issue("invalid_maxLength", "maxLength must be a non-negative integer", pointer));
  }
  if (
    typeof fmt.minLength === "number" &&
    typeof fmt.maxLength === "number" &&
    fmt.minLength > fmt.maxLength
  ) {
    issues.push(issue("invalid_bounds", "minLength must be <= maxLength", pointer));
  }
  if (fmt.pattern !== undefined) {
    try {
      // eslint-disable-next-line no-new
      new RegExp(fmt.pattern);
    } catch {
      issues.push(issue("invalid_pattern", "pattern must be a valid regex", `${pointer}/pattern`));
    }
  }
}

function checkScalarConstraints(
  scalar: ScalarConstraints,
  pointer: string,
  issues: ParseIssue[],
) {
  if (scalar.type === "string") checkStringBounds(scalar, pointer, issues);
  if (scalar.type === "number") {
    if (typeof scalar.min === "number" && typeof scalar.max === "number" && scalar.min > scalar.max) {
      issues.push(issue("invalid_bounds", "min must be <= max", pointer));
    }
    if (scalar.multipleOf !== undefined && typeof scalar.multipleOf === "number" && scalar.multipleOf <= 0) {
      issues.push(issue("invalid_multipleOf", "multipleOf must be > 0", pointer));
    }
  }
}

function checkStructNode(node: StructNode, pointer: string, issues: ParseIssue[]) {
  const fieldKeys = new Set(Object.keys(node.fields));

  if (node.required) {
    for (let i = 0; i < node.required.length; i += 1) {
      const name = node.required[i];
      if (!fieldKeys.has(name)) {
        issues.push(
          issue(
            "unknown_required_field",
            `required field '${name}' does not exist in fields`,
            `${pointer}/required/${i}`,
          ),
        );
      }
    }
  }

  if (node.relations) {
    for (let i = 0; i < node.relations.length; i += 1) {
      const rel = node.relations[i];
      if (!fieldKeys.has(rel.left)) {
        issues.push(
          issue(
            "unknown_relation_operand",
            `relation.left '${rel.left}' does not exist in fields`,
            `${pointer}/relations/${i}/left`,
          ),
        );
      }
      if (!fieldKeys.has(rel.right)) {
        issues.push(
          issue(
            "unknown_relation_operand",
            `relation.right '${rel.right}' does not exist in fields`,
            `${pointer}/relations/${i}/right`,
          ),
        );
      }
    }
  }
}

function checkUnionNode(node: UnionNode, pointer: string, issues: ParseIssue[]) {
  if (node.default !== undefined) {
    const keys = Object.keys(node.variants);
    if (!keys.includes(node.default)) {
      issues.push(
        issue(
          "unknown_union_default",
          `default variant '${node.default}' does not exist in variants`,
          `${pointer}/default`,
        ),
      );
    }
  }
}

function walk(node: Node, pointer: string, issues: ParseIssue[]) {
  if (node.kind === "Scalar") {
    checkScalarConstraints(node.scalar, `${pointer}/scalar`, issues);
    return;
  }
  if (node.kind === "Reference") {
    if (node.format) checkStringBounds(node.format, `${pointer}/format`, issues);
    return;
  }
  if (node.kind === "Struct") {
    checkStructNode(node, pointer, issues);
    for (const [key, child] of Object.entries(node.fields)) {
      walk(child, `${pointer}/fields/${key}`, issues);
    }
    return;
  }
  if (node.kind === "Union") {
    checkUnionNode(node, pointer, issues);
    for (const [key, child] of Object.entries(node.variants)) {
      walk(child, `${pointer}/variants/${key}`, issues);
    }
    return;
  }
  // List
  if (node.minItems !== undefined && node.minItems > node.maxItems) {
    issues.push(
      issue(
        "invalid_bounds",
        "minItems must be <= maxItems",
        `${pointer}/minItems`,
      ),
    );
  }
  walk(node.item, `${pointer}/item`, issues);
}

export function runStaticChecks(projection: ProjectionDefinition): ParseIssue[] {
  const issues: ParseIssue[] = [];
  walk(projection.root, "/root", issues);
  return issues;
}
