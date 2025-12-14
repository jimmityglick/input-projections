import type { ProjectionDefinition } from "../dist/esm/index.js";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isRefFilename(ref: unknown): ref is string {
  if (typeof ref !== "string") return false;
  if (ref.length < 1) return false;
  // Restriction: referenced fixtures must be in the same directory as the including fixture.
  // Enforce this by only permitting bare filenames (no path separators).
  if (ref.includes("/") || ref.includes("\\")) return false;
  return true;
}

function deepCloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

type ResolveCtx = {
  loadProjection: (file: string) => Promise<ProjectionDefinition>;
  stack: string[];
};

async function resolveNode(node: unknown, ctx: ResolveCtx): Promise<unknown> {
  if (!isPlainObject(node)) return node;

  if (Object.prototype.hasOwnProperty.call(node, "$ref")) {
    const keys = Object.keys(node);
    if (keys.length !== 1) {
      throw new Error(`$ref include node must contain only '$ref' (got: ${keys.join(", ")})`);
    }
    const ref = (node as Record<string, unknown>).$ref;
    if (!isRefFilename(ref)) {
      throw new Error(`Invalid $ref '${String(ref)}' (must be a bare filename in the same directory)`);
    }
    if (ctx.stack.includes(ref)) {
      const cycle = [...ctx.stack, ref].join(" -> ");
      throw new Error(`$ref cycle detected: ${cycle}`);
    }

    ctx.stack.push(ref);
    const included = await ctx.loadProjection(ref);
    const resolvedIncluded = await resolveProjectionIncludes(included, ctx);
    ctx.stack.pop();

    return deepCloneJson(resolvedIncluded.root);
  }

  const kind = node.kind;
  if (typeof kind !== "string") return node;

  if (kind === "Struct") {
    const fields = (node as Record<string, unknown>).fields;
    if (!isPlainObject(fields)) return node;
    const nextFields: Record<string, unknown> = {};
    for (const [fieldName, child] of Object.entries(fields)) {
      nextFields[fieldName] = await resolveNode(child, ctx);
    }
    return { ...node, fields: nextFields };
  }

  if (kind === "Union") {
    const variants = (node as Record<string, unknown>).variants;
    if (!isPlainObject(variants)) return node;
    const nextVariants: Record<string, unknown> = {};
    for (const [variantKey, child] of Object.entries(variants)) {
      nextVariants[variantKey] = await resolveNode(child, ctx);
    }
    return { ...node, variants: nextVariants };
  }

  if (kind === "List") {
    const item = (node as Record<string, unknown>).item;
    return { ...node, item: await resolveNode(item, ctx) };
  }

  // Scalar / Reference or unknown: no nested nodes to resolve.
  return node;
}

export async function resolveProjectionIncludes(
  projection: ProjectionDefinition,
  ctx: { loadProjection: (file: string) => Promise<ProjectionDefinition>; stack?: string[] },
): Promise<ProjectionDefinition> {
  const stack = Array.isArray(ctx.stack) ? ctx.stack : [];
  return {
    ...projection,
    root: (await resolveNode(projection.root, { loadProjection: ctx.loadProjection, stack })) as ProjectionDefinition["root"],
  };
}

