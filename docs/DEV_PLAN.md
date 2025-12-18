# Dev Plan: Implement meta.layout Renderer Hint System

## Goal
Implement the `meta.layout` hint system per `docs/META_LAYOUT_RENDERER_HINT_SPEC.md`, upgrading the existing VDOM renderer to support all layout variants.

## Approach
**Upgrade existing code** - add a layout resolution layer on top of existing components.

**Grid support is partial.** The current `buildTableColumns()` in `table.ts` only supports `List<Struct>` and rejects structs with relations, multiple unions, or nested structures. The spec describes broader grid compatibility (List<Scalar>, List<Reference>, relation handling). For v0.1, we treat current restrictions as the renderer's `gridCompatible` predicate with deterministic fallback to vertical layout.

## Renderer Scope

**VDOM renderer only.** The imperative renderer ignores `meta.layout` hints.

| Renderer | Layout Hints |
|----------|--------------|
| `renderer/vdom/*` | Full support |
| `renderer/imperative/*` | Ignored (defaults only) |

---

## Phase 1: Schema & Engine Update

The JSON schema alone is not sufficient. The engine has a runtime parser that rejects unknown meta keys. Adding `meta.layout` to fixtures without updating the engine will cause `createEngine()` to emit `unexpected_property` errors.

### 1a. JSON Schema: `schemas/projection.v2.schema.json`

Add `layout` to MetaObject:

```json
"MetaObject": {
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "label": { "type": "string" },
    "description": { "type": "string" },
    "hint": { "type": "string" },
    "layout": { "type": "string" },
    "clearable": { "type": "boolean" },
    "examples": { "type": "array", "items": {} },
    "tags": { "type": "array", "items": { "type": "string" } }
  }
}
```

### 1b. TypeScript Type: `src/static/schema-types.ts`

Add `layout?: string` to the `MetaObject` interface.

### 1c. Runtime Parser: `src/static/parse.ts`

Extend `parseMetaObject()` (~line 43-54) to:
- Add `layout` to the allowlist of known properties
- Parse and pass through the `layout` string value

### 1d. Rebuild

After modifying `src/`, rebuild dist/ outputs:
```bash
npm run build
```

Tests import from `dist/esm/index.js`, so this step is required before running tests.

---

## Phase 2: Layout Resolution Module

### New File: `renderer/vdom/layout.ts`

Core layout resolution per §3.6.1.

**Applicable vs Supported:** The spec defines which tokens are *applicable* to each node kind. The renderer only *supports* a subset. For v0.1, APPLICABILITY only includes tokens we actually implement. Unsupported tokens (cards, textarea, slider) are omitted—they resolve to default, matching "unsupported falls back" behavior.

```typescript
type LayoutHint = string | undefined;
type NodeKind = "Scalar" | "Struct" | "Union" | "List" | "Reference";

// v0.1: Only tokens actually implemented by this renderer
const APPLICABILITY: Record<string, Set<NodeKind>> = {
  vertical: new Set(["List", "Struct"]),
  horizontal: new Set(["Struct"]),
  inline: new Set(["Struct"]),
  grid: new Set(["List"]),
  // cards: deferred
  dropdown: new Set(["Union"]),
  tabs: new Set(["Union"]),
  radio: new Set(["Union"]),
  segmented: new Set(["Union"]),
  // textarea, slider: deferred (no scalar layout changes in v0.1)
};

const DEFAULTS: Record<NodeKind, string | null> = {
  List: "vertical",
  Struct: "vertical",
  Union: "dropdown",
  Scalar: null,
  Reference: null,
};

export function isApplicable(kind: NodeKind, layout: string): boolean {
  const known = APPLICABILITY[layout];
  if (known) return known.has(kind);
  return false;
}

export function resolveLayout(kind: NodeKind, hint: LayoutHint): string | null {
  const normalized = hint?.trim() || undefined;
  if (!normalized) return DEFAULTS[kind];
  if (!isApplicable(kind, normalized)) return DEFAULTS[kind];
  return normalized;
}
```

---

## Phase 3: List Layout (grid/vertical)

### File: `renderer/vdom/components/list.ts`

Current behavior: `viewList()` always tries table first (line ~102). Change to explicit hint-driven dispatch:

```typescript
import { resolveLayout } from "../layout";

const layout = resolveLayout("List", node.meta?.layout);

if (layout === "grid") {
  const columns = buildTableColumns(node);
  if (columns !== null) {
    return viewTable(...);
  }
  console.warn(`List at ${projStr} requested grid but is incompatible, falling back to vertical`);
}

// Fall through to existing vertical rendering (no separate helper)
```

**Key change:** Lists default to vertical unless `meta.layout: "grid"` is explicitly set.

---

## Phase 4: Struct Layout (vertical/horizontal/inline)

### File: `renderer/vdom/components/struct.ts`

```typescript
import { resolveLayout } from "../layout";

export function viewStruct(...): VNode {
  const layout = resolveLayout("Struct", node.meta?.layout);

  if (layout === "horizontal") {
    return viewStructHorizontal(...);
  }
  if (layout === "inline") {
    return viewStructInline(...);
  }
  return viewStructVertical(...);
}
```

---

## Phase 5: Union Layout (dropdown/tabs/radio/segmented)

### File: `renderer/vdom/components/union.ts`

```typescript
import { resolveLayout } from "../layout";

export function viewUnion(...): VNode {
  const layout = resolveLayout("Union", node.meta?.layout);

  if (layout === "tabs") return viewUnionTabs(...);
  if (layout === "radio") return viewUnionRadio(...);
  if (layout === "segmented") return viewUnionSegmented(...);
  return viewUnionDropdown(...);
}
```

### Follow-up: Grid union selectors

The grid discriminator UI in `table.ts` is currently hardcoded to `<select>`. It does not consult `node.meta?.layout` on union columns. After implementing union layouts in `union.ts`, plan a follow-up to:
- Extract reusable union selector components (dropdown/tabs/radio/segmented)
- Update `table.ts` to use resolved layout for union columns in grid cells

**Deferred to v0.2** - v0.1 grids will use dropdown for all union columns regardless of hint.

---

## Phase 6: CSS Styles

### File: `renderer/styles.css`

```css
/* Struct horizontal */
.struct-horizontal {
  display: flex;
  flex-direction: row;
  gap: 1rem;
  flex-wrap: wrap;
}

/* Struct inline */
.struct-inline {
  display: inline-flex;
  gap: 0.5rem;
  align-items: center;
}

/* Union tabs */
.union-tabs .tab-bar {
  display: flex;
  border-bottom: 1px solid var(--border);
}
.union-tabs .tab {
  padding: 0.5rem 1rem;
  border: none;
  background: none;
  cursor: pointer;
}
.union-tabs .tab.active {
  border-bottom: 2px solid var(--accent);
}

/* Union radio */
.union-radio .radio-group {
  display: flex;
  gap: 1rem;
}

/* Union segmented */
.segmented-control {
  display: inline-flex;
  border: 1px solid var(--border);
  border-radius: 4px;
  overflow: hidden;
}
.segment {
  padding: 0.25rem 0.75rem;
  border: none;
  background: none;
}
.segment.active {
  background: var(--accent);
  color: white;
}
```

---

## Phase 7: Test Fixtures

### Update existing fixtures:

1. `grid-flat-rows.json`: Add `"meta": { "layout": "grid" }` to List
2. `grid-row-union.json`: Add `"meta": { "layout": "grid" }` to List
3. `address-section.json`: Add `"meta": { "layout": "horizontal" }` to demonstrate struct layout

### New fixture: `layout-showcase.json`

---

## File Summary

| File | Action |
|------|--------|
| `schemas/projection.v2.schema.json` | Add `layout` to MetaObject |
| `src/static/schema-types.ts` | Add `layout` to MetaObject type |
| `src/static/parse.ts` | Add `layout` to parser allowlist |
| `renderer/vdom/layout.ts` | **NEW** - Layout resolution module |
| `renderer/vdom/components/list.ts` | Add layout dispatch |
| `renderer/vdom/components/struct.ts` | Add horizontal/inline variants |
| `renderer/vdom/components/union.ts` | Add tabs/radio/segmented variants |
| `renderer/styles.css` | Add CSS for new layouts |
| `tests/fixtures/layout-showcase.json` | **NEW** - Demo fixture |

---

## Implementation Order

1. Schema & engine update (JSON schema + TS type + parser + rebuild)
2. Layout resolution module
3. List layout dispatch - remove auto-detect, require explicit hint
4. Update grid fixtures with `layout: "grid"` hint
5. Struct horizontal/inline
6. Union tabs/radio/segmented
7. CSS styling
8. Test fixtures + validation
9. Update `docs/SPEC_COMPLIANCE.md` with actual implementation status

**Deferred:** `cards` layout for Lists

---

## Validation Checklist

- [ ] `npm run test:schema` passes
- [ ] `npm run typecheck` passes (note: only covers `src/`, not renderer)
- [ ] `npm run renderer:build` passes (catches TS errors in `renderer/`)
- [ ] `npm run lint` passes
- [ ] Grid fixtures work with explicit `layout: "grid"` hint
- [ ] Lists without layout hint render as vertical (not auto-grid)
- [ ] Incompatible `layout: "grid"` falls back to vertical with warning
- [ ] Struct horizontal/inline render correctly
- [ ] Union tabs/radio/segmented render correctly
- [ ] Focus management works across all layouts
- [ ] Inactive variant cells are empty/inert per §7.1.1
- [ ] `docs/SPEC_COMPLIANCE.md` updated to reflect actual v0.1 status
