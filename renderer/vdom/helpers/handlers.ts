import type { VDOMContext } from "../context";
import { parseProjectionPath, parseValuePath } from "../../utils";

export function createFocusHandler(ctx: VDOMContext, projStr: string, valStr: string) {
  return () => {
    ctx.dispatch({
      type: "MoveCursor",
      toProjectionPath: parseProjectionPath(projStr),
      toValuePath: parseValuePath(valStr),
    });
  };
}

export function createSetScalarHandler(
  ctx: VDOMContext,
  valStr: string,
  transform: (inputValue: string) => string | number | boolean | null | undefined,
) {
  return (e: Event) => {
    const target = e.currentTarget as HTMLInputElement | HTMLSelectElement;
    const result = transform(target.value);
    const vp = parseValuePath(valStr);
    if (result === undefined) {
      ctx.dispatch({ type: "Unset", at: vp });
    } else {
      ctx.dispatch({ type: "SetScalar", at: vp, value: result });
    }
  };
}

export function createUnsetHandler(ctx: VDOMContext, valStr: string) {
  return () => {
    ctx.dispatch({ type: "Unset", at: parseValuePath(valStr) });
  };
}

export function createCheckboxHandler(ctx: VDOMContext, valStr: string) {
  return (e: Event) => {
    const target = e.currentTarget as HTMLInputElement;
    ctx.dispatch({ type: "SetScalar", at: parseValuePath(valStr), value: target.checked });
  };
}
