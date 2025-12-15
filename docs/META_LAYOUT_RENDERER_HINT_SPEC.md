# META_LAYOUT_RENDERER_HINT_SPEC.md

**Status:** Draft
**Version:** 0.1.0

---

## 1. Overview

This specification defines a **renderer hint system** using the existing `meta` property on projection nodes. The `meta.layout` field allows projection authors to express rendering preferences without polluting the algebraic core of Input Projections.

### 1.1 Design Principles

1. **Non-normative**: Layout hints do not affect engine behavior, validation, or the judgment lattice.
2. **Graceful degradation**: Renderers that don't understand a hint ignore it and use defaults.
3. **Polymorphic interpretation**: The same `layout` key has context-dependent meaning based on node kind.
4. **Backwards compatible**: Existing projections without hints continue to work.
5. **Forwards compatible**: New hint values can be added without breaking old renderers.

### 1.2 Core Insight

Layout hints are not new primitives. They express **how to traverse and display** the existing tree structure. The data doesn't change. The projection doesn't change. Only the visual arrangement changes.

---

## 2. The `meta.layout` Property

### 2.1 Schema Extension

The `meta.layout` property is a **string** value interpreted by the renderer:

```json
{
  "kind": "List",
  "meta": {
    "label": "Line Items",
    "layout": "grid"
  },
  "item": { ... }
}
```

### 2.2 Interpretation Rules

1. `meta.layout` can appear on **any node** (it's part of `NodeBase`)
2. The renderer interprets the value based on **node kind**
3. Unknown or unsupported values **fall back to the default** for that node kind
4. Missing `layout` property implies the default

---

## 3. Layout Hints by Node Kind

### 3.1 List Layouts

Lists arrange a sequence of items. The layout hint controls the **axis of arrangement**.

| Value | Meaning | Description |
|-------|---------|-------------|
| `vertical` | **Default** | Items stacked vertically, each as a nested form block |
| `grid` | Table/grid | Items as rows, struct fields as columns |
| `cards` | Card grid | Items as cards in a responsive grid (future) |

#### 3.1.1 `vertical` (Default)

Standard nested rendering. Each list item renders as a complete sub-form:

```
┌─ Item 0 ──────────────┐
│ Field A: [_________]  │
│ Field B: [_________]  │
└───────────────────────┘
┌─ Item 1 ──────────────┐
│ Field A: [_________]  │
│ Field B: [_________]  │
└───────────────────────┘
```

**Applicability**: Any List, regardless of item type.

#### 3.1.2 `grid` (Table)

Items rendered as table rows, fields as columns:

```
┌──────────┬──────────┬──────────┐
│ Field A  │ Field B  │ Field C  │
├──────────┼──────────┼──────────┤
│ [______] │ [______] │ [______] │  ← Item 0
│ [______] │ [______] │ [______] │  ← Item 1
└──────────┴──────────┴──────────┘
```

**Applicability**: See §4 for detailed grid semantics.

#### 3.1.3 `cards` (Future)

Items rendered as cards in a responsive CSS grid. Useful for visual browsing of structured items.

**Applicability**: Any List. Cards contain the full nested rendering of each item.

---

### 3.2 Struct Layouts

Structs arrange a fixed set of named fields. The layout hint controls **field arrangement**.

| Value | Meaning | Description |
|-------|---------|-------------|
| `vertical` | **Default** | Fields stacked vertically |
| `horizontal` | Row | Fields arranged in a horizontal row |
| `inline` | Compact | Fields rendered inline, minimal chrome |

#### 3.2.1 `vertical` (Default)

Fields stacked, each with its own row:

```
Field A: [_________________]
Field B: [_________________]
Field C: [_________________]
```

#### 3.2.2 `horizontal`

Fields in a row, useful for small structs or composite values:

```
Field A: [______]  Field B: [______]  Field C: [______]
```

**Use case**: Date ranges (`start_date`, `end_date`), coordinates (`x`, `y`), name parts (`first`, `last`).

#### 3.2.3 `inline`

Minimal rendering, fields flow inline. Labels may be omitted or shown as placeholders.

**Use case**: Embedded sub-structures where vertical stacking wastes space.

---

### 3.3 Union Layouts

Unions present a choice between variants. The layout hint controls **how the choice is presented**.

| Value | Meaning | Description |
|-------|---------|-------------|
| `dropdown` | **Default** | Select element for variant choice |
| `tabs` | Tab panels | Variants as tabs, content below |
| `radio` | Radio buttons | Variants as radio group, content below |
| `segmented` | Segmented control | Button group for variant selection |

#### 3.3.1 `dropdown` (Default)

Standard select element:

```
Type: [Option A ▾]
┌─────────────────────┐
│ (Option A content)  │
└─────────────────────┘
```

#### 3.3.2 `tabs`

Variants as horizontal tabs:

```
┌──────────┬──────────┬──────────┐
│ Option A │ Option B │ Option C │
├──────────┴──────────┴──────────┤
│                                │
│  (Selected variant content)    │
│                                │
└────────────────────────────────┘
```

**Use case**: When variants represent distinct "modes" the user switches between.

#### 3.3.3 `radio`

Variants as radio buttons:

```
◉ Option A  ○ Option B  ○ Option C

┌─────────────────────┐
│ (Option A content)  │
└─────────────────────┘
```

**Use case**: Small number of variants (2-4), all visible at once.

#### 3.3.4 `segmented`

Compact button group:

```
[Option A | Option B | Option C]

(Selected variant content below)
```

**Use case**: Binary or ternary choices, mobile-friendly.

#### 3.3.5 Normative Constraints for Union Layouts

**All Union layouts are semantically equivalent.**

`tabs`, `radio`, `segmented`, and `dropdown` are alternate renderings of the same discriminator control. They:

1. **MUST** dispatch `SelectVariant` with the same variant key regardless of layout
2. **MUST** render only the active branch content (inactive variants do not render editors)
3. **MUST NOT** affect pruning, requiredness, or validation semantics

Layout affects only the **selector UI**, not the engine's interpretation of the Union.

#### 3.3.6 Default Variant Behavior

If the Union discriminator is missing from the value and the projection declares a `default` variant:

1. The engine treats the default variant as active
2. The renderer **SHOULD** show the default variant as selected in the UI, even before any user action
3. The renderer **SHOULD** render the default variant's content immediately

This ensures the visual state matches the engine's active variant from the start.

```json
{
  "kind": "Union",
  "discriminator": "method",
  "default": "cash",
  "variants": {
    "cash": { ... },
    "card": { ... }
  }
}
```

With no value provided, the renderer shows "cash" selected and renders the cash variant content.

---

### 3.4 Scalar Layouts

Scalars are atomic values. Layout hints are generally **not applicable**, but could influence widget choice in the future:

| Value | Meaning | Description |
|-------|---------|-------------|
| (none) | **Default** | Renderer chooses based on scalar type and constraints |
| `textarea` | Multi-line | String rendered as textarea instead of input |
| `slider` | Range slider | Number rendered as slider (requires min/max) |

**Note**: These are speculative. Scalar rendering is typically driven by type + constraints, not layout hints.

---

### 3.5 Reference Layouts

References are opaque pointers. Layout hints are **not applicable** for the reference itself, though future extensions might support lookup widgets.

---

### 3.6 Layout Resolution Contract

To ensure consistent behavior across renderers, this section defines the **standard dispatch mechanism** for layout resolution.

#### 3.6.1 Layout Resolution Formula

```typescript
const hint = node.meta?.layout;
const applicable = hint && isApplicable(node.kind, hint);
const resolvedLayout = applicable ? hint : defaultLayoutFor(node.kind);
```

Or as a single expression:

```
resolvedLayout = (isApplicable(node.kind, node.meta?.layout) ? node.meta.layout : null)
                 ?? defaultLayoutFor(node.kind)
```

Where `isApplicable(kind, layout)` is **renderer-defined** with normative constraints:

- For layout tokens listed in §3.6.4 Applicability Matrix, the renderer **MUST** treat matrix checkmarks as applicable and matrix dashes as not applicable.
- For tokens **not** listed in the matrix, the renderer **MAY** treat them as applicable for any kind (this enables renderer-specific extensions).
- "Unknown" means "unknown to the renderer", not "unknown to this spec".

Where `defaultLayoutFor` returns:

| Node Kind | Default Layout |
|-----------|----------------|
| List | `"vertical"` |
| Struct | `"vertical"` |
| Union | `"dropdown"` |
| Scalar | `null` (renderer chooses based on type/constraints) |
| Reference | `null` (renderer chooses) |

**Edge cases:**
- If `node.meta.layout` is empty string or whitespace-only → treat as missing (use default)
- If `node.meta.layout` is not recognized or not supported by the renderer → use default
- If `node.meta.layout` is not applicable to `node.kind` per the matrix → use default (not the hint)

**Token normalization:** Layout tokens SHOULD be trimmed; empty-after-trim counts as missing.

This formula makes the applicability matrix (§3.6.4) normative for well-known tokens, while allowing renderer-specific extensions.

#### 3.6.2 Layout Context Object

The renderer maintains a **layout context** during traversal:

```typescript
type LayoutContext = {
  nodeKind: "Scalar" | "Struct" | "Union" | "List" | "Reference";
  parentKind: "Scalar" | "Struct" | "Union" | "List" | "Reference" | null;
  isInGridCell: boolean;
  viewportHints?: {
    width: "narrow" | "medium" | "wide";
    // Future: other responsive hints
  };
};
```

- **nodeKind**: The kind of node being rendered
- **parentKind**: The kind of the parent node (`null` at root)
- **isInGridCell**: `true` when rendering inside a grid/table cell
- **viewportHints**: Optional responsive context (renderer-owned)

#### 3.6.3 Strategy Selection

The renderer selects a concrete layout strategy:

```
strategy = selectLayout(node.kind, resolvedLayout, layoutContext)
```

**Note:** By this point, `resolvedLayout` is already a valid, applicable layout (or default). Kind mismatches and unknown values were filtered out by the resolution formula (§3.6.1).

**Context-based adjustments:**

The renderer MAY adjust the resolved layout based on context:

- `isInGridCell: true` + Struct `resolvedLayout: "vertical"` → renderer MAY use `"inline"` instead
- `viewportHints.width: "narrow"` + List `resolvedLayout: "grid"` → renderer MAY fall back to `"vertical"` (see §4.5.3 Allowed Nondeterminism)

These adjustments are implementation choices, not projection-driven.

#### 3.6.4 Applicability Matrix

Which layouts apply to which node kinds:

| Layout Value | List | Struct | Union | Scalar | Reference |
|--------------|------|--------|-------|--------|-----------|
| `vertical` | ✓ | ✓ | — | — | — |
| `horizontal` | — | ✓ | — | — | — |
| `inline` | — | ✓ | — | — | — |
| `grid` | ✓ | — | — | — | — |
| `cards` | ✓ | — | — | — | — |
| `dropdown` | — | — | ✓ | — | — |
| `tabs` | — | — | ✓ | — | — |
| `radio` | — | — | ✓ | — | — |
| `segmented` | — | — | ✓ | — | — |
| `textarea` | — | — | — | ✓* | — |
| `slider` | — | — | — | ✓* | — |

*Scalar layouts are future/speculative.

A `—` means the layout is **not applicable** to that node kind and MUST resolve to the default for that kind.

---

## 4. Grid Layout Deep Dive

The `grid` layout for Lists deserves special attention as it's the most complex transformation.

### 4.1 The Rotation Model

Grid layout is a **rotation** of the traversal:

**Vertical (default):**
```
for item in list:
    for field in item:
        render(field)
```

**Grid (horizontal):**
```
render_header(fields)
for item in list:
    for field in item:
        render_cell(field)
```

The data is identical. The projection is identical. Only the traversal axis changes.

### 4.2 Column Derivation

Columns are derived from the item's structure:

| Item Kind | Columns |
|-----------|---------|
| `Struct` | One column per field |
| `Union` | Discriminator column + variant field columns |
| `Scalar` | Single "Value" column |
| `List` | N/A (falls back to vertical per §4.5.1) |
| `Reference` | Single "Reference" column |

#### 4.2.1 Struct Items

Each field becomes a column. Field order determines column order.

```json
{
  "kind": "List",
  "meta": { "layout": "grid" },
  "item": {
    "kind": "Struct",
    "fields": {
      "name": { "kind": "Scalar", "scalar": { "type": "string" } },
      "qty": { "kind": "Scalar", "scalar": { "type": "number" } },
      "price": { "kind": "Scalar", "scalar": { "type": "number" } }
    }
  }
}
```

Renders as:

```
┌──────────┬─────┬───────┐
│ Name     │ Qty │ Price │
├──────────┼─────┼───────┤
│ [______] │ [_] │ [___] │
│ [______] │ [_] │ [___] │
└──────────┴─────┴───────┘
```

#### 4.2.2 Struct Items with Union Fields

Union fields create **multiple columns**:

1. **Discriminator column**: Dropdown to select variant
2. **Variant columns**: One column per variant field (conditionally visible)

```json
{
  "kind": "Struct",
  "fields": {
    "id": { "kind": "Scalar", ... },
    "entity": {
      "kind": "Union",
      "discriminator": "type",
      "variants": {
        "person": {
          "kind": "Struct",
          "fields": { "name": ..., "email": ... }
        },
        "company": {
          "kind": "Struct",
          "fields": { "company_name": ..., "tax_id": ... }
        }
      }
    }
  }
}
```

Renders as:

```
┌─────┬────────────┬────────┬───────┬──────────────┬────────┐
│ ID  │ Type       │ Name   │ Email │ Company Name │ Tax ID │
├─────┼────────────┼────────┼───────┼──────────────┼────────┤
│ [_] │ [person▾]  │ [____] │ [___] │              │        │
│ [_] │ [company▾] │        │       │ [__________] │ [____] │
└─────┴────────────┴────────┴───────┴──────────────┴────────┘
```

**Column stability:** All variant columns are always present in the header row. Variant cells are **empty or inert** when their variant is inactive; column headers remain stable regardless of row values (see §4.2.5, §7.1.1 constraint 7).

#### 4.2.3 Scalar Items

A `List<Scalar>` can still be a grid—just a single-column table:

```
┌─────────────┐
│ Value       │
├─────────────┤
│ [_________] │
│ [_________] │
└─────────────┘
```

#### 4.2.4 Union Items

A `List<Union>` (like our torture test's `branch_a`) could render with:
- Discriminator column
- Variant content columns (or a single "Content" column with embedded rendering)

This is complex and may warrant fallback to vertical.

#### 4.2.5 Column Stability Guarantees

**Columns MUST be derived from the projection, not the current value.**

This ensures grid headers are stable and do not thrash when data changes.

**Normative requirements:**

1. **Projection-driven derivation.**
   Column structure is determined by examining the `item` node of the List projection. The current value (empty list, partial data, full data) MUST NOT affect which columns exist or their order.

2. **Stable column order.**
   For Struct items, column order MUST follow the key order in the canonical projection JSON's `fields` object.

   ```json
   {
     "kind": "Struct",
     "fields": {
       "name": { ... },    // Column 1
       "qty": { ... },     // Column 2
       "price": { ... }    // Column 3
     }
   }
   ```

   **Note:** This relies on JSON key order preservation, which is standard in modern parsers. A future schema extension could add an explicit `fieldOrder` array for tooling that doesn't preserve key order.

3. **Path-based column identity.**
   Each column MUST be identified by its `projectionPath`, not by label or other mutable properties. This ensures:
   - Column identity is stable across projection edits that only change labels
   - Columns are cacheable and memoizable
   - DOM diffing can correctly match columns across renders

   ```
   Column ID: "/item/fields/name"    ← stable
   Column ID: "Name"                 ← unstable (label can change)
   ```

4. **Empty list = same columns.**
   A List with zero items MUST render the same column headers as a List with N items. The grid structure is defined by the projection, not the data.

### 4.3 Relations in Grids

**Relations are compatible with grid layout.**

A relation between fields in a Struct validates cells in the same row. When a relation fails:
- The row can be highlighted
- Specific cells can show error states
- The relation error message appears associated with the row

There is no fundamental reason to prohibit relations in grid layout. The current implementation restriction is an **implementation shortcut**, not a spec requirement.

#### 4.3.1 Issue Mapping in Grids

Engine Issues map to grid cells deterministically via their existing path properties. **No grid-specific Issue format is required.**

**Path encoding (normative):**

`valuePath` and `projectionPath` strings are slash-delimited sequences of segments:
- Field names appear as literal strings (e.g., `name`, `items`)
- List indices appear as base-10 integers (e.g., `0`, `2`, `15`)
- The path starts with `/` (root)

```
/items/2/contact/name
 ↑     ↑ ↑       ↑
 field index field field
```

If the engine provides structured path segments (e.g., `["items", 2, "contact", "name"]`), renderers SHOULD use those directly rather than string parsing.

**Mapping rules:**

The grid renderer knows its list's `valuePath` prefix (call it `listValuePath`). All mapping is **relative to that list**.

1. **Row index** is the segment **immediately after** `listValuePath`:
   ```
   listValuePath: /orders/2/items
   Issue valuePath: /orders/2/items/5/qty
                                   ↑
                                 Row 5 (not row 2)
   ```

2. **Column identity** is determined by the path suffix after the row index:
   ```
   listValuePath: /orders/2/items
   Issue valuePath: /orders/2/items/5/qty
                                     ↑
                          Column: "qty"
   ```

3. **Relation errors** use `relatedValuePaths` (also relative to `listValuePath`):
   ```
   Issue:
     code: "relation_failed"
     valuePath: /orders/2/items/5
     relatedValuePaths: ["/orders/2/items/5/start_date", "/orders/2/items/5/end_date"]

   Maps to:
     Row: 5
     Highlighted cells: "start_date", "end_date"
     Error message: associated with row 5
   ```

This relative mapping prevents bugs when grids render nested lists.

**Renderer behavior:**

- Renderers SHOULD highlight the row containing an invalid cell
- Renderers SHOULD mark specific cells referenced in `relatedValuePaths`
- Renderers MAY show error messages in a row-level error zone or as cell tooltips
- The mapping is deterministic: same Issue, same projection, same grid highlighting

#### 4.3.2 Cursor Focus in Grids

The cursor path may correspond to a node that has **no direct focus target** in the current layout representation. This occurs when rendering:

- Container nodes (Struct, List) that have no dedicated editor
- Summary renderings (collapsed content)
- Popover/modal editors (editor is not inline)
- Nodes rendered as non-editable text in grid cells

**Note:** The engine's cursor traversal skips Inactive nodes and normalizes MoveCursor requests to valid targets. If the cursor path points to an Inactive node, this is typically a **stale cursor** due to a value transition (rare).

**Normative focus resolution:**

1. Attempt to find the editor element for `cursor.projectionPath`
2. If the element exists and is focusable, focus it
3. If the element does not exist or is not focusable due to layout representation:
   - First, try to focus the nearest focusable **descendant** within that cursor node's rendered subtree
   - If none exists, focus the nearest rendered **actionable ancestor** (often the Union discriminator for that row)

**Example:**

```
cursor.projectionPath: /items/2/contact
                            ↑
                       Struct (no direct editor)

Resolution:
  /items/2/contact           ← No single editor for Struct
  /items/2/contact/type      ← First focusable descendant: the discriminator
                             ← Focus the "type" dropdown in row 2
```

**Rationale:** This keeps cursor authority intact even when layout hides or summarizes nodes. The renderer must focus something actionable within or leading to the target—not silently drop focus or focus an arbitrary element.

### 4.4 Nested Structures in Cells

When a Struct field is itself a Struct, Union, or List, the cell contains a **nested rendering**:

**Option A: Expand in cell**
The cell contains the full nested form, expanding the row height.

**Option B: Popover/modal**
The cell shows a summary, clicking opens a detail editor.

**Option C: Fallback**
If nesting is too deep, the List falls back to vertical layout.

The renderer decides based on complexity. The hint is advisory.

### 4.5 Grid Compatibility Predicate

To ensure deterministic rendering, we define a **compatibility predicate** that determines whether a List can render as a grid.

#### 4.5.1 The Predicate

```typescript
function gridCompatible(listNode: ListNode): boolean
```

**v0.1 Rule:**

A List with `layout: "grid"` is grid-compatible if its `item` projection matches one of:

| Item Kind | Compatible? | Columns Derived From |
|-----------|-------------|---------------------|
| **Scalar** | ✓ Always | Single "Value" column |
| **Reference** | ✓ Always | Single "Reference" column |
| **Struct** | ✓ Always | Immediate fields only (first level) |
| **Union** | ✓ Conditional | Only if renderer supports union-as-columns |
| **List** | ✗ Never | N/A (would create nested grids) |

**Key constraint:** Columns are derived from the **immediate fields** of the item structure:

- For `List<Struct>`, base columns are the Struct's immediate fields.
- A field whose kind is `Union` **MAY** expand into a discriminator column plus variant-field columns (see §4.2.2).
- Deeper nesting beyond that (e.g., a Union inside a variant Struct, or a Struct inside a field Struct) does **not** expand into additional columns—such content renders embedded within cells.

#### 4.5.2 Deterministic Fallback Rule

```
if (!gridCompatible(listNode)) {
  layout = "vertical"  // Deterministic fallback
}
```

This ensures that given the same projection, the fallback decision is **always the same**.

#### 4.5.3 Allowed Nondeterminism

Certain fallback conditions are **inherently nondeterministic** because they depend on runtime context:

- **Viewport size:** Screen too narrow for grid
- **Accessibility settings:** User prefers linear layout
- **Device capabilities:** Touch vs. pointer input

**This spec explicitly acknowledges allowed nondeterminism for responsive behavior.**

Renderers MAY fall back from grid to vertical based on these runtime conditions. When they do:

1. **SHOULD** document their fallback behavior
2. **SHOULD** provide consistent behavior within a session
3. **SHOULD** keep the chosen layout stable for the duration of the session, or **at minimum** while an element inside that list is focused (protects typing focus and reduces layout thrash on resize)
4. **MAY** vary across viewport sizes, devices, or accessibility modes

Projection authors should understand that `layout: "grid"` expresses **intent**, and the renderer will honor it when conditions permit.

#### 4.5.4 Future: Capability Profiles

A future version of this spec MAY introduce **renderer capability profiles**:

```typescript
type RendererCapabilities = {
  supportsGrid: boolean;
  supportsUnionColumns: boolean;
  supportsNestedCellEditors: boolean;
  // ...
};
```

This would allow:
- Renderers to declare what they support
- Projections to be validated against target renderers
- Cross-renderer consistency guarantees

For v0.1, this is deferred. The compatibility predicate provides sufficient determinism for the core case.

### 4.6 Row Identity

**Grid rows are identified by list index, not by value content.**

This matches the v1 engine behavior where list items are addressed by index-based paths (e.g., `/items/0`, `/items/1`).

#### 4.6.1 Implications

When a list item is removed or inserted:
- Subsequent rows shift up or down
- DOM elements may be reused for different data
- Input focus may move unexpectedly
- In-progress edits in a cell could become associated with a different row

**Example:** Removing item 0 from a 3-row grid:

```
Before:           After:
┌───┬───────┐     ┌───┬───────┐
│ 0 │ Alice │     │ 0 │ Bob   │  ← was row 1
│ 1 │ Bob   │  →  │ 1 │ Carol │  ← was row 2
│ 2 │ Carol │     └───┴───────┘
└───┴───────┘
```

The DOM element that displayed "Bob" may now display at index 0. This is functionally correct but can feel jarring to users who expect "Bob's row" to maintain its visual identity.

#### 4.6.2 Guidance for Renderers

Renderers SHOULD:
- Use index-based keys for DOM elements (matching engine semantics)
- Accept that row shifts are visible to users
- Ensure focus management handles shifts gracefully

Renderers MAY:
- Implement animations to make shifts less jarring
- Provide visual feedback during list mutations

#### 4.6.3 Future: Stable Row Keys

A future version of this spec MAY introduce an optional `meta.rowKeyField` hint for `List<Struct>`:

```json
{
  "kind": "List",
  "meta": {
    "layout": "grid",
    "rowKeyField": "id"
  },
  "item": {
    "kind": "Struct",
    "fields": {
      "id": { "kind": "Scalar", "scalar": { "type": "string" } },
      ...
    }
  }
}
```

This would allow renderers to use the value of the `id` field as a stable DOM key, reducing visual churn when items are added/removed. The engine would still use index-based paths; this would be purely a renderer optimization.

For v0.1, this is deferred. Index-based row identity is sufficient and matches engine semantics.

### 4.7 List Operations in Grid Layout

**Grid layout does not change `ListAdd`/`ListRemove` semantics**; only the visual placement of controls differs by renderer.

The engine dispatches `ListAdd` and `ListRemove` actions identically regardless of layout. A grid renderer may present these controls differently (e.g., toolbar buttons, row-level action cells, keyboard shortcuts), but the underlying actions remain unchanged.

---

## 5. Per-Node Hints in Subtrees

Layout hints apply independently at each node in the tree:

```json
{
  "kind": "List",
  "meta": { "layout": "grid" },
  "item": {
    "kind": "Struct",
    "fields": {
      "date_range": {
        "kind": "Struct",
        "meta": { "layout": "horizontal" },
        "fields": {
          "start": { ... },
          "end": { ... }
        }
      },
      "type": {
        "kind": "Union",
        "meta": { "layout": "radio" },
        "variants": { ... }
      }
    }
  }
}
```

This creates:
- A table (grid)
- Where the `date_range` column renders as a horizontal pair
- And the `type` column uses radio buttons instead of dropdown

Each node's hint is interpreted independently by the renderer during traversal.

---

## 6. Schema Considerations

### 6.1 Current Schema

The current `MetaObject` in the schema is:

```json
"MetaObject": {
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "label": { "type": "string" },
    "description": { "type": "string" },
    "hint": { "type": "string" },
    "examples": { "type": "array", "items": {} },
    "tags": { "type": "array", "items": { "type": "string" } }
  }
}
```

### 6.2 Proposed Extension

Add `layout` as an optional string:

```json
"MetaObject": {
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "label": { "type": "string" },
    "description": { "type": "string" },
    "hint": { "type": "string" },
    "examples": { "type": "array", "items": {} },
    "tags": { "type": "array", "items": { "type": "string" } },
    "layout": { "type": "string" }
  }
}
```

**Note**: We intentionally use `"type": "string"` rather than an enum. This allows:
- New layout values without schema changes
- Custom/experimental values
- Renderer-specific extensions

The spec defines **well-known values**; renderers may support additional values.

---

## 7. Implementation Notes

### 7.1 Renderer Contract

A compliant renderer:

1. **SHOULD** support at least the default layout for each node kind
2. **MAY** support additional layouts
3. **MUST** fall back gracefully for unknown layouts
4. **MUST NOT** fail or error on unknown layout values

#### 7.1.1 Normative Constraints (Layout is Non-Normative, Operationalized)

The following constraints ensure that layout hints remain purely presentational and cannot accidentally become "soft authority" over engine behavior:

5. **MUST NOT change action semantics.** A grid cell editor dispatches the same actions as the vertical renderer for the same node and `valuePath`. Layout affects visual arrangement, not the action protocol between renderer and engine.

6. **MUST preserve engine cursor authority.** Layout changes only *how* a node is visually located and focused, not *which* nodes are cursor-valid. The engine remains the sole authority on cursor position and cursor-valid nodes.

7. **MUST preserve "Inactive does not render".** In grid layouts, columns for inactive Union variants are UI-only placeholders. The renderer **MUST NOT** render any focusable element that would dispatch actions for an Inactive node.

   **Normative:** For an Inactive node cell, the renderer MUST render exactly one of:
   - An empty cell (no content)
   - Non-interactive text (e.g., a dash `—` or empty string)
   - An inert placeholder element with `aria-hidden="true"` and **no form controls**

   **Rationale:** This explicitly forbids `<input disabled>` because disabled inputs may still be focusable or discoverable by assistive technology (platform-dependent). The goal is zero interaction surface for pruned nodes.

   **Example:** In a grid row where `type = "person"`, the "Company: Tax ID" column cell must be empty or inert.

   ```
   │ Type       │ Person: Name │ Company: Tax ID │
   ├────────────┼──────────────┼─────────────────┤
   │ [person▾]  │ [__________] │ —               │  ← Correct (inert text)
   │ [person▾]  │ [__________] │                 │  ← Correct (empty)
   │ [person▾]  │ [__________] │ [disabled input]│  ← VIOLATION
   │ [person▾]  │ [__________] │ [__________]    │  ← VIOLATION
   ```

### 7.2 Engine Contract

The engine:

1. **MUST** ignore `meta.layout` entirely
2. **MUST NOT** validate layout values
3. **MUST NOT** change behavior based on layout hints

### 7.3 Migration Path

If a better hint system emerges:

1. New system can coexist with `meta.layout`
2. Renderers can prefer new system, fall back to meta
3. `meta.layout` can be deprecated gracefully
4. Existing projections continue to work

---

## 8. Examples

### 8.1 Order Entry Grid

```json
{
  "kind": "List",
  "meta": {
    "label": "Order Lines",
    "layout": "grid"
  },
  "minItems": 1,
  "maxItems": 50,
  "item": {
    "kind": "Struct",
    "fields": {
      "sku": { "kind": "Scalar", "scalar": { "type": "string" } },
      "description": { "kind": "Scalar", "scalar": { "type": "string" } },
      "qty": { "kind": "Scalar", "scalar": { "type": "number", "min": 1 } },
      "unit_price": { "kind": "Scalar", "scalar": { "type": "number", "min": 0 } }
    }
  }
}
```

### 8.2 Date Range with Horizontal Layout

```json
{
  "kind": "Struct",
  "meta": {
    "label": "Date Range",
    "layout": "horizontal"
  },
  "fields": {
    "start_date": { "kind": "Scalar", "scalar": { "type": "string" } },
    "end_date": { "kind": "Scalar", "scalar": { "type": "string" } }
  },
  "relations": [
    { "op": "lte", "left": "start_date", "right": "end_date", "label": "Start must be before end" }
  ]
}
```

### 8.3 Payment Method with Tabs

```json
{
  "kind": "Union",
  "meta": {
    "label": "Payment Method",
    "layout": "tabs"
  },
  "discriminator": "method",
  "variants": {
    "credit_card": { ... },
    "bank_transfer": { ... },
    "paypal": { ... }
  }
}
```

---

## 9. Design Decisions (Resolved)

The following questions were considered and resolved with conservative defaults for v0.1:

### 9.1 Inheritance: No

**Decision:** Layout hints are **not inheritable**. Each node's `meta.layout` applies only to that node.

**Rationale:** Inheritance becomes "magic" and makes debugging harder. If a child renders unexpectedly, you'd have to trace up the tree to find the inherited hint.

**Future:** If inheritance is needed, add a separate hint like `meta.layoutScope: "self" | "subtree"` rather than making inheritance implicit.

### 9.2 Responsive Hints: No (v0.1)

**Decision:** No responsive breakpoint syntax (e.g., `layout: "grid@md"`).

**Rationale:** Responsive behavior introduces nondeterminism (same projection, different rendering). This conflicts with the goal of predictable output.

**Future:** If responsive hints are needed, prefer:
- Renderer capability profiles (renderer declares what it supports)
- Media-query-aware renderers as an implementation detail outside the spec
- Explicit `meta.layoutBreakpoints` object if spec-level support is required

### 9.3 Composition: No

**Decision:** Layout is a **single token**. No composition syntax (e.g., `layout: "grid cards"`).

**Rationale:** Composition increases parsing complexity and creates ambiguity about which hint takes precedence.

**Future:** If layout needs parameters, add `meta.layoutOptions` as a separate object:
```json
{
  "meta": {
    "layout": "grid",
    "layoutOptions": { "density": "compact", "zebra": true }
  }
}
```

### 9.4 Conflicts: Not Applicable

**Decision:** No conflict resolution rules needed.

**Rationale:** With no inheritance and no composition, each node's layout is interpreted locally. Deep nesting is just local interpretation per node—there's nothing to conflict.

---

## 10. Summary

The `meta.layout` hint system provides:

- **Expressive power** without new primitives
- **Clean separation** between structure (engine) and presentation (renderer)
- **Graceful degradation** for unsupported hints
- **Forward compatibility** for future extensions

The grid is not special—it's just one of many possible layout transformations on the universal tree structure defined by the five Input Projection primitives.
