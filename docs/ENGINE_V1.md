# Engine v1: Value Model & Runtime Representation

This document defines the **reference implementation** runtime value model used by the TypeScript engine in `src/`.

## Projection Loading and Bundling

The Engine core does not perform file I/O and does not resolve multi-file projection sources at runtime.

If your authoring format uses preprocessing directives (for example, `$ref` includes), resolve/bundle them into a single canonical projection **before** calling `createEngine(...)`. See `docs/PREPROCESSING.md`.

## Partial Values

During incremental interaction, values may be **partial**:

- Missing root value is represented by `undefined`.
- Missing Struct fields are represented by absence of a key (or `undefined` in internal memory).
- Missing List items may appear as `undefined` at a given index slot.

The engine treats `undefined` as “missing” and distinct from JSON `null` (which is a valid scalar).

## Union Representation (v1)

Union values are represented as objects containing:

- The discriminator field declared by the projection (`union.discriminator`)
- A `data` payload containing the selected variant value

Example:

```json
{
  "type": "Email",
  "data": "a@b.com"
}
```

Selection rules:

- If `type` is missing and a `default` exists, the default is selected.
- If `type` is missing and no default exists, the union is `Incomplete`.
- If `type` is present but invalid (not a string or not a known variant key), the union is `Invalid`.

On variant changes, the engine **clears** `data` to avoid retaining inactive-branch payloads.
