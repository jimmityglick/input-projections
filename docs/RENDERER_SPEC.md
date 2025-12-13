# Reference Renderer Specification: The Vanilla Inspector

**Version:** 1.2.0
**Status:** Planned (Normative)
**Scope:** Visualization Layer (The “Water”)

---

## 1. Goal and Philosophy

The Reference Renderer is the canonical, dependency-free user interface for the Input Projection Engine.

* The **Engine** is the physics layer. It computes state, validity, and cursor.
* The **Renderer** is the graphics layer. It visualizes that state exactly and translates user interaction into Engine actions.

The Renderer has **no authority** over correctness. It reflects Engine truth.

---

## 2. Core Principles

1. **Zero Magic**
   Use standard DOM APIs only (`document.createElement`, `appendChild`, `addEventListener`).
   No frameworks, no virtual DOM, no diffing libraries.

2. **Visual Truth**
   The DOM must be an exact projection of the Engine State (S_t).

   * Nodes judged `Inactive` **MUST NOT** render.
   * Validity classes and error messages must match Engine judgments exactly.

3. **Determinism**
   Given the same Engine State, the Renderer produces the same DOM structure and behavior.

4. **Immediate Feedback**
   All interactions dispatch per-keystroke or per-event. Validation feedback appears immediately.

5. **Developer-First**
   A built-in Heads Up Display (HUD) shows live Engine state for inspection and debugging.

---

## 3. Renderer Contract

```ts
render(engine: Engine, container: HTMLElement): void
```

* `engine.getState()` is treated as immutable input.
* `render()` synchronizes the DOM to match the current state.
* The Renderer does not retain its own application state beyond DOM identity caches.

---

## 4. The Render Loop (Normative)

1. User interacts with the DOM.
2. Event handler derives the **current ValuePath** and dispatches an `Action` to the Engine.
3. Engine computes a new immutable State (S_{t+1}).
4. `render(engine)` is invoked.
5. Renderer synchronizes the DOM to exactly match (S_{t+1}).

The Renderer never mutates the DOM in response to events directly. All DOM changes flow from Engine state.

---

## 5. Identity Strategy

### 5.1 Stable Keying (Normative)

To preserve focus and avoid DOM thrashing, elements must preserve object identity.

* **Primary Key:** Projection Path String
  Example:

  ```
  /fields/contact/variants/email/fields/address
  ```

* **List Item Exception:**
  List items are keyed by **index-based Projection Path**:

  ```
  /fields/items/items/0
  ```

  If item `0` is removed, the DOM element for index `0` is reused to display the data from index `1`.
  This is explicitly acceptable in v1.

### 5.2 DOM Cache

* Maintain a persistent `Map<string, HTMLElement>` keyed by Projection Path String.
* Cache entries may grow monotonically in v1. Eviction is not required.

---

## 6. The Re-Binding Rule (Critical)

Whenever a DOM element is retrieved from the cache:

1. **Re-attach** it to the correct parent.
2. **Re-bind all event handlers.**

   * Event handlers MUST NOT capture `ValuePath` in closures.
   * Handlers MUST read the current `ValuePath` from element `dataset` at event time.
3. **Refresh attributes**:

   * `class` (judgment classes)
   * `disabled`
   * `dataset.projectionPath`
   * `dataset.valuePath`

This rule is mandatory to avoid stale paths after normalization (e.g., list reindexing).

---

## 7. Component Mapping

### 7.1 Styling

* **CSS:** Pico.css (classless, semantic)
* **State Classes:**

  * `.node`
  * `.judgment-invalid`
  * `.judgment-incomplete`
  * `.judgment-valid` (optional)

---

### 7.2 Scalar Rendering (Normative)

| Scalar Type | Constraints | HTML Control                    | Empty / Clear Behavior                      |
| ----------- | ----------- | ------------------------------- | ------------------------------------------- |
| String      | enum        | `<select>`                      | Blank option dispatches `Unset`             |
| String      | no enum     | `<input type="text">`           | Empty string is a valid value               |
| Number      | enum        | `<select>`                      | Blank option dispatches `Unset`             |
| Number      | no enum     | `<input type="number">`         | Empty input dispatches `Unset`              |
| Boolean     | any         | `<input type="checkbox">`       | Checked = true, unchecked = false           |
| Null        | any         | `<input disabled>`              | Shows `null` when set and `(unset)` when missing; “Set null” dispatches `SetScalar(null)`; Clear (“X”) dispatches `Unset` |

#### Explicit Unset

All scalar renderers **except checkbox** MUST provide a Clear (“X”) control that dispatches `Unset`.

Notes:

* “Required” means “missing is an error” (judgment becomes `Incomplete` with `missing_required`).
* Clear (“X”) always dispatches `Unset` (even for required nodes). Whether that produces an issue depends on whether the node is required in its current context.
* Some nodes are conditionally required based on Union selection; requiredness is evaluated over the active subtree.

---

### 7.3 Missing vs Null Policy (Normative)

* **Missing (`undefined`)** and **null** are distinct.
* Empty string ≠ missing.
* Checkbox has no missing state in v1.
* Null scalars MUST support both `Unset` and `SetScalar(null)` via UI; whether `Unset` yields an issue depends on requiredness in the current active subtree.

---

### 7.4 Containers

| Primitive | Representation                            |
| --------- | ----------------------------------------- |
| Struct    | `<fieldset>` with `<legend>`              |
| Union     | `<div>` with `<select>` discriminator     |
| List      | `<div>` container with Add/Remove buttons |
| List Item | `<div>` wrapper                           |

---

## 8. Error Rendering

* **Scalar / Reference:** `<small>` immediately after input.
* **Struct Relations:** Inside `<fieldset>`, immediately after `<legend>`.
* **List Constraints:** Inside list container, above items.

Error matching rules:

* Match **exact Projection Path only**.
* No prefix or descendant matching.

---

## 9. Interaction Model

### 9.1 Dispatch Rules

* Renderer derives **ValuePath dynamically** during traversal.
* Actions always use the **latest ValuePath from DOM dataset**, never from closure state.

### 9.2 Focus Synchronization (Bi-Directional)

#### DOM → Engine

* `focus` event dispatches `MoveCursor(projectionPath)`.

#### Engine → DOM

After render:

1. Read `state.cursor.projectionPath`.
2. Find corresponding DOM element.
3. If not focusable, focus its **first actionable descendant**.
4. Focus only if:

   ```
   document.activeElement !== target
   ```

This prevents focus loops.

---

## 10. Structural Mutation

### 10.1 Unions

* Changing discriminator dispatches `SelectVariant`.
* In v1, the **active** (selected) variant’s payload at `.../data` is required; inactive variants are ignored. Missing active payload produces `missing_required`.
* Renderer does not manage data pruning.
* Renderer MAY initialize `data` when a selected variant has a single canonical value (for example, a `null` scalar).
* New branch renders on next frame.

### 10.2 Lists

* Disable Add if `length >= maxItems`.
* Disable Remove if `length <= minItems` (default 0).

After list mutation:

* Values are rendered first.
* Focus synchronization runs afterward to avoid stale focus.

---

## 11. HUD (Inspector Panel)

* **Location:** `#app-debug`
* **Update Policy:** Throttled (`requestAnimationFrame` or ~100ms debounce).
* **Displayed State:**

  ```json
  {
    "cursor": "/items/0/qty",
    "validity": "Invalid",
    "errors": ["Qty must be > 0"],
    "value": { ... }
  }
  ```

HUD updates must never block form interaction.

---

## 12. Implementation Phases

### Phase 1: Scaffolding

* Vite setup
* DOM cache
* Recursive `processNode`

### Phase 2: Primitives

* Scalar renderer per table

---

## 13. Local Development (Reference Implementation)

This repository includes a reference implementation of the Renderer under `renderer/`.

Commands:

1. Build the Engine (ESM output used by the browser renderer):
   - `npm run build:esm`

2. Start the renderer dev server:
   - `npm run renderer:dev`

Then open one of the test harness pages:

- `/` (dropdown to switch fixtures)
- `/purchase-order.html`
- `/password-confirmation.html`
- `/price-range-filter.html`
- `/edge-cases.html`
* Struct + relation error grouping (message at Struct + indicators on related fields)
* List with bounds logic

### Phase 3: Integration

* Engine wiring
* Focus synchronization
* Throttled HUD

---

## 13. Success Criteria

1. Typing never loses focus.
2. Cursor in HUD tracks keyboard navigation.
3. List removal reuses DOM without crashing or stale values.
4. Union switching immediately updates rendered subtree.
5. Renderer behavior is deterministic and mirrors Engine state exactly.
