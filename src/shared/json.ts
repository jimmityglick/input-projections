export type JsonScalar = string | number | boolean | null;
export type JsonValue = JsonScalar | JsonObject | JsonArray;
export type JsonObject = { [k: string]: JsonValue };
export type JsonArray = JsonValue[];

// Engine values allow "missing" as `undefined` at any position.
export type EngineValue = EngineScalar | EngineObject | EngineArray | undefined;
export type EngineScalar = JsonScalar;
export type EngineObject = { [k: string]: EngineValue };
export type EngineArray = EngineValue[];

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isEngineObject(value: unknown): value is EngineObject {
  return isPlainObject(value);
}

export function isEngineArray(value: unknown): value is EngineArray {
  return Array.isArray(value);
}

export function isJsonScalar(value: unknown): value is JsonScalar {
  return (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}
