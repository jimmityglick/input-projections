import { stableStringify, type EngineValue } from "../shared/json";

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
