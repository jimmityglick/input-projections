# Development Plan: Reference Renderer (Vanilla Inspector)
## Visualization Layer for Input Projection Engine

**Goal:** Build a dependency-free, deterministic DOM renderer that visualizes Engine state exactly and translates user interaction into Engine actions.

**Source of truth:**
- `docs/RENDERER_SPEC.md` (Normative specification v1.2.0)
- `src/kinetic/engine.ts` (Engine API contract)

---

## 0) Non-Negotiables ("Water" Standard)

1. **Zero Dependencies (Runtime)**
   - Standard DOM APIs only (`document.createElement`, `appendChild`, `addEventListener`).
   - No frameworks, no virtual DOM, no diffing libraries.
   - Build tooling (Vite) is acceptable for development.

2. **Visual Truth**
   - DOM is an exact projection of Engine State (S_t).
   - `Inactive` nodes MUST NOT render.
   - Judgment classes and error messages match Engine exactly.

3. **Determinism**
   - Same Engine State → Same DOM structure and behavior.

4. **No Authority**
   - Renderer reflects Engine truth. It never computes validity or manages data.
   - All DOM changes flow from Engine state, never from direct event handling.

5. **Immediate Feedback**
   - Dispatch per-keystroke/per-event.
   - Validation feedback appears immediately.

---

## 1) Architecture Overview

### 1.1 Render Contract

```ts
interface Renderer {
  render(engine: Engine, container: HTMLElement): void;
  destroy(): void;
}
```

- `engine.getState()` is immutable input.
- `render()` synchronizes DOM to match current state.
- No application state beyond DOM identity caches.

### 1.2 Data Flow (Unidirectional)

```
User Event → Derive ValuePath from DOM → dispatch(Action) → Engine S_{t+1} → render() → DOM
```

The Renderer never mutates DOM directly in response to events.

### 1.3 Module Structure

```
renderer/
  index.ts           # Main entry, render() function
  cache.ts           # DOM element cache by Projection Path
  traverse.ts        # Recursive node processing
  scalars.ts         # Scalar type renderers
  containers.ts      # Struct, Union, List renderers
  errors.ts          # Error message rendering
  focus.ts           # Bi-directional focus synchronization
  hud.ts             # Debug inspector panel
  utils.ts           # DOM helpers, path serialization
  types.ts           # Renderer-specific types
```

---

## 2) Identity Strategy

### 2.1 Stable Keying (Critical for Focus Preservation)

**Primary Key:** Projection Path String

```
/fields/contact/variants/email/fields/address
```

**List Item Exception:** Index-based keying

```
/fields/items/items/0
/fields/items/items/1
```

If item `0` is removed, DOM element for index `0` is reused to display data from index `1`.

### 2.2 DOM Cache Implementation

```ts
type DOMCache = Map<string, HTMLElement>;

function getOrCreate(
  cache: DOMCache,
  projectionPath: string,
  factory: () => HTMLElement
): HTMLElement;
```

- Cache entries grow monotonically in v1.
- Eviction is not required.
- Cache is cleared on `destroy()`.

---

## 3) The Re-Binding Rule (Normative)

Whenever a DOM element is retrieved from cache:

1. **Re-attach** to correct parent (element may have moved).

2. **Re-bind all event handlers.**
   - Handlers MUST NOT capture `ValuePath` in closures.
   - Handlers MUST read current `ValuePath` from `element.dataset` at event time.

3. **Refresh attributes:**
   - `class` (judgment classes)
   - `disabled`
   - `dataset.projectionPath`
   - `dataset.valuePath`

This prevents stale paths after normalization (list reindexing, union switching).

### 3.1 Event Handler Pattern

```ts
// WRONG - captures stale path in closure
input.addEventListener('input', () => {
  engine.dispatch({ type: 'SetScalar', at: valuePath, value: input.value });
});

// CORRECT - reads path from DOM at event time
input.addEventListener('input', (e) => {
  const target = e.currentTarget as HTMLInputElement;
  const path = parseValuePath(target.dataset.valuePath!);
  engine.dispatch({ type: 'SetScalar', at: path, value: target.value });
});
```

---

## 4) Component Mapping

### 4.1 Styling

- **CSS Framework:** Pico.css (classless, semantic)
- **State Classes:**
  - `.node` (all rendered nodes)
  - `.judgment-invalid`
  - `.judgment-incomplete`
  - `.judgment-valid` (optional, for explicit valid styling)

### 4.2 Scalar Rendering Table

| Scalar Type | Constraints | HTML Control                    | Empty/Clear Behavior                        |
|-------------|-------------|---------------------------------|---------------------------------------------|
| String      | enum        | `<select>`                      | Blank option dispatches `Unset`             |
| String      | no enum     | `<input type="text">`           | Empty string is a valid value               |
| Number      | enum        | `<select>`                      | Blank option dispatches `Unset`             |
| Number      | no enum     | `<input type="number">`         | Empty input dispatches `Unset`              |
| Boolean     | any         | `<input type="checkbox">`       | Checked = true, unchecked = false           |
| Null        | any         | `<input disabled value="null">` | Clear button dispatches `Unset` if optional |

### 4.3 Explicit Unset Control

All scalar renderers **except checkbox** MUST provide a Clear ("X") button that dispatches `Unset`.

### 4.4 Missing vs Null Policy

- `undefined` (missing) and `null` are distinct.
- Empty string ≠ missing.
- Checkbox has no missing state in v1.
- Optional null scalars support both `Unset` and `SetScalar(null)` via UI.

### 4.5 Container Rendering

| Primitive | HTML Structure                            |
|-----------|-------------------------------------------|
| Struct    | `<fieldset>` with `<legend>`              |
| Union     | `<div>` with `<select>` for discriminator |
| List      | `<div>` container with Add/Remove buttons |
| List Item | `<div>` wrapper                           |
| Reference | Same as String scalar                     |

---

## 5) Error Rendering

### 5.1 Placement Rules

| Context          | Location                                    |
|------------------|---------------------------------------------|
| Scalar/Reference | `<small>` immediately after input           |
| Struct Relations | Inside `<fieldset>`, immediately after `<legend>` |
| List Constraints | Inside list container, above items          |

### 5.2 Matching Rules

- Match **exact Projection Path only**.
- No prefix or descendant matching.
- Filter `sigma.issues` by `projectionPathToString(issue.projectionPath)`.

---

## 6) Focus Synchronization (Bi-Directional)

### 6.1 DOM → Engine

On `focus` event:
```ts
element.addEventListener('focus', (e) => {
  const projPath = parseProjectionPath(element.dataset.projectionPath!);
  const valPath = parseValuePath(element.dataset.valuePath!);
  engine.dispatch({ type: 'MoveCursor', toProjectionPath: projPath, toValuePath: valPath });
});
```

### 6.2 Engine → DOM

After `render()`:
1. Read `state.cursor.projectionPath`.
2. Find corresponding DOM element via cache.
3. If element is not focusable, find its **first actionable descendant**.
4. Focus only if `document.activeElement !== target` (prevents focus loops).

### 6.3 Actionable Elements

Focusable elements that can receive cursor:
- `<input>` (text, number, checkbox)
- `<select>`
- `<button>` (Add/Remove for lists)

---

## 7) Structural Mutation Handling

### 7.1 Unions

- Changing discriminator `<select>` dispatches `SelectVariant`.
- Renderer does NOT manage data pruning (Engine handles this).
- New branch renders on next `render()` call.
- Previous branch DOM may remain in cache but is not attached to tree.

### 7.2 Lists

- **Add Button:** Disabled if `length >= maxItems`. Dispatches `ListAdd`.
- **Remove Button:** Disabled if `length <= minItems` (default 0). Dispatches `ListRemove`.

After list mutation:
1. Values are rendered first.
2. Focus synchronization runs afterward (avoids stale focus).

---

## 8) HUD (Inspector Panel)

### 8.1 Location

```html
<div id="app-debug">...</div>
```

### 8.2 Update Policy

- Throttled via `requestAnimationFrame` or ~100ms debounce.
- MUST NOT block form interaction.

### 8.3 Displayed State

```json
{
  "cursor": {
    "projectionPath": "/fields/items/items/0/fields/qty",
    "valuePath": "/items/0/qty"
  },
  "judgment": "Invalid",
  "issues": [
    { "code": "constraint_failed", "message": "value must be >= 1", "valuePath": "/items/0/qty" }
  ],
  "value": { "items": [{ "sku": "ABC", "qty": 0 }] }
}
```

### 8.4 Features

- Collapsible sections for Value, Issues, Cursor.
- Syntax highlighting for JSON (optional, CSS-based).
- Copy-to-clipboard button.

---

## Phase 1: Scaffolding

### 1.1 Deliverables

1. **Vite Project Setup**
   - `renderer/` directory alongside `src/`
   - Entry point: `renderer/index.html`
   - Import Engine from `../dist/index.js` (built output)

2. **DOM Cache Module**
   - `cache.ts`: `Map<string, HTMLElement>`
   - `getOrCreate()`, `clear()` functions

3. **Path Utilities**
   - `utils.ts`: Serialize/parse ProjectionPath and ValuePath to/from strings
   - Use existing `projectionPathToString()` and `valuePathToString()` from Engine

4. **Recursive Traversal Skeleton**
   ```ts
   function processNode(
     node: CompiledNode,
     value: EngineValue,
     projectionPath: ProjectionPath,
     valuePath: ValuePath,
     sigma: Sigma,
     parent: HTMLElement,
     ctx: RenderContext
   ): void;
   ```

5. **Main Render Function**
   ```ts
   function render(engine: Engine, container: HTMLElement): void {
     const state = engine.getState();
     processNode(state.projection.root, state.value, [], [], state.sigma, container, ctx);
     syncFocus(state.cursor, container);
   }
   ```

### 1.2 Acceptance Criteria

- Empty projection renders without errors.
- DOM cache correctly creates and retrieves elements.
- Path serialization round-trips correctly.

---

## Phase 2: Primitive Renderers

### 2.1 Scalar Renderers

Implement per scalar type:

```ts
function renderStringScalar(node, value, paths, sigma, parent, ctx): void;
function renderNumberScalar(node, value, paths, sigma, parent, ctx): void;
function renderBooleanScalar(node, value, paths, sigma, parent, ctx): void;
function renderNullScalar(node, value, paths, sigma, parent, ctx): void;
```

Each renderer:
- Creates/retrieves element from cache.
- Sets `dataset.projectionPath`, `dataset.valuePath`.
- Binds event handlers (reading path from dataset).
- Applies judgment classes.
- Renders Clear button (except checkbox).
- Renders errors via `errors.ts`.

### 2.2 Reference Renderer

- Same as String scalar with format constraints.
- Uses `renderStringScalar()` internally.

### 2.3 Struct Renderer

```ts
function renderStruct(node: CompiledStructNode, value, paths, sigma, parent, ctx): void;
```

- Creates `<fieldset>` with `<legend>` (from `meta.label` or field name).
- Renders relation errors after `<legend>`.
- Iterates `node.fieldOrder`, recursively calls `processNode()` for each field.

### 2.4 Union Renderer

```ts
function renderUnion(node: CompiledUnionNode, value, paths, sigma, parent, ctx): void;
```

- Creates `<div>` container.
- Renders `<select>` for discriminator with variant keys as options.
- Binds `change` event to dispatch `SelectVariant`.
- Determines selected variant from value or default.
- Recursively renders selected variant only (others are `Inactive`).

### 2.5 List Renderer

```ts
function renderList(node: CompiledListNode, value, paths, sigma, parent, ctx): void;
```

- Creates `<div>` container.
- Renders constraint errors (too short, too long, uniqueness).
- Renders Add button (disabled if at `maxItems`).
- Iterates array items, renders each in `<div>` wrapper with Remove button.
- Remove button disabled if at `minItems`.

### 2.6 Acceptance Criteria

- All five primitives render correctly.
- Judgment classes applied correctly.
- Errors appear in correct locations.
- Event handlers dispatch correct actions.

---

## Phase 3: Integration

### 3.1 Engine Wiring

- Import and instantiate Engine with test projection.
- Wire `render()` to be called after every `dispatch()`.
- Implement render loop:
  ```ts
  function dispatch(action: Action) {
    engine.dispatch(action);
    render(engine, container);
  }
  ```

### 3.2 Focus Synchronization

Implement bi-directional focus:

```ts
// focus.ts
function syncFocus(cursor: Cursor, container: HTMLElement): void;
function bindFocusHandlers(element: HTMLElement, dispatch: DispatchFn): void;
```

- `syncFocus()` called after every render.
- Focus only moves if `document.activeElement !== target`.

### 3.3 HUD Implementation

```ts
// hud.ts
function renderHUD(state: State, container: HTMLElement): void;
```

- Throttled updates (100ms or `requestAnimationFrame`).
- JSON display for cursor, judgment, issues, value.
- Collapsible sections.

### 3.4 Acceptance Criteria

- Typing never loses focus.
- Cursor in HUD tracks keyboard navigation (Tab, Shift+Tab).
- List removal reuses DOM without crashing or stale values.
- Union switching immediately updates rendered subtree.
- All behavior is deterministic.

---

## Phase 4: Polish & Testing

### 4.1 Keyboard Navigation

- Tab order follows canonical traversal.
- Arrow keys for list item navigation (optional).
- Enter on Add button adds item and focuses it.

### 4.2 Accessibility

- Proper `<label>` associations.
- `aria-invalid` for invalid fields.
- `aria-describedby` for error messages.

### 4.3 Visual Refinement

- Pico.css integration.
- Consistent spacing and alignment.
- Clear visual distinction for judgment states.

### 4.4 Test Fixtures

Create HTML test pages for:
- `purchase-order.json` (comprehensive: Struct, List, Union, Reference)
- `password-confirmation.json` (relations)
- `price-range-filter.json` (multiple relations)
- Edge cases: deep nesting, empty lists, all union variants

### 4.5 Acceptance Criteria

- All test fixtures render and interact correctly.
- Focus preservation verified manually.
- HUD accurately reflects state at all times.
- No console errors during normal operation.

---

## 9) File Structure (Final)

```
renderer/
  index.html         # Test harness
  main.ts            # Entry point, projection loading
  render.ts          # Main render() function
  cache.ts           # DOM element cache
  traverse.ts        # processNode() recursive dispatcher
  scalars.ts         # Scalar type renderers
  containers.ts      # Struct, Union, List renderers
  errors.ts          # Error rendering utilities
  focus.ts           # Focus synchronization
  hud.ts             # Debug inspector panel
  utils.ts           # Path parsing, DOM helpers
  types.ts           # Renderer-specific types
  styles.css         # Custom styles (supplement Pico.css)
```

---

## 10) Milestone Checklist

1. [ ] Phase 1 complete: Vite setup, cache, traversal skeleton, path utils
2. [ ] Phase 2 complete: All primitive renderers with events and errors
3. [ ] Phase 3 complete: Engine wiring, focus sync, HUD
4. [ ] Phase 4 complete: Polish, accessibility, test fixtures verified

---

## 11) Open Questions / Future Work

1. **List Item Keying:** Current spec uses index-based keying. Consider stable keys (e.g., generated IDs) for v2 to preserve identity across reordering.

2. **Undo/Redo:** Engine supports action history. Renderer could expose Undo/Redo buttons.

3. **Theming:** Pico.css supports dark mode. Consider toggle in HUD.

4. **Mobile:** Touch interactions, virtual keyboard handling.

5. **Performance:** For very large projections (100+ fields), consider virtualization or lazy rendering.
