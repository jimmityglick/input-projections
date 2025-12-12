# Development Plan (v1 Reference Implementation)
## Input Projection Engine (Pure TypeScript, “Ice Standard”)

**Goal:** Build a deterministic, dependency-free (runtime) TypeScript engine that interprets an Input Projection and incrementally produces a **locally valid** output value by implementing the **Abstract Machine** described in `docs/SPEC.md` (and expanded in `docs/full_specification.md`).

**Source of truth read:**  
- `docs/SPEC.md` (Axioms, 5 Primitives, 4-State Judgment Lattice, actions, normalization, cursor authority)  
- `schemas/projection.latest.schema.json` → `schemas/projection.v2.schema.json` (exact JSON shape to consume)

---

## 0) Non-Negotiables (“Ice” Standard)

1. **Zero runtime dependencies**  
   - Engine runtime code uses only standard TypeScript/JavaScript (no Ajv, no lodash, etc.).  
   - Tooling and tests may use dev dependencies (this repo already uses Ajv for schema validation tooling).

2. **Immutability**  
   - `State` is immutable: every transition returns a new `State` reference.  
   - `Value` is immutable by convention: no in-place mutation; transitions use structural sharing (copy-on-write).

3. **Strict typing mirroring the schema**  
   - TS types mirror `schemas/projection.v2.schema.json` precisely.  
   - Node primitives are a discriminated union by `kind: 'Scalar' | 'Struct' | 'Union' | 'List' | 'Reference'`.

4. **Separation of concerns**  
   - **Static:** types, parsing, static checks, compilation of projection to efficient internal form.  
   - **Logic:** pure “judge” functions implementing the 4-state lattice and constraints.  
   - **Dynamic:** state machine/transducer, action handling, normalization, cursor policy.

5. **Determinism + Totality**  
   - Same projection + same action stream ⇒ same state stream.  
   - Cursor normalization is total (never points into Inactive/non-existent nodes).  
   - Constraint evaluation is pure and total (never throws; returns a safe boolean/judgment).

---

## 1) Canonical Concepts to Implement

### 1.1 The Five Primitives (per spec)
- **Scalar:** atomic JSON scalar (`string | number | boolean | null`) with type-specific constraints
- **Struct:** object of named child projections, optional `required[]`, optional `relations[]`
- **Union:** discriminated sum with `discriminator` (field name), `variants{}`, optional `default`
- **List:** bounded sequence with `item`, `maxItems` (required), optional `minItems`, optional `uniqueItems`
- **Reference:** atomic external pointer with `target` and optional `format` (format-only constraints)

### 1.2 Four-State Judgment Lattice
Every node yields exactly one:
- `Inactive` (pruned branch; ignored in aggregation)
- `Invalid` (malformed data or constraint violation)
- `Incomplete` (structurally OK but missing required descendants)
- `Valid` (complete and satisfied)

### 1.3 Aggregation Rule (normative)
For composite nodes (Struct, Union, List), over **active** children:
1. If any active child is `Invalid` ⇒ parent `Invalid`
2. Else if any required active child missing/`Incomplete` ⇒ parent `Incomplete`
3. Else ⇒ parent `Valid`
4. Inactive children are ignored

### 1.4 Struct Relations (“Struct Relations” / cross-field constraints)
Schema support (v2):
- `StructNode.relations[]` objects: `{ op, left, right, label }`
- Operators: `eq | neq | gt | lt | gte | lte`

Spec behavior requirement:
- Relations only evaluate when **both operands are present and individually Valid**
- Missing/Invalid operand ⇒ relation is **skipped**, not failed
- Relations are only between **sibling fields** of the same Struct

Because the JSON Schema cannot fully enforce these cross-field invariants, the engine must implement:
- Static checks: relation fields exist in `fields`, operators valid (already), no self-contradictory declarations (optional)
- Runtime evaluation: operand availability + comparability + operator semantics

---

## 2) Data Model Decisions (v1 Reference)

The spec defines the machine and cursor, but does not fully standardize an on-wire Value encoding for Unions. The reference implementation must choose one deterministically so that:
- selection is representable (discriminator can be “missing” and default applies), and
- branch payload can be stored for any variant primitive (Scalar/Struct/List/Reference/Union).

### 2.1 Value Model (JSON-compatible)
Define:
- `JsonScalar = string | number | boolean | null`
- `JsonValue = JsonScalar | JsonObject | JsonArray`
- `JsonObject = { [k: string]: JsonValue }`
- `JsonArray = JsonValue[]`

Allow “partial values” during interaction:
- Missing values are represented by **absence** of a key (Struct field), or `undefined` at the root / list item slot in memory.
- Engine API should treat missing as distinct from `null` (since `null` is a valid scalar type).

### 2.2 Union Runtime Representation (recommended v1)
Represent a Union value as a JSON object:
- discriminator field: `value[discriminator] = <variantKey>` (a string)
- payload field: `value["data"] = <payload for selected variant>`

Rationale:
- supports variant payload of any primitive without collisions
- keeps discriminator explicit for selection and output introspection
- provides a stable place (`data`) to map “the selected branch’s value-path”

This yields a consistent cursor mapping:
- Union node’s value-path `ν` points at the union object
- Selected variant node’s value-path points at `ν + ["data"]`
- Discriminator value-path points at `ν + [discriminator]`

Notes:
- This is a **reference implementation choice**; future specs could standardize an alternative representation.

### 2.3 Paths and Addressing
Implement two path types (per the spec cursor ⟨π, ν⟩):
- **ProjectionPath (`π`)**: structural address into the Projection tree  
  Segments: `{ type: 'Field', name } | { type: 'Variant', key } | { type: 'Item', index }`
- **ValuePath (`ν`)**: address into the Value object/array  
  Segments: `string | number` (object key or array index)

The engine must be able to:
- map a `ProjectionPath` to a canonical `ValuePath` (depends on Union representation)
- validate that a requested cursor path targets an existing, **active** node

---

## 3) Handling Recursion in TypeScript (Schema is Recursive)

The JSON Schema is recursive via `$defs/Node` referencing itself through:
- `StructNode.fields.*: Node`
- `UnionNode.variants.*: Node`
- `ListNode.item: Node`

### 3.1 Type-level strategy (safe, practical)
- Use standard recursive type aliases/interfaces (not conditional-type recursion):
  - `export type Node = ScalarNode | StructNode | UnionNode | ListNode | ReferenceNode`
  - `StructNode['fields']: Record<FieldName, Node>`
  - `UnionNode['variants']: Record<VariantKey, Node>`
- Avoid “deep mapped type” utilities that try to compute all possible paths at compile time; they tend to explode.

### 3.2 Runtime strategy (avoid call-stack risk)
Although projections are finite, deeply nested projections can still overflow recursive JS call stacks.
- Prefer iterative traversals with explicit stacks/queues for:
  - compilation (build parent/child indices)
  - enumeration (cursor canonical order)
  - judging (optional; judging may still be recursive if acceptable)

Target: correctness first; switch to iterative evaluation if stress tests require it.

---

## Phase 1: The Static Core (Types & Schema)
**Objective:** Precisely model the schema in TypeScript, provide safe parsing/validation (no Ajv at runtime), and compile a Projection into an efficient internal form for the machine.

### 1.1 Deliverables
1. **TypeScript types mirroring `projection.v2.schema.json`**
   - `ProjectionDefinition` (`{ version, root, meta? }`)
   - `MetaObject`, `ScalarConstraints`, `ReferenceFormat`, `Relation`
   - Node discriminated union: `ScalarNode | StructNode | UnionNode | ListNode | ReferenceNode`

2. **Runtime parser + static analysis (“schema + struct relations” enforcement)**
   - `parseProjection(input: unknown): Result<ProjectionDefinition, ParseIssue[]>`
   - No external dependencies; implement a minimal validator that checks:
     - object shapes, `additionalProperties: false` constraints for known objects
     - required properties present (`version`, `root`, etc.)
     - primitive-specific required fields (`Scalar.scalar`, `Struct.fields`, etc.)
     - regex patterns used in schema (field names, node ids, variant keys)

3. **“Struct Relations” and other cross-field checks (not expressible fully in schema)**
   Implement static checks returning `ParseIssue[]` (not thrown exceptions):
   - `Struct.required[]` must be a subset of `Object.keys(fields)`
   - `Struct.relations[].left/right` must reference existing keys in `fields`
   - `Union.default` (if present) must be a key in `variants`
   - `List.minItems <= maxItems` (schema does not guarantee this)
   - `ScalarConstraints` internal consistency (optional but recommended):
     - string: `minLength <= maxLength` if both present
     - number: `min <= max` if both present
     - number: `multipleOf > 0` already schema-enforced; still handle runtime robustly

4. **Compilation step**
   - `compileProjection(projection: ProjectionDefinition): CompiledProjection`
   - Precompute:
     - canonical child ordering (Struct field order as declared in JSON; Union variant order as declared; List by index)
     - parent pointers, node indexes, and fast lookup tables
     - required field sets for Struct
     - union discriminator + default information

### 1.2 Proposed module layout (Phase 1)
- `src/static/schema-types.ts` (types mirroring schema)
- `src/static/parse.ts` (runtime parsing + structural validation)
- `src/static/static-checks.ts` (cross-field checks: required subset, relations referential integrity, list bounds, union default validity)
- `src/static/compile.ts` (compile to internal indexing + canonical ordering)

### 1.3 Acceptance criteria (Phase 1)
- Can load and parse every valid projection in `tests/fixtures/*.json`.
- Can reject (with clear issues) the “invalid_” projections in `tests/cases/*.json`.
- Compilation produces stable canonical ordering and node indexing for traversal/cursor logic.

---

## Phase 2: The Logic Core (Primitives & Lattice)
**Objective:** Implement pure judgment functions for every primitive plus aggregation and constraint evaluation, producing a full `Σ` (judgments + errors + obligations) from `(projection, value)`.

### 2.1 Core types (Logic)
- `export type Judgment = 'Inactive' | 'Invalid' | 'Incomplete' | 'Valid'`
- `export type JudgmentReport = { judgment: Judgment; errors: Issue[]; }`
- `export type Sigma = { root: Judgment; byProjectionPath: Map<string, NodeSigma>; issues: Issue[] }`
  - `Issue` includes `severity`, `code`, `message`, and `valuePath`/`projectionPath`

### 2.2 Judge functions (pure)
Implement pure functions:
- `judgeNode(node, value, ctx) => NodeSigma`
- `judgeScalar(node, value) => NodeSigma`
- `judgeReference(node, value) => NodeSigma`
- `judgeStruct(node, value, ctx) => NodeSigma`
- `judgeUnion(node, value, ctx) => NodeSigma`
- `judgeList(node, value, ctx) => NodeSigma`

Where `ctx` carries:
- “active-ness” (if we’re inside an inactive union branch)
- projection/value path accumulation
- compiled helpers (required sets, canonical key order, etc.)

### 2.3 Primitive semantics (must match spec)
1. **Scalar**
   - Missing + `required: true` ⇒ `Incomplete`
   - Present but wrong type or constraint fail ⇒ `Invalid`
   - Present and satisfies constraints ⇒ `Valid`

2. **Reference**
   - Treat as “string key” value at runtime
   - `format` constraints: `pattern`, `minLength`, `maxLength`, `enum`
   - Missing + `required: true` ⇒ `Incomplete`

3. **Struct**
   - Value must be an object (if present); non-object ⇒ `Invalid`
   - Requiredness is defined by `required[]` (and/or child node `required: true` if present; decide one policy and document it)
   - Evaluate children first, aggregate judgment, then apply `relations[]`
   - **Relations evaluation policy (normative):**
     - Only evaluate when both operands are present AND their child judgments are `Valid`
     - Operand values must be comparable:
       - `eq/neq`: allow any JSON scalar (and optionally deep equality for arrays/objects if desired)
       - `gt/lt/gte/lte`: only compare `number` with `number` or `string` with `string` (lexicographic for strings; supports date strings)
     - If comparable and predicate fails ⇒ Struct becomes `Invalid` with the relation’s `label`

4. **Union**
   - Interpret union value as object `{ [discriminator]: string, data?: JsonValue }`
   - **Selection rules:**
     - If discriminator missing and `default` exists ⇒ select default
     - If discriminator missing and no default ⇒ `Incomplete`
     - If discriminator present but not a string or not a key in `variants` ⇒ `Invalid`
   - Selected variant is judged against `value.data`
   - Non-selected variants are `Inactive`

5. **List**
   - Value must be array (if present); non-array ⇒ `Invalid`
   - Enforce `maxItems` always; enforce `minItems` if present
   - If `uniqueItems: true`, define uniqueness:
     - v1 recommended: stable JSON stringify (own implementation) to compare items
   - Aggregate over item judgments:
     - Any `Invalid` item ⇒ List `Invalid`
     - Else if length < minItems or any item `Incomplete` ⇒ List `Incomplete`
     - Else `Valid`

### 2.4 Global invariants
- Inactive branches do not contribute errors to ancestors (but may be retained for debugging if desired).
- Judgment evaluation must never throw, even on malformed values.

### 2.5 Proposed module layout (Phase 2)
- `src/logic/judgment.ts` (Judgment enum + ordering helpers)
- `src/logic/constraints.ts` (scalar/reference constraints, regex compilation/cache)
- `src/logic/relations.ts` (struct relations evaluation)
- `src/logic/judge.ts` (main judge walker + per-primitive implementations)
- `src/logic/unique.ts` (stable stringify / deep-equality helper for `uniqueItems`)

### 2.6 Acceptance criteria (Phase 2)
- Given a projection + value, `judge()` returns a stable `Σ` with:
  - root judgment matching the spec’s aggregation rules
  - actionable, path-addressed issues (errors + incompleteness obligations)
- Unit tests cover:
  - Scalar constraints (pattern/min/max/enums)
  - Union selection edge cases (missing discriminator, invalid discriminator, default selection)
  - Struct relations (skipped when operands missing/invalid; enforced when both valid)
  - List bounds + uniqueItems

---

## Phase 3: The Kinetic Core (State Machine & Cursor)
**Objective:** Implement the deterministic transducer δ(State, Action) → State, with normalization (garbage collection of inactive branches) and cursor policy (canonical traversal, normalization, authority).

### 3.1 State representation (immutable)
Define:
- `State = { projection: CompiledProjection; value: JsonValue | undefined; cursor: Cursor; sigma: Sigma }`
- `Cursor = { projectionPath: ProjectionPath; valuePath: ValuePath }`

Add optional debugging hooks (non-normative):
- `lastAction?: Action`
- `history?: readonly State[]` (kept outside core, in adapter/wrapper, to avoid memory blowups)

### 3.2 Actions (closed alphabet)
Implement as discriminated union:
- `{ type: 'SetScalar'; at: ValuePath; value: JsonScalar | string /* reference */ }`
- `{ type: 'Unset'; at: ValuePath }`
- `{ type: 'SelectVariant'; at: ValuePath; variantKey: string }`
- `{ type: 'ListAdd'; at: ValuePath }`
- `{ type: 'ListRemove'; at: ValuePath; index: number }`
- `{ type: 'MoveCursor'; toProjectionPath?: ProjectionPath; toValuePath?: ValuePath }`

Notes:
- “SetScalar” covers Scalars and References; runtime validates compatibility against the projection node at the cursor/target.
- “SelectVariant” is sugar for setting discriminator (but also triggers normalization).

### 3.3 Transition pipeline (δ)
Implement `step(state, action)` as:
1. **Apply action** to produce candidate `V'` (pure, copy-on-write)
2. **Normalize** `V'` to enforce projection invariants:
   - remove data in Inactive branches (Union GC)
   - enforce list cardinality bounds (`maxItems`, `minItems` on removals)
   - optionally materialize union defaults by inserting discriminator when missing
3. **Recompute Σ** using Phase 2 logic: `sigma = judge(compiledProjection, V'')`
4. **Normalize cursor** (total, deterministic):
   - if cursor points to non-existent/inactive node: move to nearest existing ancestor, then first actionable descendant in canonical order
5. Return new `State`

### 3.4 Normalization details (must be explicit)
1. **Union GC**
   - If union selection changes, remove or reset `data` for previously-selected variant.
   - Ensure `data` value-path always corresponds to the currently selected variant.

2. **List operations**
   - `ListAdd`: if length == maxItems, no-op or return a controlled error result (choose and document).
   - `ListRemove`: if length == minItems, no-op or error.
   - When removing an item, indices shift; cursor normalization must handle that.

3. **Cursor authority**
   - `MoveCursor` requests are treated as a request; engine may reject/normalize.
   - Sequential “Next/Previous” navigation is derived from canonical traversal order.

### 3.5 Cursor traversal model
Implement canonical enumeration:
- Depth-first, left-to-right
- Struct: declared key order (object insertion order)
- Union: discriminator first (actionable), then selected variant subtree only
- List: items by ascending index
- Skip Inactive subtrees

Define “actionable nodes” for cursor:
- Scalar value node
- Reference value node
- Union discriminator (select variant)
- List container (add/remove)
(Struct/Union/List may be focusable for navigation but not directly settable.)

### 3.6 Proposed module layout (Phase 3)
- `src/kinetic/state.ts` (State/Cursor/Action types)
- `src/kinetic/value_ops.ts` (get/set/unset by ValuePath; copy-on-write helpers)
- `src/kinetic/normalize.ts` (GC + default materialization + list bounds enforcement)
- `src/kinetic/traverse.ts` (canonical traversal + “first actionable descendant”)
- `src/kinetic/step.ts` (δ implementation orchestrating apply/normalize/judge/cursor)

### 3.7 Acceptance criteria (Phase 3)
- `init(projection)` returns a deterministic initial state with:
  - well-defined cursor position (first actionable point)
  - computed Σ
- Applying actions updates value immutably and yields correct judgments:
  - changing union variant prunes inactive branch values
  - list add/remove respects bounds and cursor normalization
  - root becomes `Valid` iff value satisfies projection constraints

---

## 4) Testing Strategy (Data-Driven, Using `tests/cases`)

### 4.1 Reuse existing projection fixtures
This repo already has data-driven projection suites:
- `tests/cases/*.json` map `testName -> projection`
- `tests/fixtures/*.json` are standalone projections

Use these as inputs to engine tests:
- for each **valid** projection, ensure `parseProjection` + `compileProjection` succeeds
- for each **invalid_** projection, ensure parser returns issues (and/or schema tooling already rejects it)

### 4.2 Add engine behavior suites (new)
Add a new directory for engine runtime scenarios (recommended):
- `tests/engine/*.json`

Each engine scenario file contains:
- `projection`: inline projection or reference to a case name in `tests/cases`
- `initialValue` (optional)
- `steps`: list of actions
- `expect`: assertions after each step:
  - root judgment (`Inactive/Invalid/Incomplete/Valid`)
  - optionally cursor location
  - optionally emitted issues (by code + path)
  - optionally final `value` snapshot

### 4.3 Test runner choice (no extra dependencies)
Prefer Node’s built-in test runner:
- `node:test` + `node:assert/strict`

This keeps engine tests dependency-free and aligned with the “Ice” philosophy.

### 4.4 Coverage targets
- Scalar constraints: min/max, enums, patterns (including invalid regex handling)
- Struct required: missing required fields yields `Incomplete` (not `Invalid`)
- Struct relations: skipped on missing/invalid operands; enforced on valid operands
- Union:
  - missing discriminator: `Incomplete` unless default exists
  - default selection applied deterministically
  - invalid discriminator key ⇒ `Invalid`
  - GC on variant change
- List:
  - `maxItems` enforced
  - `minItems` enforced
  - `uniqueItems` enforced deterministically
- Cursor:
  - never points to inactive/non-existent node
  - normalization after union/list changes

---

## 5) Public API Sketch (Reference)

Keep the public surface minimal and stable:
- `createEngine(projection: unknown | ProjectionDefinition): Engine`
- `engine.getState(): State` (returns immutable state reference)
- `engine.dispatch(action: Action): State` (returns new state; engine may also store it)
- `engine.reset(initialValue?): State`

Optional convenience helpers (non-normative):
- `engine.next(): State`, `engine.prev(): State`
- `engine.set(value): State` (sets at current cursor if scalar/reference)
- `engine.select(variantKey): State` (at current cursor if union)

---

## 6) Milestone Checklist (Execution Order)

1. Phase 1 complete: typed projection + parser + static checks + compiler
2. Phase 2 complete: pure judgment engine + relations + uniqueItems
3. Phase 3 complete: transducer δ + normalization + cursor authority
4. Data-driven engine tests: JSON scenario runner + coverage for edge cases
5. Documentation polish:
   - `README` or `docs/` add “Engine v1 value model” (especially Union representation)

