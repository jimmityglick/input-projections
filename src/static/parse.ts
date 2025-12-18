import { err, ok, type Result } from "../shared/result";
import type { ParseIssue } from "../shared/issues";
import { isPlainObject } from "../shared/json";
import type {
  MetaObject,
  Node,
  ProjectionDefinition,
  Relation,
  ReferenceFormat,
  ScalarConstraints,
} from "./schema-types";
import { runStaticChecks } from "./static-checks";

const VERSION_RE = /^[0-9]+\.[0-9]+\.[0-9]+$/;
const NODE_ID_RE = /^[A-Za-z0-9._:-]+$/;
const FIELD_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const VARIANT_KEY_RE = /^[A-Za-z0-9._:-]+$/;

function issue(code: string, message: string, path: string): ParseIssue {
  return { code, message, path };
}

function hasOnlyKeys(
  obj: Record<string, unknown>,
  allowed: readonly string[],
  pointer: string,
  issues: ParseIssue[],
) {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(obj)) {
    if (!allowedSet.has(key)) {
      issues.push(
        issue(
          "unexpected_property",
          `unexpected property '${key}'`,
          `${pointer}/${key}`,
        ),
      );
    }
  }
}

function parseMetaObject(
  input: unknown,
  pointer: string,
  issues: ParseIssue[],
): MetaObject | undefined {
  if (input === undefined) return undefined;
  if (!isPlainObject(input)) {
    issues.push(issue("invalid_type", "meta must be an object", pointer));
    return undefined;
  }

  hasOnlyKeys(
    input,
    ["label", "description", "hint", "layout", "clearable", "examples", "tags"],
    pointer,
    issues,
  );
  const out: MetaObject = {};
  if (input.label !== undefined) {
    if (typeof input.label !== "string") issues.push(issue("invalid_type", "label must be a string", `${pointer}/label`));
    else out.label = input.label;
  }
  if (input.description !== undefined) {
    if (typeof input.description !== "string") issues.push(issue("invalid_type", "description must be a string", `${pointer}/description`));
    else out.description = input.description;
  }
  if (input.hint !== undefined) {
    if (typeof input.hint !== "string") issues.push(issue("invalid_type", "hint must be a string", `${pointer}/hint`));
    else out.hint = input.hint;
  }
  if (input.layout !== undefined) {
    if (typeof input.layout !== "string") issues.push(issue("invalid_type", "layout must be a string", `${pointer}/layout`));
    else out.layout = input.layout;
  }
  if (input.clearable !== undefined) {
    if (typeof input.clearable !== "boolean") issues.push(issue("invalid_type", "clearable must be a boolean", `${pointer}/clearable`));
    else out.clearable = input.clearable;
  }
  if (input.examples !== undefined) {
    if (!Array.isArray(input.examples)) issues.push(issue("invalid_type", "examples must be an array", `${pointer}/examples`));
    else out.examples = input.examples;
  }
  if (input.tags !== undefined) {
    if (!Array.isArray(input.tags) || input.tags.some((t) => typeof t !== "string")) {
      issues.push(issue("invalid_type", "tags must be an array of strings", `${pointer}/tags`));
    } else out.tags = input.tags;
  }
  return out;
}

function parseScalarConstraints(
  input: unknown,
  pointer: string,
  issues: ParseIssue[],
): ScalarConstraints | undefined {
  if (!isPlainObject(input)) {
    issues.push(issue("invalid_type", "scalar must be an object", pointer));
    return undefined;
  }

  if (typeof input.type !== "string") {
    issues.push(issue("missing_property", "scalar.type is required", `${pointer}/type`));
    return undefined;
  }

  const t = input.type;
  if (t === "string") {
    hasOnlyKeys(input, ["type", "pattern", "minLength", "maxLength", "enum"], pointer, issues);
    const out: Extract<ScalarConstraints, { type: "string" }> = { type: "string" };
    if (input.pattern !== undefined) {
      if (typeof input.pattern !== "string") issues.push(issue("invalid_type", "pattern must be a string", `${pointer}/pattern`));
      else out.pattern = input.pattern;
    }
    if (input.minLength !== undefined) {
      if (typeof input.minLength !== "number" || !Number.isInteger(input.minLength) || input.minLength < 0) {
        issues.push(issue("invalid_type", "minLength must be a non-negative integer", `${pointer}/minLength`));
      } else out.minLength = input.minLength;
    }
    if (input.maxLength !== undefined) {
      if (typeof input.maxLength !== "number" || !Number.isInteger(input.maxLength) || input.maxLength < 0) {
        issues.push(issue("invalid_type", "maxLength must be a non-negative integer", `${pointer}/maxLength`));
      } else out.maxLength = input.maxLength;
    }
    if (input.enum !== undefined) {
      if (!Array.isArray(input.enum) || input.enum.some((v) => typeof v !== "string") || input.enum.length < 1) {
        issues.push(issue("invalid_type", "enum must be a non-empty array of strings", `${pointer}/enum`));
      } else out.enum = input.enum;
    }
    return out;
  }

  if (t === "number") {
    hasOnlyKeys(input, ["type", "min", "max", "multipleOf"], pointer, issues);
    const out: Extract<ScalarConstraints, { type: "number" }> = { type: "number" };
    if (input.min !== undefined) {
      if (typeof input.min !== "number") issues.push(issue("invalid_type", "min must be a number", `${pointer}/min`));
      else out.min = input.min;
    }
    if (input.max !== undefined) {
      if (typeof input.max !== "number") issues.push(issue("invalid_type", "max must be a number", `${pointer}/max`));
      else out.max = input.max;
    }
    if (input.multipleOf !== undefined) {
      if (typeof input.multipleOf !== "number") issues.push(issue("invalid_type", "multipleOf must be a number", `${pointer}/multipleOf`));
      else out.multipleOf = input.multipleOf;
    }
    return out;
  }

  if (t === "boolean") {
    hasOnlyKeys(input, ["type", "enum"], pointer, issues);
    const out: Extract<ScalarConstraints, { type: "boolean" }> = { type: "boolean" };
    if (input.enum !== undefined) {
      if (!Array.isArray(input.enum) || input.enum.some((v) => typeof v !== "boolean") || input.enum.length < 1) {
        issues.push(issue("invalid_type", "enum must be a non-empty array of booleans", `${pointer}/enum`));
      } else out.enum = input.enum;
    }
    return out;
  }

  if (t === "null") {
    hasOnlyKeys(input, ["type"], pointer, issues);
    return { type: "null" };
  }

  issues.push(issue("invalid_value", `unsupported scalar.type '${t}'`, `${pointer}/type`));
  return undefined;
}

function parseReferenceFormat(
  input: unknown,
  pointer: string,
  issues: ParseIssue[],
): ReferenceFormat | undefined {
  if (input === undefined) return undefined;
  if (!isPlainObject(input)) {
    issues.push(issue("invalid_type", "format must be an object", pointer));
    return undefined;
  }
  hasOnlyKeys(input, ["pattern", "minLength", "maxLength", "enum"], pointer, issues);
  const out: ReferenceFormat = {};

  if (input.pattern !== undefined) {
    if (typeof input.pattern !== "string") issues.push(issue("invalid_type", "pattern must be a string", `${pointer}/pattern`));
    else out.pattern = input.pattern;
  }
  if (input.minLength !== undefined) {
    if (typeof input.minLength !== "number" || !Number.isInteger(input.minLength) || input.minLength < 0) {
      issues.push(issue("invalid_type", "minLength must be a non-negative integer", `${pointer}/minLength`));
    } else out.minLength = input.minLength;
  }
  if (input.maxLength !== undefined) {
    if (typeof input.maxLength !== "number" || !Number.isInteger(input.maxLength) || input.maxLength < 0) {
      issues.push(issue("invalid_type", "maxLength must be a non-negative integer", `${pointer}/maxLength`));
    } else out.maxLength = input.maxLength;
  }
  if (input.enum !== undefined) {
    if (!Array.isArray(input.enum) || input.enum.some((v) => typeof v !== "string") || input.enum.length < 1) {
      issues.push(issue("invalid_type", "enum must be a non-empty array of strings", `${pointer}/enum`));
    } else out.enum = input.enum;
  }
  return out;
}

function parseRelation(input: unknown, pointer: string, issues: ParseIssue[]): Relation | undefined {
  if (!isPlainObject(input)) {
    issues.push(issue("invalid_type", "relation must be an object", pointer));
    return undefined;
  }
  hasOnlyKeys(input, ["op", "left", "right", "label"], pointer, issues);

  const op = input.op;
  const left = input.left;
  const right = input.right;
  const label = input.label;

  if (typeof op !== "string") issues.push(issue("missing_property", "op is required", `${pointer}/op`));
  if (typeof left !== "string") issues.push(issue("missing_property", "left is required", `${pointer}/left`));
  if (typeof right !== "string") issues.push(issue("missing_property", "right is required", `${pointer}/right`));
  if (typeof label !== "string") issues.push(issue("missing_property", "label is required", `${pointer}/label`));

  if (typeof op !== "string" || typeof left !== "string" || typeof right !== "string" || typeof label !== "string") {
    return undefined;
  }
  if (!["eq", "neq", "gt", "lt", "gte", "lte"].includes(op)) {
    issues.push(issue("invalid_value", `invalid relation op '${op}'`, `${pointer}/op`));
  }
  if (!FIELD_NAME_RE.test(left)) issues.push(issue("pattern_mismatch", "left must be a FieldName", `${pointer}/left`));
  if (!FIELD_NAME_RE.test(right)) issues.push(issue("pattern_mismatch", "right must be a FieldName", `${pointer}/right`));

  return { op: op as Relation["op"], left, right, label };
}

function parseNode(input: unknown, pointer: string, issues: ParseIssue[]): Node | undefined {
  if (!isPlainObject(input)) {
    issues.push(issue("invalid_type", "node must be an object", pointer));
    return undefined;
  }
  if (typeof input.kind !== "string") {
    issues.push(issue("missing_property", "kind is required", `${pointer}/kind`));
    return undefined;
  }

  const kind = input.kind;
  if (kind === "Scalar") {
    hasOnlyKeys(input, ["id", "meta", "kind", "required", "scalar"], pointer, issues);
    if (input.id !== undefined && (typeof input.id !== "string" || !NODE_ID_RE.test(input.id))) {
      issues.push(issue("pattern_mismatch", "id must be a NodeId", `${pointer}/id`));
    }
    if (input.required !== undefined && typeof input.required !== "boolean") {
      issues.push(issue("invalid_type", "required must be a boolean", `${pointer}/required`));
    }
    const meta = parseMetaObject(input.meta, `${pointer}/meta`, issues);
    const scalar = parseScalarConstraints(input.scalar, `${pointer}/scalar`, issues);
    if (!scalar) return undefined;
    return {
      kind: "Scalar",
      id: typeof input.id === "string" ? input.id : undefined,
      meta,
      required: typeof input.required === "boolean" ? input.required : undefined,
      scalar,
    };
  }

  if (kind === "Reference") {
    hasOnlyKeys(input, ["id", "meta", "kind", "target", "required", "format"], pointer, issues);
    if (input.id !== undefined && (typeof input.id !== "string" || !NODE_ID_RE.test(input.id))) {
      issues.push(issue("pattern_mismatch", "id must be a NodeId", `${pointer}/id`));
    }
    const meta = parseMetaObject(input.meta, `${pointer}/meta`, issues);
    if (typeof input.target !== "string" || input.target.length < 1) {
      issues.push(issue("missing_property", "target is required", `${pointer}/target`));
    }
    if (input.required !== undefined && typeof input.required !== "boolean") {
      issues.push(issue("invalid_type", "required must be a boolean", `${pointer}/required`));
    }
    const format = parseReferenceFormat(input.format, `${pointer}/format`, issues);
    return {
      kind: "Reference",
      id: typeof input.id === "string" ? input.id : undefined,
      meta,
      target: typeof input.target === "string" ? input.target : "",
      required: typeof input.required === "boolean" ? input.required : undefined,
      format,
    };
  }

  if (kind === "Struct") {
    hasOnlyKeys(input, ["id", "meta", "kind", "fields", "required", "relations"], pointer, issues);
    if (input.id !== undefined && (typeof input.id !== "string" || !NODE_ID_RE.test(input.id))) {
      issues.push(issue("pattern_mismatch", "id must be a NodeId", `${pointer}/id`));
    }
    const meta = parseMetaObject(input.meta, `${pointer}/meta`, issues);
    if (!isPlainObject(input.fields)) {
      issues.push(issue("missing_property", "fields is required", `${pointer}/fields`));
      return undefined;
    }
    const fieldsObj = input.fields as Record<string, unknown>;
    if (Object.keys(fieldsObj).length < 1) {
      issues.push(issue("invalid_value", "fields must have at least one property", `${pointer}/fields`));
    }

    const fields: Record<string, Node> = {};
    for (const [k, v] of Object.entries(fieldsObj)) {
      if (!FIELD_NAME_RE.test(k)) {
        issues.push(issue("pattern_mismatch", `invalid field name '${k}'`, `${pointer}/fields/${k}`));
        continue;
      }
      const child = parseNode(v, `${pointer}/fields/${k}`, issues);
      if (child) fields[k] = child;
    }

    let required: string[] | undefined;
    if (input.required !== undefined) {
      if (!Array.isArray(input.required) || input.required.some((n) => typeof n !== "string")) {
        issues.push(issue("invalid_type", "required must be an array of FieldName", `${pointer}/required`));
      } else {
        for (let i = 0; i < input.required.length; i += 1) {
          if (!FIELD_NAME_RE.test(input.required[i] as string)) {
            issues.push(issue("pattern_mismatch", "required must contain FieldName values", `${pointer}/required/${i}`));
          }
        }
        required = input.required as string[];
      }
    }

    let relations: Relation[] | undefined;
    if (input.relations !== undefined) {
      if (!Array.isArray(input.relations)) {
        issues.push(issue("invalid_type", "relations must be an array", `${pointer}/relations`));
      } else {
        relations = [];
        for (let i = 0; i < input.relations.length; i += 1) {
          const rel = parseRelation(input.relations[i], `${pointer}/relations/${i}`, issues);
          if (rel) relations.push(rel);
        }
      }
    }

    return {
      kind: "Struct",
      id: typeof input.id === "string" ? input.id : undefined,
      meta,
      fields,
      required,
      relations,
    };
  }

  if (kind === "Union") {
    hasOnlyKeys(input, ["id", "meta", "kind", "discriminator", "variants", "default"], pointer, issues);
    if (input.id !== undefined && (typeof input.id !== "string" || !NODE_ID_RE.test(input.id))) {
      issues.push(issue("pattern_mismatch", "id must be a NodeId", `${pointer}/id`));
    }
    const meta = parseMetaObject(input.meta, `${pointer}/meta`, issues);
    if (typeof input.discriminator !== "string" || !FIELD_NAME_RE.test(input.discriminator)) {
      issues.push(issue("missing_property", "discriminator is required and must be a FieldName", `${pointer}/discriminator`));
    }
    if (!isPlainObject(input.variants)) {
      issues.push(issue("missing_property", "variants is required", `${pointer}/variants`));
      return undefined;
    }
    const variantsObj = input.variants as Record<string, unknown>;
    if (Object.keys(variantsObj).length < 1) {
      issues.push(issue("invalid_value", "variants must have at least one property", `${pointer}/variants`));
    }

    const variants: Record<string, Node> = {};
    for (const [k, v] of Object.entries(variantsObj)) {
      if (!VARIANT_KEY_RE.test(k)) {
        issues.push(issue("pattern_mismatch", `invalid variant key '${k}'`, `${pointer}/variants/${k}`));
        continue;
      }
      const child = parseNode(v, `${pointer}/variants/${k}`, issues);
      if (child) variants[k] = child;
    }

    let defaultKey: string | undefined;
    if (input.default !== undefined) {
      if (typeof input.default !== "string" || !VARIANT_KEY_RE.test(input.default)) {
        issues.push(issue("pattern_mismatch", "default must be a VariantKey", `${pointer}/default`));
      } else defaultKey = input.default;
    }

    return {
      kind: "Union",
      id: typeof input.id === "string" ? input.id : undefined,
      meta,
      discriminator: typeof input.discriminator === "string" ? input.discriminator : "",
      variants,
      default: defaultKey,
    };
  }

  if (kind === "List") {
    hasOnlyKeys(input, ["id", "meta", "kind", "item", "minItems", "maxItems", "uniqueItems"], pointer, issues);
    if (input.id !== undefined && (typeof input.id !== "string" || !NODE_ID_RE.test(input.id))) {
      issues.push(issue("pattern_mismatch", "id must be a NodeId", `${pointer}/id`));
    }
    const meta = parseMetaObject(input.meta, `${pointer}/meta`, issues);
    const item = parseNode(input.item, `${pointer}/item`, issues);
    if (!item) return undefined;

    if (input.maxItems === undefined) {
      issues.push(issue("missing_property", "maxItems is required", `${pointer}/maxItems`));
    }
    if (input.maxItems !== undefined && (typeof input.maxItems !== "number" || !Number.isInteger(input.maxItems) || input.maxItems < 0)) {
      issues.push(issue("invalid_type", "maxItems must be a non-negative integer", `${pointer}/maxItems`));
    }
    if (input.minItems !== undefined && (typeof input.minItems !== "number" || !Number.isInteger(input.minItems) || input.minItems < 0)) {
      issues.push(issue("invalid_type", "minItems must be a non-negative integer", `${pointer}/minItems`));
    }
    if (input.uniqueItems !== undefined && typeof input.uniqueItems !== "boolean") {
      issues.push(issue("invalid_type", "uniqueItems must be a boolean", `${pointer}/uniqueItems`));
    }

    return {
      kind: "List",
      id: typeof input.id === "string" ? input.id : undefined,
      meta,
      item,
      minItems:
        typeof input.minItems === "number" && Number.isInteger(input.minItems) ? input.minItems : undefined,
      maxItems:
        typeof input.maxItems === "number" && Number.isInteger(input.maxItems) ? input.maxItems : 0,
      uniqueItems: typeof input.uniqueItems === "boolean" ? input.uniqueItems : undefined,
    };
  }

  issues.push(issue("invalid_value", `unknown node kind '${kind}'`, `${pointer}/kind`));
  return undefined;
}

export function parseProjection(input: unknown): Result<ProjectionDefinition, ParseIssue[]> {
  const issues: ParseIssue[] = [];

  if (!isPlainObject(input)) {
    return err([issue("invalid_type", "projection must be an object", "/")]);
  }

  hasOnlyKeys(input, ["version", "root", "meta"], "/", issues);

  if (typeof input.version !== "string") {
    issues.push(issue("missing_property", "version is required", "/version"));
  } else if (!VERSION_RE.test(input.version)) {
    issues.push(issue("pattern_mismatch", "version must match x.y.z", "/version"));
  }

  const meta = parseMetaObject(input.meta, "/meta", issues);
  const root = parseNode(input.root, "/root", issues);
  if (!root) {
    return err(issues.length > 0 ? issues : [issue("missing_property", "root is required", "/root")]);
  }

  const projection: ProjectionDefinition = {
    version: typeof input.version === "string" ? input.version : "0.0.0",
    root,
    meta,
  };

  const staticIssues = runStaticChecks(projection);
  issues.push(...staticIssues);

  if (issues.length > 0) return err(issues);
  return ok(projection);
}
