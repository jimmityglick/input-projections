export type ValuePathSegment = string | number;
export type ValuePath = readonly ValuePathSegment[];

export type ProjectionPathSegment =
  | { type: "Field"; name: string }
  | { type: "Variant"; key: string }
  | { type: "Item"; index: number };

export type ProjectionPath = readonly ProjectionPathSegment[];

function escapeJsonPointerToken(token: string): string {
  return token.replace(/~/g, "~0").replace(/\//g, "~1");
}

export function valuePathToString(path: ValuePath): string {
  if (path.length === 0) return "/";
  return `/${path
    .map((seg) => (typeof seg === "number" ? String(seg) : escapeJsonPointerToken(seg)))
    .join("/")}`;
}

export function projectionPathToString(path: ProjectionPath): string {
  if (path.length === 0) return "/";
  const tokens: string[] = [];
  for (const seg of path) {
    if (seg.type === "Field") tokens.push("fields", seg.name);
    else if (seg.type === "Variant") tokens.push("variants", seg.key);
    else tokens.push("items", String(seg.index));
  }
  return `/${tokens.map(escapeJsonPointerToken).join("/")}`;
}

export function appendProjectionPath(
  base: ProjectionPath,
  seg: ProjectionPathSegment,
): ProjectionPath {
  return [...base, seg];
}

export function appendValuePath(base: ValuePath, seg: ValuePathSegment): ValuePath {
  return [...base, seg];
}
