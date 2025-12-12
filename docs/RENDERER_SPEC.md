Here is the **Reference Renderer Specification (`RENDERER_SPEC.md`)**.

It formalizes the "Vanilla Inspector" architecture: a dependency-free, recursive DOM renderer that visualizes the Engine's state in real-time.

-----

# Reference Renderer Specification: The Vanilla Inspector

**Version:** 1.0.0
**Status:** Planned
**Scope:** Visualization Layer (The "Water")

-----

## 1\. Goal & Philosophy

The goal is to build the **Reference Implementation** of a User Interface for the Input Projection Engine.

Just as the Engine (`src/`) is the "Physics Engine" (calculating state, validity, and cursor), this Renderer is the "Graphics Engine" (visualizing that state).

### Core Principles

1.  **Zero Magic:** Use standard DOM APIs (`document.createElement`, `appendChild`). No Virtual DOM, no Reconciliation algorithms, no Frameworks.
2.  **Visual Truth:** The UI must be an exact visual representation of the Engine State ($S_t$). If the Engine says "Inactive," the UI must not render it.
3.  **Instant Feedback:** Validation errors and state changes appear immediately on interaction (per-keystroke dispatch).
4.  **Developer-First:** The UI will include a "Heads Up Display" (HUD) showing the raw internal state JSON alongside the form, acting as a debugger for the Engine.

-----

## 2\. Architecture

The Renderer operates as a function that synchronizes the DOM with the Engine State.

```typescript
render(engine: Engine, container: HTMLElement)
```

### 2.1 The "Game Loop"

Unlike traditional web apps that use event listeners to mutate the DOM directly, this renderer follows a strict unidirectional loop:

1.  **Input:** User interacts (types a character).
2.  **Dispatch:** DOM Event Handler calls `engine.dispatch(Action)`.
3.  **Update:** Engine computes new State ($S_{t+1}$).
4.  **Render:** The `render()` function is called with the new State.
5.  **Sync:** The DOM is updated to match $S_{t+1}$.

### 2.2 The DOM Cache (Identity Preservation)

To prevent loss of focus and cursor position during re-renders, elements must preserve **Object Identity**. We strictly forbid `innerHTML = ''` for interactive elements.

  * **Mechanism:** A persistent `Map<string, HTMLElement>` keyed by **Node ID** (or Path).
  * **Logic:**
      * *If exists in Map:* Get existing element, update attributes, append to new parent (move).
      * *If missing:* Create new element, store in Map, append.
      * *If Inactive:* Do not process (leave detached or remove).

-----

## 3\. Component Mapping

The renderer maps Projection Primitives to Semantic HTML elements.

### 3.1 Styling Strategy

  * **CSS Framework:** **Pico.css** (Classless, Semantic).
  * **Classes:** The renderer applies functional classes for state visualization:
      * `.node`: All nodes.
      * `.kind-{type}`: `.kind-scalar`, `.kind-struct`, etc.
      * `.judgment-{status}`: `.judgment-valid`, `.judgment-invalid`, `.judgment-incomplete`.
      * `.focused`: If the node path matches `state.cursor`.

### 3.2 Primitive Mappings

| Primitive | HTML Representation | Interactions |
| :--- | :--- | :--- |
| **Scalar** | `<input>` (Text/Number)<br>`<select>` (Enums)<br>`<input type="checkbox">` (Bool) | `oninput` $\to$ `SetScalar`<br>`onfocus` $\to$ `MoveCursor` |
| **Struct** | `<fieldset>` with `<legend>` (Label) | None (Container) |
| **Union** | `<div>` Container<br>`<select>` (Discriminator) | `onchange` $\to$ `SelectVariant` |
| **List** | `<div>` Container<br>`<button>` "Add Item" | `onclick` $\to$ `ListAdd` |
| **List Item** | `<div>` Wrapper<br>`<button>` "Remove" | `onclick` $\to$ `ListRemove` |
| **Reference** | `<input>` (Text) with `placeholder` | `oninput` $\to$ `SetScalar` |

### 3.3 Error Overlays

Validation messages (`state.sigma.issues`) are rendered as sibling elements to the input controls.

  * **HTML:** `<small class="error-text">Message</small>`
  * **Visibility:** Only rendered if the Issue's `projectionPath` matches the Node.

-----

## 4\. Interaction Model

The Renderer translates DOM Events into Engine Actions.

### 4.1 Value Updates

  * **Event:** `input` (Text), `change` (Select/Checkbox).
  * **Action:** `SetScalar(path, value)`.
  * **Optimization:** The renderer must check `input.value !== newValue` before writing to the DOM to avoid resetting the caret position.

### 4.2 Navigation

  * **Event:** `focus` (on any input).
  * **Action:** `MoveCursor(path)`.
  * **Purpose:** Ensures the Engine knows where the user is, enabling "Contextual Help" or "Keyboard Navigation" features.

### 4.3 Structure Mutation

  * **Union Switch:** `SelectVariant` action clears the old branch and initializes the new one (handled by Engine normalization).
  * **List Add/Remove:** Buttons dispatch `ListAdd` / `ListRemove`. The Engine handles bounds checking (`maxItems`); the UI just disables the button if the action is invalid.

-----

## 5\. The "Inspector" Layout

The application entry point (`index.html`) implements a Split Screen layout to serve as a dev tool.

### Left Panel: The Form

  * **Container:** `#app-form`
  * **Content:** The rendered output of `render(engine)`.
  * **Role:** The "User Experience."

### Right Panel: The HUD (Heads Up Display)

  * **Container:** `#app-debug`
  * **Content:** A live JSON tree view of `engine.getState()`.
  * **Sections:**
    1.  **Value ($V_t$):** The clean data being built.
    2.  **Cursor ($C_t$):** The active path.
    3.  **Errors ($\Sigma_t$):** Active validation issues.
    4.  **Last Action:** Debug log of the most recent dispatch.

-----

## 6\. Implementation Plan

### Phase 1: The Scaffolding

  * Set up `vite` project.
  * Install `pico.css`.
  * Create `src/renderer/index.ts` and `src/renderer/vanilla.ts`.
  * Implement the `domCache` and the basic recursive walker.

### Phase 2: The Primitives

  * Implement `renderScalar` (Input, Select, Checkbox).
  * Implement `renderStruct` (Fieldsets).
  * Implement `renderUnion` (Discriminator Selectors).
  * Implement `renderList` (Add/Remove buttons).

### Phase 3: The Integration

  * Wire up the `input` events to `engine.dispatch()`.
  * Implement the "Split Screen" debugger loop.
  * Load `tests/fixtures/purchase-order.json` as the demo model.

-----

## 7\. Success Criteria

The Renderer is complete when:

1.  **Typing is smooth:** No focus loss or cursor jumping.
2.  **Unions work:** Changing the dropdown immediately changes the form fields below it (e.g., "Card" -\> "Cash" hides the number field).
3.  **Errors appear:** Typing an invalid email immediately shows red text.
4.  **State is visible:** The JSON on the right updates instantly as you interact on the left.
