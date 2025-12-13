export type DOMCache = Map<string, HTMLElement>;

export function getOrCreate(
  cache: DOMCache,
  key: string,
  factory: () => HTMLElement,
): HTMLElement {
  const existing = cache.get(key);
  if (existing) return existing;
  const el = factory();
  cache.set(key, el);
  return el;
}

export function clearCache(cache: DOMCache): void {
  cache.clear();
}

