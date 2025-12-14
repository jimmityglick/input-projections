const fs = require("fs");
const path = require("path");

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isRefFilename(ref) {
  if (typeof ref !== "string") return false;
  if (ref.length < 1) return false;
  // Restriction: includes must be in the same directory as the including file.
  // Enforce this by only permitting bare filenames (no path separators).
  if (ref.includes("/") || ref.includes("\\")) return false;
  return true;
}

function deepCloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function resolveNode(node, ctx) {
  if (!isPlainObject(node)) return node;

  if (Object.prototype.hasOwnProperty.call(node, "$ref")) {
    const keys = Object.keys(node);
    if (keys.length !== 1) {
      throw new Error(`$ref include node must contain only '$ref' (got: ${keys.join(", ")})`);
    }
    const ref = node.$ref;
    if (!isRefFilename(ref)) {
      throw new Error(`Invalid $ref '${String(ref)}' (must be a bare filename in the same directory)`);
    }

    const resolvedPath = path.resolve(ctx.baseDir, ref);
    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`$ref target not found: ${resolvedPath}`);
    }
    if (ctx.stack.includes(resolvedPath)) {
      const cycle = [...ctx.stack, resolvedPath].map((p) => path.basename(p)).join(" -> ");
      throw new Error(`$ref cycle detected: ${cycle}`);
    }

    const included = ctx.readProjection(resolvedPath);
    if (!isPlainObject(included) || !Object.prototype.hasOwnProperty.call(included, "root")) {
      throw new Error(`$ref target must be a projection object with 'root': ${resolvedPath}`);
    }

    ctx.stack.push(resolvedPath);
    const resolvedIncluded = resolveProjectionObject(included, {
      baseDir: path.dirname(resolvedPath),
      readProjection: ctx.readProjection,
      stack: ctx.stack,
    });
    ctx.stack.pop();

    return deepCloneJson(resolvedIncluded.root);
  }

  const kind = node.kind;
  if (typeof kind !== "string") return node;

  if (kind === "Struct") {
    const fields = node.fields;
    if (isPlainObject(fields)) {
      const nextFields = {};
      for (const [fieldName, child] of Object.entries(fields)) {
        nextFields[fieldName] = resolveNode(child, ctx);
      }
      return { ...node, fields: nextFields };
    }
    return node;
  }

  if (kind === "Union") {
    const variants = node.variants;
    if (isPlainObject(variants)) {
      const nextVariants = {};
      for (const [variantKey, child] of Object.entries(variants)) {
        nextVariants[variantKey] = resolveNode(child, ctx);
      }
      return { ...node, variants: nextVariants };
    }
    return node;
  }

  if (kind === "List") {
    return { ...node, item: resolveNode(node.item, ctx) };
  }

  // Scalar / Reference or unknown: no nested nodes to resolve.
  return node;
}

function resolveProjectionObject(projection, opts) {
  const baseDir = typeof opts.baseDir === "string" ? opts.baseDir : process.cwd();
  const readProjection = opts.readProjection;
  if (typeof readProjection !== "function") throw new Error("resolveProjectionObject: opts.readProjection is required");
  const stack = Array.isArray(opts.stack) ? opts.stack : [];

  if (!isPlainObject(projection)) return projection;
  if (!Object.prototype.hasOwnProperty.call(projection, "root")) return projection;
  return { ...projection, root: resolveNode(projection.root, { baseDir, readProjection, stack }) };
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function createCachedReader() {
  const cache = new Map();
  return (filePath) => {
    const abs = path.resolve(filePath);
    if (cache.has(abs)) return cache.get(abs);
    const parsed = readJson(abs);
    cache.set(abs, parsed);
    return parsed;
  };
}

function resolveProjectionFile(filePath) {
  const abs = path.resolve(filePath);
  const readProjection = createCachedReader();
  const rootProjection = readProjection(abs);
  return resolveProjectionObject(rootProjection, {
    baseDir: path.dirname(abs),
    readProjection,
    stack: [abs],
  });
}

module.exports = {
  resolveProjectionFile,
  resolveProjectionObject,
};

