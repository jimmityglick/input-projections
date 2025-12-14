# Projection Preprocessing: Bundling and `$ref` Includes

The Input Projection JSON Schema and Engine operate on the **canonical projection form**: a single JSON document whose nodes are composed only of the five primitives:

- Scalar
- Struct
- Union
- List
- Reference

For authoring convenience, tooling in this repository supports a **source-format extension** that allows splitting a projection across multiple files and then **bundling** them into one canonical projection before validation and execution.

This document defines that preprocessing/bundling phase.

---

## 1. Canonical Form vs. Source Form

### Canonical Form

The canonical form is what:

- validates against `schemas/projection.latest.schema.json`
- can be passed directly to `createEngine(...)`
- contains **no** preprocessing directives

### Source Form

The source form is an authoring format that may contain `$ref` include directives inside the node tree.

Source form is **not** guaranteed to validate against the schema until it has been bundled.

---

## 2. `$ref` Include Directive (Source Extension)

Wherever a Node is expected, the source format may use an include object of the form:

```json
{ "$ref": "other-fixture.json" }
```

### Semantics

Bundling resolves the include by:

1. Loading the referenced JSON file
2. Reading its **top-level** `root` node
3. Replacing the `{ "$ref": ... }` object with a deep copy of that `root` node

The canonical output is identical to writing that referenced `root` node inline.

### Restrictions (Reference Tooling)

The reference tooling in this repository intentionally keeps resolution simple and deterministic:

- `$ref` MUST be a bare filename (no `/`, `\\`, `..`, or absolute paths)
  - This enforces “same directory” resolution for fixtures and test cases.
- Include objects MUST contain only the `$ref` key (no local overrides/merging in v1).
- JSON Pointer fragments are not supported in v1 (no `#/...`); `$ref` always inlines the referenced file’s top-level `root`.
- Includes may be nested; cycles are forbidden.

---

## 3. Bundling Phase (Deterministic)

Bundling is a pure, deterministic transformation:

```
source projection  ──bundle──▶  canonical projection
```

### Cycle Detection

If a projection (directly or indirectly) includes itself, bundling MUST fail with an error.

### Output Invariant

After bundling:

- the resulting projection contains **no** `$ref` nodes
- the result should validate against the standard schema

---

## 4. Where Bundling Happens in This Repository

Bundling is intentionally kept out of the Engine core so the Engine remains portable (browser/Node/other runtimes).

Current integration points:

- Node tooling: `tools/resolve_includes.js`
  - `resolveProjectionFile(filePath)` resolves a projection fixture on disk
  - `resolveProjectionObject(obj, { baseDir, readProjection })` resolves a projection object using an injected loader
- Schema validation: `tools/test_suite.js` resolves includes before validating with Ajv
- Engine fixture parsing test: `tests/engine.test.js` resolves fixtures before calling `createEngine(...)`
- Renderer dev harness: `renderer/main.ts` resolves includes before instantiating the Engine (browser-side)

---

## 5. Non-Goals (v1)

These are intentionally out of scope for the initial implementation:

- Cross-directory or remote imports
- JSON Pointer support (`#/...`)
- Partial-node “snippets” (files that are not full `{ version, root }` projections)
- Override/merge semantics at include sites

