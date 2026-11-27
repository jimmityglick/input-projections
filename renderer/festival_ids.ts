import type { EngineValue, ValuePath } from "./types";
import { isEngineObject } from "../dist/esm/shared/json.js";
import { getAt } from "../dist/esm/kinetic/value_ops.js";

// Objects from the same submission share its outcome. A new row can therefore
// still correct a duplicate ID, even if another row already owns that spelling.
export function festivalIDs() {
  const locks = new WeakMap<object, {locked: boolean}>();

  function reserve(snapshot: EngineValue) {
    const submission = {locked: true};
    function visit(value: EngineValue): void {
      if (Array.isArray(value)) value.forEach(visit);
      if (!isEngineObject(value)) return;
      if (typeof value.id === "string" && !locks.get(value)?.locked) locks.set(value, submission);
      Object.values(value).forEach(visit);
    }
    visit(snapshot);
    return (confirmed: boolean) => { submission.locked = confirmed; };
  }

  function locked(value: EngineValue, field: ValuePath) {
    if (field.at(-1) !== "id") return false;
    const entity = getAt(value, field.slice(0, -1));
    return isEngineObject(entity) && locks.get(entity)?.locked === true;
  }

  // Editing a descendant replaces its ancestors in the immutable draft.
  // Unaffected list items retain their object identity even when indices shift.
  function afterEdit(before: EngineValue, after: EngineValue, path: ValuePath) {
    for (const part of path) {
      if (before === after) break;
      if (isEngineObject(before) && isEngineObject(after)) {
        const lock = locks.get(before);
        if (lock) locks.set(after, lock);
      }
      before = getAt(before, [part]);
      after = getAt(after, [part]);
    }
  }
  return {reserve, locked, afterEdit};
}
