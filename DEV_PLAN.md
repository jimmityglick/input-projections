# Development Plan: Battle 2 — Grid Rows With Union (Conditional Columns Per Row)

This plan is the next incremental step toward the “data grid from hell” stress test.

Battle 1 is archived at:
- `docs/archive/DEV_PLAN-2.md`

Battle 2 (this plan):
- Add a **grid fixture** where each row contains a `Union` that changes the row’s “detail columns”.
- Upgrade the **table renderer** to support **conditional columns per row** driven by that union.
- Add **deterministic demo data** seeding for the new fixture so we can test at 10/100/500 rows quickly.

---

## Source Of Truth / Context (Read First)

### Specs + contracts
- Renderer spec (normative): `docs/RENDERER_SPEC.md`
- Engine contract & actions: `src/kinetic/engine.ts`

### Engine behavior relevant to this battle
- **Union value model (runtime):** a Union is represented as an object:
  - discriminator key: `value[discriminator] = <variantKey>`
  - payload key: `value.data = <payload for selected variant>`
- **Variant switching clears data:** normalization clears `data` when the selection changes.
  - See `src/kinetic/normalize.ts` (`shouldClearData` logic in `pruneUnionValue`)
- **Actions this plan will rely on:**
  - `SelectVariant` (preferred for changing union selection)
  - `SetScalar` and `Unset` for cell edits / clear
  - `ListAdd` and `ListRemove` for row add/remove
  - `MoveCursor` for focus sync

### Renderer constraints (v1)
- **Visual truth:** renderer reflects engine state; it does not compute validity.
- **Inactive nodes MUST NOT render.**
- **Re-binding rule:** event handlers must not capture stale paths; they must read `dataset.valuePath` at event time.
- **Identity:** cache keys are projection-path strings; list items may be index-keyed (acceptable in v1).

---

## Outcome (Definition of Done)

1. New fixture `tests/fixtures/grid-row-union.json` validates against `schemas/projection.latest.schema.json`.
2. Renderer harness can load it:
   - selectable in `renderer/main.ts`
   - quick page `renderer/grid-row-union.html` is available
3. Renderer can render this fixture in **table mode**, with:
   - base columns always visible
   - a per-row union discriminator column (editable)
   - variant-specific columns that are empty/inactive for non-selected variants
4. Deterministic seeding exists for `grid-row-union`:
   - “Seed demo: 10/100/500 rows” creates a mixed dataset (alternating variants)
5. Manual UX checks pass (no console errors; focus/cursor remains usable after add/remove and variant switching).

---

## Scope

### In scope
- Exactly **one** “row union” per row (keeps column model small and implementable).
- Union variants are **Structs containing only Scalar/Reference fields** (so we can reuse existing cell renderers).
- Table-mode column model that supports “variant columns” for a row union.
- Demo data generator for this new fixture.

### Out of scope
- Sorting/filtering/pagination/virtualization (Battle 4+).
- Row expansion panels / nested forms (Battle 3).
- Relations in the row struct or in the union’s variant structs (relation errors need a row-level surface).
- Union variants that are non-Struct primitives (Scalar/List/Union nested inside variants).

---

## 1) Fixture: `tests/fixtures/grid-row-union.json`

### Purpose
Exercise “conditional columns per row”:
- base columns are always present
- detail columns come from a Union selection per row

### Projection shape
Root:
- `kind: "List"`
- `maxItems: 500`
- `item.kind: "Struct"`

Row struct fields (suggested):
- Base fields (Scalar/Reference only):
  - `row_id` (Scalar string, required, pattern `^row_[0-9]{4}$`)
  - `title` (Scalar string, required)
  - `status` (Scalar string enum: `new | in_progress | blocked | done`)
  - `owner_id` (Reference target `User`, format pattern `^user_[0-9]{3}$`)
- Row union field:
  - `entity` (Union)
    - `discriminator: "type"`
    - `default: "person"`
    - variants:
      - `person`: Struct of scalar/ref fields only
      - `company`: Struct of scalar/ref fields only

Variant suggestions:
- `person`:
  - `first_name` (Scalar string, required, minLength 1)
  - `last_name` (Scalar string, required, minLength 1)
  - `email` (Scalar string, optional/required; simple email pattern is fine)
  - optional `customer_id` (Reference target `Customer`)
- `company`:
  - `company_name` (Scalar string, required)
  - optional `tax_id` (Scalar string, pattern)
  - optional `contact_email` (Scalar string, pattern)

### Fixture rules
- No `relations` anywhere in this fixture.
- JSON formatting: 2 spaces, no trailing commas.

### Wire into renderer harness
Update `renderer/main.ts`:
- Add fixture key `"grid-row-union"` with label `"grid: row union"`
- Add importer mapping for `../tests/fixtures/grid-row-union.json`
- Add to quick pages list

Add quick page:
- `renderer/grid-row-union.html` matching the pattern of `renderer/grid-flat-rows.html`

---

## 2) Deterministic Demo Data Seeding

### Where
- `renderer/demo_data.ts` (the deterministic demo generator used by `renderer/main.ts`)

### Requirement
Implement deterministic generation for fixture key `grid-row-union`:
- Supports row counts: 10, 100, 500
- Produces union runtime shape:
  - `entity: { type: "<variantKey>", data: { ... } }`

### Suggested deterministic pattern
For row index `i`:
- Base:
  - `row_id = "row_" + i.toString().padStart(4, "0")`
  - `title = titles[i % titles.length]`
  - `status = statuses[i % statuses.length]`
  - `owner_id = "user_" + (i % 100).toString().padStart(3, "0")`
- Variant selection:
  - `type = i % 2 === 0 ? "person" : "company"`
- Variant payload:
  - Person rows: `{ first_name, last_name, email }`
  - Company rows: `{ company_name, contact_email }`

Update `renderer/main.ts` seed UI:
- For this fixture, show `Seed demo: 10/100/500 rows` (same as flat grid).

---

## 3) Renderer Upgrade: Table View With Row-Union Columns

### Current behavior (Battle 1)
Table view only triggers when the row struct contains **only** Scalar/Reference fields.
Battle 2 introduces a Union field inside the row, so table view must be extended.

### 3.1 Eligibility rules (v1)
Implement a strict eligibility check for “row-union table mode”:

Eligible when:
- list item is a Struct
- row struct has:
  - any number of Scalar/Reference fields
  - exactly one Union field (v1 restriction)
- the union field:
  - has variants, and every variant is a Struct
  - variant struct fields are Scalar/Reference only
  - no `relations` in row struct or variant structs

If not eligible, fall back to existing list rendering (card/fieldset).

### 3.2 Column model (deterministic)
Build columns in a deterministic order:

1. Base columns: each row-level Scalar/Reference field in `fieldOrder` (excluding the union field)
2. Union discriminator column:
   - header text: `<unionFieldName>.<discriminator>` (e.g. `entity.type`)
3. Variant columns:
   - for each variant key in `variantOrder`
   - for each field in that variant struct’s `fieldOrder`
   - header text: `<variantKey>.<fieldName>` (e.g. `person.first_name`)

This intentionally makes the grid “wide” and exercises conditional inactivation.

### 3.3 Rendering behavior
Implement a dedicated renderer path, conceptually:
- `renderListAsUnionTable(...)` (or extend the existing table renderer with a “mode”)

Per row:
- Base fields:
  - reuse existing `renderScalarCell` / `renderReferenceCell`
- Union discriminator cell:
  - render a compact `<select>` of variant keys
  - `onchange` dispatches:
    - `{ type: "SelectVariant", at: <rowValuePath + [unionFieldName]>, variantKey: <selected> }`
  - focus/cursor dataset:
    - `dataset.projectionPath` should point to the union node projection path (row + Field unionFieldName)
    - `dataset.valuePath` should point to the discriminator value path (row + unionFieldName + discriminator)
  - show union-level errors under the select (issues live at the union projection path)
- Variant field cells:
  - for each column `(variantKey, fieldName)`:
    - projection path string should be:
      - `.../fields/<unionField>/variants/<variantKey>/fields/<fieldName>`
    - value path should be:
      - `rowValuePath + [unionFieldName, "data", fieldName]`
    - if sigma judgment is `Inactive`, render empty cell
    - else render scalar/reference cell

### 3.4 Focus / cursor safety
- No event handler captures a stale `ValuePath` in closure.
- All handlers parse `dataset.valuePath` at event time (same pattern as existing renderers).

---

## Validation

### Automated
Run:
- `npm run test:schema`
- `npm test`
- `npm run renderer:build`

### Manual (must-pass scenarios)
Run:
- `npm run renderer:dev`

Checks:
1. Load `grid-row-union` and seed 100 rows.
   - Person rows populate only person columns; company columns empty.
   - Company rows populate only company columns; person columns empty.
2. Switch a row’s `entity.type` person → company:
   - prior person payload clears (inactive columns empty)
   - company required fields become missing/incomplete until filled
3. Add/remove rows behaves correctly; focus remains usable.
4. No console errors.

---

## Deliverables Checklist

- `tests/fixtures/grid-row-union.json`
- `renderer/grid-row-union.html`
- `renderer/main.ts` updated (fixture + importer + seed buttons + quick page link)
- `renderer/demo_data.ts` updated (deterministic generator for `grid-row-union`)
- `renderer/containers.ts` updated (row-union table mode)
- `npm test` passes
