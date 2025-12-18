type LayoutHint = string | undefined;

export type NodeKind = "Scalar" | "Struct" | "Union" | "List" | "Reference";

// v0.1: Only tokens actually implemented by this renderer.
const APPLICABILITY: Record<string, ReadonlySet<NodeKind>> = {
  vertical: new Set(["List", "Struct"]),
  horizontal: new Set(["Struct"]),
  inline: new Set(["Struct"]),
  grid: new Set(["List"]),
  dropdown: new Set(["Union"]),
  tabs: new Set(["Union"]),
  radio: new Set(["Union"]),
  segmented: new Set(["Union"]),
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

