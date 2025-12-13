import type {
  ProjectionPath,
  ProjectionPathSegment,
  ValuePath,
  ValuePathSegment,
} from "../dist/esm/index.js";
import { projectionPathToString, valuePathToString } from "../dist/esm/index.js";

function unescapeJsonPointerToken(token: string): string {
  return token.replace(/~1/g, "/").replace(/~0/g, "~");
}

export { projectionPathToString, valuePathToString };

function parsePointerTokens(pointer: string): string[] {
  if (pointer === "/") return [];
  if (!pointer.startsWith("/")) throw new Error(`Invalid pointer: ${pointer}`);
  return pointer
    .slice(1)
    .split("/")
    .map(unescapeJsonPointerToken);
}

export function parseValuePath(pointer: string): ValuePath {
  const tokens = parsePointerTokens(pointer);
  const segs: ValuePathSegment[] = tokens.map((t) => {
    if (/^(0|[1-9][0-9]*)$/.test(t)) return Number(t);
    return t;
  });
  return segs;
}

export function parseProjectionPath(pointer: string): ProjectionPath {
  const tokens = parsePointerTokens(pointer);
  if (tokens.length === 0) return [];
  if (tokens.length % 2 !== 0) throw new Error(`Invalid projection path: ${pointer}`);
  const segs: ProjectionPathSegment[] = [];
  for (let i = 0; i < tokens.length; i += 2) {
    const head = tokens[i];
    const tail = tokens[i + 1];
    if (head === "fields") segs.push({ type: "Field", name: tail });
    else if (head === "variants") segs.push({ type: "Variant", key: tail });
    else if (head === "items") {
      if (!/^(0|[1-9][0-9]*)$/.test(tail)) throw new Error(`Invalid item index: ${tail}`);
      segs.push({ type: "Item", index: Number(tail) });
    } else {
      throw new Error(`Invalid projection path token: ${head}`);
    }
  }
  return segs;
}

export function nodeIdFromProjectionPath(projectionPathString: string): string {
  const safe = projectionPathString === "/" ? "root" : projectionPathString.replaceAll("/", "__");
  return `node_${safe.replaceAll("~", "_t").replaceAll(".", "_")}`;
}

export function setJudgmentClasses(el: HTMLElement, judgment: string): void {
  el.classList.add("node");
  el.classList.remove("judgment-invalid", "judgment-incomplete", "judgment-valid");
  if (judgment === "Invalid") el.classList.add("judgment-invalid");
  else if (judgment === "Incomplete") el.classList.add("judgment-incomplete");
  else if (judgment === "Valid") el.classList.add("judgment-valid");
}

export function reconcileChildren(parent: HTMLElement, desired: readonly Node[]): void {
  const desiredSet = new Set(desired);

  let cursor: ChildNode | null = parent.firstChild;
  for (const node of desired) {
    if (cursor === node) {
      cursor = cursor.nextSibling;
      continue;
    }
    parent.insertBefore(node, cursor);
  }

  let child = parent.firstChild;
  while (child) {
    const next = child.nextSibling;
    if (!desiredSet.has(child)) parent.removeChild(child);
    child = next;
  }
}

export function findFirstActionable(root: HTMLElement): HTMLElement | null {
  const candidates = root.querySelectorAll("input, select, button");
  for (const el of candidates) {
    const html = el;
    if (!(html instanceof HTMLElement)) continue;
    const disabled = (html instanceof HTMLInputElement || html instanceof HTMLSelectElement || html instanceof HTMLButtonElement) && html.disabled;
    // Respect sequential keyboard navigation: skip elements explicitly removed from tab order.
    if (html.tabIndex < 0) continue;
    if (!disabled) return html;
  }
  return null;
}
