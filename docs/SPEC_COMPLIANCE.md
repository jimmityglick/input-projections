# Spec Compliance: meta.layout Renderer Hint System

Reference: `docs/META_LAYOUT_RENDERER_HINT_SPEC.md`

## Status Legend
- ✓ Implemented
- ◐ Partial
- — Not started
- N/A Not applicable

---

## Compliance Matrix

| Section | Feature | v0.1 | Future | Notes |
|---------|---------|------|--------|-------|
| **§3 Layout Hints by Node Kind** |||||
| §3.1 | List: vertical | ✓ | | Default |
| §3.1 | List: grid | ✓ | | |
| §3.1 | List: cards | — | planned | Deferred |
| §3.2 | Struct: vertical | ✓ | | Default |
| §3.2 | Struct: horizontal | ✓ | | |
| §3.2 | Struct: inline | ✓ | | |
| §3.3 | Union: dropdown | ✓ | | Default |
| §3.3 | Union: tabs | ✓ | | |
| §3.3 | Union: radio | ✓ | | |
| §3.3 | Union: segmented | ✓ | | |
| §3.3.5 | Union layout constraints | ✓ | | Variant hidden, not layout changed |
| §3.3.6 | Default variant behavior | ✓ | | Engine handles |
| §3.4 | Scalar: textarea | — | planned | |
| §3.4 | Scalar: slider | — | planned | |
| §3.5 | Reference layouts | N/A | | Not applicable |
| **§3.6 Layout Resolution Contract** |||||
| §3.6.1 | resolveLayout() formula | ✓ | | |
| §3.6.1 | Token normalization (trim) | ✓ | | Empty = missing |
| §3.6.1 | Renderer extensions | ◐ | | Returns false for unknown tokens |
| §3.6.2 | LayoutContext object | — | planned | isInGridCell, viewportHints |
| §3.6.3 | Context-based adjustments | — | planned | Inline in grid cell |
| §3.6.4 | Applicability matrix | ✓ | | Well-known tokens enforced |
| **§4 Grid Layout Deep Dive** |||||
| §4.1 | Rotation model | ✓ | | Existing table.ts |
| §4.2 | Column derivation table | ✓ | | |
| §4.2.1 | Struct item columns | ✓ | | |
| §4.2.2 | Union field expansion | ✓ | | Discriminator + variant columns |
| §4.2.3 | Scalar item columns | ✓ | | Single "Value" column |
| §4.2.4 | Union item columns | ◐ | | Falls back to vertical |
| §4.2.5 | Column stability guarantees | ✓ | | Projection-driven |
| §4.3 | Relations in grids | — | planned | Currently returns null |
| §4.3.1 | Issue mapping (listValuePath) | — | planned | Relative row index |
| §4.3.2 | Cursor focus resolution | — | planned | Walk up to ancestor |
| §4.4 | Nested structures in cells | ◐ | | Falls back, no popover |
| §4.5.1 | gridCompatible predicate | ✓ | | buildTableColumns() |
| §4.5.2 | Deterministic fallback | ✓ | | |
| §4.5.3 | Allowed nondeterminism | — | planned | Layout stability rule |
| §4.5.4 | Capability profiles | — | future | |
| §4.6 | Row identity (index-based) | N/A | | Matches engine |
| §4.6.3 | Stable row keys (rowKeyField) | — | future | |
| §4.7 | List operations unchanged | ✓ | | |
| **§5 Per-Node Hints in Subtrees** |||||
| §5 | Independent hints | ✓ | | Each node resolved separately |
| **§6 Extensibility** |||||
| §6 | Custom tokens allowed | ◐ | | Allowed but fall back to default |
| **§7 Normative Constraints** |||||
| §7.1.1 #5 | Action semantics unchanged | ✓ | | |
| §7.1.1 #6 | Cursor authority preserved | ✓ | | |
| §7.1.1 #7 | Inactive cell rendering | ◐ | | Empty cells; not aria-hidden |
| §7.2 | Engine ignores layout | ✓ | | Engine unchanged |
| **§8 Examples** |||||
| §8 | Example projections | ✓ | | layout-showcase.json |
| **§9 Design Decisions** |||||
| §9.1 | No inheritance | ✓ | | Each node independent |
| §9.2 | No responsive hints | ✓ | | Renderer decides |
| §9.3 | No composition | ✓ | | Single token only |

---

## Summary

| Status | Count |
|--------|-------|
| ✓ Implemented | 28 |
| ◐ Partial | 6 |
| — Not started (v0.1 deferred) | 12 |
| N/A | 3 |

---

## Deferred Items (Future Phases)

### v0.2 Candidates
- §3.6.2 LayoutContext object
- §3.6.3 Context-based adjustments
- §4.3.1 Issue mapping with listValuePath
- §4.3.2 Cursor focus resolution algorithm
- §4.5.3 Layout stability rule

### Future / Low Priority
- §3.1 List: cards layout
- §3.4 Scalar: textarea, slider
- §4.3 Relations in grids
- §4.5.4 Capability profiles
- §4.6.3 Stable row keys (rowKeyField)

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| v0.1 | TBD | Initial implementation - core layout hints |
