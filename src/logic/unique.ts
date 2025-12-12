import type { EngineValue } from "../shared/json";

function stableStringify(value: EngineValue): string {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : JSON.stringify(String(value));
  if (typeof value === "boolean") return value ? "true" : "false";
  if (Array.isArray(value)) return `[${value.map((v) => stableStringify(v)).join(",")}]`;

  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(",")}}`;
}

export function hasUniqueDefinedItems(items: readonly EngineValue[]): boolean {
  const seen = new Set<string>();
  for (const item of items) {
    if (item === undefined) continue;
    const key = stableStringify(item);
    if (seen.has(key)) return false;
    seen.add(key);
  }
  return true;
}
