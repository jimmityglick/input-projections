# Development Plan: Battle 1 (Grid Flat Rows) + Upgrade A (Table View) + Upgrade C (Deterministic Demo Generator)

This plan is the next “climb the mountain” step toward the **data grid from hell** stress test.

Reference docs / older plans:
- Engine v1 plan (archived): `docs/archive/DEV_PLAN.md`
- Reference renderer plan (archived): `docs/archive/RENDERER_DEV_PLAN.md`
- Renderer spec (normative): `docs/RENDERER_SPEC.md`
- Engine contract: `src/kinetic/engine.ts`

---

## Outcome (What “Done” Means)

1. **New fixture:** a “grid-shaped” projection (`List<Struct>`) that validates against `schemas/projection.latest.schema.json`.
2. **Renderer upgrade:** the reference renderer can render an eligible `List<Struct>` as an HTML `<table>` (columns + rows).
3. **Dev harness upgrade:** the renderer harness can load a **deterministically generated** initial value for known fixtures (especially the new grid fixture) so we can instantly test 10/100/500 row scenarios without clicking “Add” repeatedly.

---

## Scope (Explicit)

### In scope
- **Battle 1 fixture** (flat rows): list of row structs whose fields are Scalars/References only.
- **Upgrade A:** “table view” rendering for eligible lists.
- **Upgrade C:** deterministic generators for known fixtures, wired into the renderer dev UI as a “Seed demo value” (and “Seed N rows”) action.

### Out of scope (for this milestone)
- Filtering, column sorting, pagination, virtualization/windowing.
- Row expansion (“details panels”), nested forms per row, union-driven row shapes.
- Generic “projection-driven” data synthesis. Generators may be fixture-specific/hard-coded.

---

## Battle 1: Fixture — `grid-flat-rows.json`

### Deliverable
- Add `tests/fixtures/grid-flat-rows.json`
- Update renderer harness to include it:
  - `renderer/main.ts` fixture registry + dynamic import mapping
  - Optionally add a quick HTML page (e.g. `renderer/grid-flat-rows.html`) consistent with existing “quick pages”

### Projection Shape (Target)
Root is a `List` with `maxItems` large enough to feel “grid-like” (e.g. 200–1000).

- `root.kind = "List"`
- `root.item.kind = "Struct"`
- Row fields are **only**:
  - `Scalar` (string/number/boolean)
  - `Reference`

### Suggested Columns (Simple, High Coverage)
Use fields that exercise the renderer’s existing controls:
- `row_id`: Scalar string, required, pattern (stable primary key)
- `title`: Scalar string, required, min/max length
- `status`: Scalar string, enum (select)
- `amount`: Scalar number, min/max (number input)
- `active`: Scalar boolean (checkbox)
- `owner_id`: Reference with `format.pattern` and/or `minLength` (tests “lookup-ish” field without external data)

### Acceptance Criteria (Fixture)
- `npm run test:schema` passes (fixtures validate).
- `renderer:dev` can load the fixture.

---

## Upgrade A: Render Eligible `List<Struct>` as a `<table>`

### Goal
When a List item is a Struct and all of the Struct fields are Scalar/Reference, render as a table:
- Header row = field labels
- Body rows = list items
- Each cell = inline editor for that field (still dispatches to the Engine via ValuePath)

### Eligibility Rule (Strict for v1)
In `renderer/containers.ts` list rendering:
- If `node.item.kind !== "Struct"` → keep current “list of item cards” renderer.
- If `node.item.kind === "Struct"` but any field is not `Scalar` or `Reference` → keep current renderer.
- Otherwise → table view.

This keeps the change low-risk and makes “grid mode” predictable.

### DOM Structure (Proposed)
Use a dedicated wrapper element to allow styling without impacting existing list rendering:

- Outer: existing list wrapper (preserve list label, Add/Remove, errors)
- Content: `<table class="grid-table">`
  - `<thead><tr><th>…</th></tr></thead>`
  - `<tbody>` with one `<tr>` per list item index
  - `<td>` per column

### Identity / Cache Strategy
Preserve renderer invariants:
- Per `docs/RENDERER_SPEC.md`, **primary cache key remains ProjectionPath String**.
- List items are still keyed by index-based projection paths (acceptable in v1).

Cells should still use `processNode()` so the scalar/reference controls keep:
- correct `dataset.valuePath`
- correct `dataset.projectionPath`
- correct rebinding behavior after normalization

### Inline Cell Rendering (Recommendation)
The current scalar/reference renderer outputs a “card-ish” wrapper with label/path/hint.
In a table cell, that’s noisy and wastes space.

Implement a small “cell mode” to keep the UI usable:
- Add new renderer functions:
  - `renderScalarCell(...)`
  - `renderReferenceCell(...)`
- These render:
  - the `<input>`/`<select>` (and clear button where applicable)
  - the error `<small>` elements
  - but omit the header/path/hint block

Table view uses cell renderers; non-table view continues using the existing full renderers.

### Styling
Add CSS rules in `renderer/styles.css` for:
- `.grid-table` layout and spacing
- making inputs compact inside cells
- keeping errors readable but not massive (e.g. smaller font size inside table)
- sticky header (optional, nice-to-have even in v1)

### Acceptance Criteria (Renderer)
- With an empty value, the table renders with headers and 0 rows (plus list controls).
- “Add” adds a new row; editing any cell updates the Engine value and judgment.
- “Remove” removes the row and focus/cursor is normalized sensibly (no stale paths).
- No console errors during add/remove/edit cycles.

---

## Upgrade C: Deterministic Demo Value Generator (Known Fixtures)

### Goal
Stop manually building large values via UI interaction.

Add a deterministic generator that can produce a good initial value for a specific fixture.
This is a **dev harness feature** (not an engine feature): it should not change `src/` engine behavior.

### Design Principles
- **Deterministic:** same fixture key + same requested size ⇒ identical value.
- **Fixture-specific:** start with hard-coded generation per fixture key; don’t attempt a universal constraint solver.
- **Locally valid where practical:** generated values should satisfy required fields and obvious constraints (enum/pattern/min/max).
- **Scalable:** grid fixture must support N-row generation (10/100/500) without hand editing.

### Proposed Implementation
Add a module under `renderer/` (e.g. `renderer/demo_data.ts`) exporting:

- `type DemoSeedSpec = { kind: "default" } | { kind: "grid"; rows: number }`
- `function generateDemoValue(fixtureKey: string, spec?: DemoSeedSpec): EngineValue | null`

Implementation strategy:
- For the grid fixture, generate an array with `rows` entries, where each entry is a row object:
  - `row_id = "row_" + i.toString().padStart(4, "0")`
  - `status = ["new", "in_progress", "blocked", "done"][i % 4]`
  - `amount = (i * 10) % 1000` (or similar)
  - `active = i % 3 === 0`
  - `owner_id = "user_" + (i % 100).toString().padStart(3, "0")`
- For existing fixtures, generate a small valid “happy path” value (1–3 list items, default union selections, valid reference key format).

### Wiring Into The Renderer Harness
Update `renderer/main.ts`:
- Add a new button near “Reset value”:
  - `Seed demo value`
  - For the grid fixture, include quick options: `Seed 10 rows`, `Seed 100 rows`, `Seed 500 rows`
- Button behavior:
  1. compute `value = generateDemoValue(currentFixture, spec)`
  2. `engine.reset(value)`
  3. `renderer.render(engine, app)`

### Acceptance Criteria (Generator)
- Seeding `grid-flat-rows` with 100 rows produces a populated, mostly-valid grid immediately.
- Seeding is repeatable (reload page → seed 100 rows → same values).
- Seeding does not require any engine code changes.

---

## Validation Checklist (Per PR / Per Iteration)

Commands:
- `npm test` (schema + engine tests)
- `npm run renderer:dev` (manual interaction check)

Manual checks:
- Grid fixture loads and renders in table mode.
- Add/remove/edit operations keep cursor/focus stable enough to continue editing.
- Seed buttons work and are deterministic.

---

## Follow-Ups After Battle 1 (Not in Scope, But Unblocked)

Once Battle 1 is stable, the next logical steps toward the full grid stress test are:
1. **Row-union fixture** (Battle 2): conditional columns per row via `Union`.
2. **Row-details fixture** (Battle 3): nested Struct/List under each row.
3. **View transforms:** implement UI-only sort/filter over the visible row indices (do not mutate the engine list order).

