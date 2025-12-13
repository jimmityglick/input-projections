/* eslint-disable no-console */
const fs = require("node:fs");
const path = require("node:path");

const ESM_ROOT = path.resolve(__dirname, "..", "dist", "esm");

function walk(dir, out) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
      continue;
    }
    if (!entry.isFile()) continue;
    if (!full.endsWith(".js")) continue;
    out.push(full);
  }
}

function needsJsExtension(spec) {
  if (!spec.startsWith("./") && !spec.startsWith("../")) return false;
  if (spec.endsWith(".js")) return false;
  if (spec.endsWith(".mjs")) return false;
  if (spec.endsWith(".cjs")) return false;
  if (spec.endsWith(".json")) return false;
  if (spec.endsWith(".node")) return false;
  if (spec.endsWith("/")) return false;
  // Preserve query/hash specifiers (Vite-style).
  if (spec.includes("?") || spec.includes("#")) return false;
  return true;
}

function rewriteSource(source) {
  // Handles:
  // - import ... from "./x"
  // - export ... from "./x"
  // - export * from "./x"
  // - import("./x")
  const patterns = [
    /\bfrom\s+(["'])(\.{1,2}\/[^"']+)\1/g,
    /\bimport\s*\(\s*(["'])(\.{1,2}\/[^"']+)\1\s*\)/g,
  ];

  let out = source;
  for (const re of patterns) {
    out = out.replace(re, (match, quote, spec) => {
      if (!needsJsExtension(spec)) return match;
      const next = `${spec}.js`;
      return match.replace(`${quote}${spec}${quote}`, `${quote}${next}${quote}`);
    });
  }
  return out;
}

function main() {
  if (!fs.existsSync(ESM_ROOT)) {
    console.error(`Missing ESM output dir: ${ESM_ROOT}`);
    process.exitCode = 1;
    return;
  }

  const files = [];
  walk(ESM_ROOT, files);

  let changed = 0;
  for (const file of files) {
    const before = fs.readFileSync(file, "utf8");
    const after = rewriteSource(before);
    if (after === before) continue;
    fs.writeFileSync(file, after, "utf8");
    changed += 1;
  }

  console.log(`rewrite_esm_imports: updated ${changed}/${files.length} files under ${path.relative(process.cwd(), ESM_ROOT)}`);
}

main();

