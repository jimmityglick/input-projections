# VDOM Renderer Dev Plan (Snabbdom)

## Context

This repo currently ships a small browser renderer under `renderer/` that:

- Builds a desired DOM tree by walking the compiled projection (`processNode(...)` in `renderer/traverse.ts`).
- Reuses DOM elements via a cache keyed by `projectionPathString` (`getOrCreate(...)` in `renderer/cache.ts`).
- Patches children imperatively using `reconcileChildren(...)` (`renderer/utils.ts`).

That pattern is effectively a bespoke “mini VDOM”. It works, but it puts us on the hook for correctness and ergonomics around:

- stable identity/keying,
- incremental updates,
- focus/cursor behavior,
- input caret preservation,
- event handler management,
- and long-term maintainability as the renderer grows.

This plan creates a *new*, parallel renderer that uses Snabbdom for diff/patch, while keeping the existing renderer intact during migration.

## Goals

- Stop maintaining our own VDOM-ish reconciliation logic.
- Keep the current renderer behavior (UX + engine semantics) as the baseline.
- Add a new Snabbdom renderer behind a toggle so we can A/B test and migrate incrementally.
- Keep the engine, schemas, and fixtures unchanged.
- Preserve current debugging affordances (HUD in `#app-debug`, error rendering, cursor-driven focus).

## Non-goals (initially)

- Rewriting the engine, normalization, or judgment logic.
- Changing projection schemas or fixtures to “fit” the renderer.
- Introducing a full component framework (React/etc.).
- Solving large-table virtualization in the first iteration (we will measure and add it if needed).

## Constraints / Compatibility

- The Snabbdom renderer must implement the same `Renderer` interface used today (`renderer/types.ts`).
- It must work with Vite (`npm run renderer:dev` / `renderer:build`).
- It must respect cursor-driven focus semantics (today: `renderer/focus.ts`).
- It must keep the current data-path conventions so actions can be dispatched correctly:
  - `data-projection-path`
  - `data-value-path`

## High-level approach

1. Add Snabbdom as a dependency.
2. Implement `createRendererSnabbdom(dispatch)` alongside the existing `createRenderer(dispatch)`.
3. Add a runtime toggle (query param or localStorage) in `renderer/main.ts` to select the renderer.
4. Port view logic incrementally: Scalar/Reference → Struct → Union → List → Table view.
5. Keep the existing renderer as a fallback until feature parity is reached.

## Proposed file layout

Keep the current renderer code as-is. Add a new “vdom renderer” module subtree:

- `renderer/snabbdom/index.ts` — `createRendererSnabbdom(...)`
- `renderer/snabbdom/patch.ts` — Snabbdom init + patch loop + mount handling
- `renderer/snabbdom/view.ts` — `viewEngineState(state, ctx): VNode`
- `renderer/snabbdom/components/*` — node-specific views
  - `scalar.ts`, `reference.ts`, `struct.ts`, `union.ts`, `list.ts`, `table.ts`
- `renderer/snabbdom/focus.ts` — focus sync helpers (cursor → DOM)
- `renderer/snabbdom/errors.ts` — issue rendering helpers (sigma → VNodes)

If the directory name `snabbdom/` feels too specific, use `vdom/` and keep Snabbdom details inside.

## Core technical decisions

### 1) Patch target: never replace the outer container

Snabbdom patches *a root node*. The simplest safe pattern here:

- In `render(engine, container)`:
  - Ensure a stable inner mount element exists inside `container` (e.g., `<div data-role="vdom-root"></div>`).
  - Patch only that mount element.

This prevents accidental replacement of `#app` or other external references and keeps the surrounding demo layout stable.

### 2) RenderContext and dispatch

Keep a `RenderContext` concept (like today) but orient it around VDOM needs:

- `dispatch(action)` — identical behavior (engine is still the state machine).
- `projectionElByPath` map — `projectionPathString -> HTMLElement` captured via vnode hooks for focus sync.
- Optional: `handlers` object with stable event callbacks (to reduce per-node closures).

### 3) Event handling strategy

Start simple:

- Attach `on: { input, change, click, focusin }` handlers per control.
- Use `data-*` attributes to decode value/projection paths at event time.

Then, if performance warrants (tables):

- Switch hot paths to event delegation:
  - One `focusin` handler on the root that dispatches `MoveCursor`.
  - One `input` handler on the root for text-like inputs, using `event.target`.

Delegation reduces handler churn for large grids.

### 4) Input value + caret behavior

Risk: VDOM patching can reset caret/selection if `input.value` is assigned frequently.

Mitigations to choose from (in increasing complexity):

1. Only set `props.value` when it differs from DOM value (custom hook/module).
2. Track “currently editing” element by `valuePathString` and skip value updates while it has focus (unless external change).
3. Accept minor caret resets initially and validate with fixtures, then fix.

We should add a manual checklist step specifically for caret stability on string inputs.

### 5) Keying strategy for lists/tables

Correctness-first initial approach:

- Use stable keys where we have them (projection paths are stable; list rows are index-addressed).
- For table rows, prefer `key: String(index)` (or omit keys if Snabbdom’s default behavior is acceptable).

Note: engine value paths are index-based; row deletion necessarily shifts indices. Index-keying is consistent with that model, though it may cause more DOM churn after deletions. If we later want stable row identity, it likely needs a first-class concept (either in schema or in engine value).

## Migration milestones (phased)

### Phase 0 — Spike (1–2 sessions)

Deliverables:

- Add `snabbdom` dependency (and any modules we need).
- Create `createRendererSnabbdom(dispatch)` that renders a placeholder view and patches correctly.
- Add a toggle in `renderer/main.ts` (e.g., `?renderer=snabbdom`).

Acceptance:

- `npm run renderer:dev` shows the placeholder output.
- `npm run renderer:build` succeeds.
- Existing renderer mode still works.

### Phase 1 — Infrastructure parity

Deliverables:

- Implement `viewEngineState(state, ctx)` that:
  - walks the compiled projection and builds VNodes,
  - writes `data-projection-path` / `data-value-path` consistently,
  - integrates existing HUD updates (can stay imperative).
- Implement focus sync:
  - Capture wrapper elements per `projectionPathString` using Snabbdom hooks.
  - Re-implement `syncFocus(cursor, root)` behavior using the captured map.

Acceptance:

- Cursor navigation (`Prev`/`Next`) still focuses the expected control.
- Focus changes still dispatch `MoveCursor` (using `focusin` or per-control focus handlers).

### Phase 2 — Scalar + Reference nodes (non-table)

Deliverables:

- Port scalar node rendering:
  - string (enum + free text),
  - number (enum + numeric input),
  - boolean,
  - null.
- Port reference node rendering:
  - enum formats,
  - free text.
- Preserve “Unset” behaviors and clear buttons.
- Port error rendering (aria-describedby + aria-invalid).

Acceptance (manual, per fixture):

- `password-confirmation`, `price-range-filter`, `event-booking`, `fund-transfer` behave the same in both renderers.
- “Unset” vs empty-string semantics match current behavior.

### Phase 3 — Struct + Union nodes

Deliverables:

- Port `Struct` rendering, including field order + label/hint rendering.
- Port `Union`:
  - discriminator select,
  - variant content rendering,
  - default discriminator behavior.
- Preserve current label/path display and “related issue” label state.

Acceptance:

- Union variant switching dispatches `SelectVariant` and clears/sets data as today.
- Errors show/hide correctly when switching variants.

### Phase 4 — List nodes (non-table)

Deliverables:

- Port list rendering in “normal” mode (non-table):
  - add/remove controls,
  - min/max item behaviors,
  - cursor movement after add (focus first actionable child).

Acceptance:

- `empty-list` and `deep-nesting` render and are interactable.

### Phase 5 — Table view (grid renderer)

Deliverables:

- Port table eligibility logic (including current restrictions like “no relations” for struct rows).
- Port table rendering:
  - header columns,
  - row actions (remove),
  - scalar/reference cell renderers (including explicit `Unset` support),
  - error display inside cells.
- Validate performance for 10/100/500 row fixtures.

Acceptance:

- `grid-flat-rows` and `grid-row-union` look and behave the same as the current renderer.
- No obvious typing lag at 100 rows; 500 rows is usable (exact target to be measured).

### Phase 6 — Cleanup + decision point

Deliverables:

- Document how to toggle renderers.
- Add a short “known differences” section (if any).
- Decide whether to:
  - keep both renderers long-term (baseline vs vdom), or
  - deprecate/remove the old one after a stabilization period.

Acceptance:

- Snabbdom renderer reaches feature parity for all existing fixture pages.
- Team agrees on the default renderer mode.

## Validation checklist

Use existing commands and manual fixture pages:

- `npm test` (engine + schema suites) — ensure no regression from shared code changes.
- `npm run renderer:build` — ensure bundling works with Snabbdom.
- Manual fixture runs in dev server:
  - `purchase-order`
  - `password-confirmation`
  - `price-range-filter`
  - `event-booking`
  - `fund-transfer`
  - `job-application`
  - `grid-flat-rows` (10/100/500 seeds)
  - `grid-row-union`
  - `edge-cases`

Manual UX checks (high risk):

- Text input caret stability while typing.
- Cursor-driven focus after:
  - add list item,
  - remove list item,
  - switch union variant.
- “Unset” behavior distinct from empty-string in clearable text fields.

## Risks and mitigations

- **Caret/selection resets**: add custom “only-update-value-if-different” hook for inputs.
- **Performance in large tables**: prefer delegated events + consider windowing/virtualization if needed.
- **Memory leaks (DOM refs map)**: clear maps on `destroy()` and on unmount; avoid retaining detached elements.
- **Parity drift**: keep a shared manual checklist and compare old/new renderers fixture-by-fixture.

## Future enhancements (after parity)

- Virtualized table rendering for very large lists.
- Centralized event delegation for all controls.
- Optional per-node “component” abstractions to reduce duplication (e.g., shared text-like control view).
- Add minimal headless DOM tests (optional) for regression-prone behaviors (unset/clear, focus sync).

