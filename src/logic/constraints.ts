import type { Issue } from "../shared/issues";
import type { ProjectionPath, ValuePath } from "../shared/paths";
import { isJsonScalar } from "../shared/json";
import type { ReferenceFormat, ScalarConstraints } from "../static/schema-types";

const regexCache = new Map<string, RegExp | null>();

function safeCompileRegex(pattern: string): RegExp | null {
  if (regexCache.has(pattern)) return regexCache.get(pattern) ?? null;
  try {
    const re = new RegExp(pattern);
    regexCache.set(pattern, re);
    return re;
  } catch {
    regexCache.set(pattern, null);
    return null;
  }
}

function mkIssue(
  code: string,
  message: string,
  projectionPath: ProjectionPath,
  valuePath: ValuePath,
): Issue {
  return { severity: "error", code, message, projectionPath, valuePath };
}

export function validateScalarValue(
  constraints: ScalarConstraints,
  value: unknown,
  projectionPath: ProjectionPath,
  valuePath: ValuePath,
): Issue[] {
  if (!isJsonScalar(value)) {
    return [mkIssue("type_mismatch", "expected a JSON scalar", projectionPath, valuePath)];
  }

  if (constraints.type === "null") {
    if (value !== null) return [mkIssue("type_mismatch", "expected null", projectionPath, valuePath)];
    return [];
  }

  if (constraints.type === "boolean") {
    if (typeof value !== "boolean") return [mkIssue("type_mismatch", "expected boolean", projectionPath, valuePath)];
    if (constraints.enum && !constraints.enum.includes(value)) {
      return [mkIssue("constraint_failed", "value not in enum", projectionPath, valuePath)];
    }
    return [];
  }

  if (constraints.type === "number") {
    if (typeof value !== "number") return [mkIssue("type_mismatch", "expected number", projectionPath, valuePath)];
    if (typeof constraints.min === "number" && value < constraints.min) {
      return [mkIssue("constraint_failed", `value must be >= ${constraints.min}`, projectionPath, valuePath)];
    }
    if (typeof constraints.max === "number" && value > constraints.max) {
      return [mkIssue("constraint_failed", `value must be <= ${constraints.max}`, projectionPath, valuePath)];
    }
    if (typeof constraints.multipleOf === "number") {
      const m = constraints.multipleOf;
      if (m <= 0) return [mkIssue("constraint_failed", "multipleOf must be > 0", projectionPath, valuePath)];
      const q = value / m;
      if (!Number.isFinite(q) || Math.abs(q - Math.round(q)) > 1e-12) {
        return [mkIssue("constraint_failed", `value must be a multiple of ${m}`, projectionPath, valuePath)];
      }
    }
    return [];
  }

  // string
  if (typeof value !== "string") return [mkIssue("type_mismatch", "expected string", projectionPath, valuePath)];
  if (typeof constraints.minLength === "number" && value.length < constraints.minLength) {
    return [mkIssue("constraint_failed", `length must be >= ${constraints.minLength}`, projectionPath, valuePath)];
  }
  if (typeof constraints.maxLength === "number" && value.length > constraints.maxLength) {
    return [mkIssue("constraint_failed", `length must be <= ${constraints.maxLength}`, projectionPath, valuePath)];
  }
  if (constraints.enum && !constraints.enum.includes(value)) {
    return [mkIssue("constraint_failed", "value not in enum", projectionPath, valuePath)];
  }
  if (typeof constraints.pattern === "string") {
    const re = safeCompileRegex(constraints.pattern);
    if (!re) return [mkIssue("invalid_pattern", "invalid regex pattern", projectionPath, valuePath)];
    if (!re.test(value)) {
      return [mkIssue("constraint_failed", "pattern mismatch", projectionPath, valuePath)];
    }
  }
  return [];
}

export function validateReferenceValue(
  format: ReferenceFormat | undefined,
  value: unknown,
  projectionPath: ProjectionPath,
  valuePath: ValuePath,
): Issue[] {
  if (!isJsonScalar(value)) {
    return [mkIssue("type_mismatch", "expected a JSON scalar", projectionPath, valuePath)];
  }
  if (typeof value !== "string") {
    return [mkIssue("type_mismatch", "expected string", projectionPath, valuePath)];
  }
  if (!format) return [];

  if (typeof format.minLength === "number" && value.length < format.minLength) {
    return [mkIssue("constraint_failed", `length must be >= ${format.minLength}`, projectionPath, valuePath)];
  }
  if (typeof format.maxLength === "number" && value.length > format.maxLength) {
    return [mkIssue("constraint_failed", `length must be <= ${format.maxLength}`, projectionPath, valuePath)];
  }
  if (format.enum && !format.enum.includes(value)) {
    return [mkIssue("constraint_failed", "value not in enum", projectionPath, valuePath)];
  }
  if (typeof format.pattern === "string") {
    const re = safeCompileRegex(format.pattern);
    if (!re) return [mkIssue("invalid_pattern", "invalid regex pattern", projectionPath, valuePath)];
    if (!re.test(value)) {
      return [mkIssue("constraint_failed", "pattern mismatch", projectionPath, valuePath)];
    }
  }
  return [];
}
