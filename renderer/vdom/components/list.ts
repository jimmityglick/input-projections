import type { VNode } from "snabbdom";
import type {
  CompiledListNode,
  CompiledNode,
  EngineValue,
  ProjectionPath,
  Sigma,
  State,
  ValuePath,
} from "../../../dist/esm/index.js";
import type { VDOMContext } from "../context";
import type { Judgment, ViewNodeParams } from "../view";
import { h } from "../patch";
import { parseValuePath } from "../../utils";
import { issuesForProjectionPath, viewErrors } from "../helpers/errors";
import { createFocusHandler } from "../helpers/handlers";
import { buildTableColumns, viewTable } from "./table";
import { resolveLayout } from "../layout";

function judgmentClasses(judgment: Judgment): Record<string, boolean> {
  return {
    node: true,
    "judgment-valid": judgment === "Valid",
    "judgment-invalid": judgment === "Invalid",
    "judgment-incomplete": judgment === "Incomplete",
  };
}

function createInsertHook(ctx: VDOMContext, projectionPathString: string) {
  return (vnode: VNode) => {
    const el = vnode.elm as HTMLElement | undefined;
    if (el) {
      ctx.elByProjectionPath.set(projectionPathString, el);
    }
  };
}

type ActionableCursor = { projectionPath: ProjectionPath; valuePath: ValuePath } | null;

function firstActionableCursor(
  node: CompiledNode,
  value: EngineValue,
  projectionPath: ProjectionPath,
  valuePath: ValuePath,
): ActionableCursor {
  if (node.kind === "Scalar" || node.kind === "Reference") {
    return { projectionPath, valuePath };
  }

  if (node.kind === "Struct") {
    const obj =
      value !== undefined && typeof value === "object" && value !== null && !Array.isArray(value)
        ? (value as Record<string, EngineValue>)
        : {};
    for (const fieldName of node.fieldOrder) {
      const child = firstActionableCursor(
        node.fields[fieldName],
        obj[fieldName],
        [...projectionPath, { type: "Field", name: fieldName }],
        [...valuePath, fieldName],
      );
      if (child) return child;
    }
    return null;
  }

  if (node.kind === "Union") {
    const discVp = [...valuePath, node.discriminator];
    return { projectionPath, valuePath: discVp };
  }

  return { projectionPath, valuePath };
}

function getValueAt(root: EngineValue, path: ValuePath): EngineValue {
  let cur: EngineValue = root;
  for (const seg of path) {
    if (cur === undefined) return undefined;
    if (typeof seg === "string") {
      if (typeof cur !== "object" || cur === null || Array.isArray(cur)) return undefined;
      cur = (cur as Record<string, EngineValue>)[seg];
      continue;
    }
    if (!Array.isArray(cur)) return undefined;
    cur = (cur as EngineValue[])[seg];
  }
  return cur;
}

export function viewList(
  node: CompiledListNode,
  value: EngineValue,
  projectionPath: ProjectionPath,
  valuePath: ValuePath,
  projStr: string,
  valStr: string,
  judgment: Judgment,
  sigma: Sigma,
  ctx: VDOMContext,
  viewNode: (params: ViewNodeParams) => VNode | null,
  label?: string,
): VNode {
  const layout = resolveLayout("List", node.meta?.layout);
  if (layout === "grid") {
    const columns = buildTableColumns(node);
    if (columns !== null) {
      return viewTable(node, value, projectionPath, valuePath, projStr, valStr, judgment, sigma, ctx, columns, label);
    }
    console.warn(`List at ${projStr} requested layout=grid but is incompatible; falling back to vertical`);
  }

  const arr = Array.isArray(value) ? (value as EngineValue[]) : [];
  const idBase = projStr.replaceAll("/", "_");
  const issues = issuesForProjectionPath(sigma, projStr);
  const errorVNodes = viewErrors(issues, `${idBase}_list`);

  const nodeLabel = label ?? node.meta?.label ?? "List";

  const createAddHandler = () => () => {
    const vp = parseValuePath(valStr);
    const nextState: State = ctx.dispatch({ type: "ListAdd", at: vp });
    const nextArrVal = getValueAt(nextState.value, vp);
    const nextArr = Array.isArray(nextArrVal) ? (nextArrVal as EngineValue[]) : [];
    const idx = nextArr.length > 0 ? nextArr.length - 1 : -1;
    if (idx >= 0) {
      const cursor = firstActionableCursor(
        node.item,
        nextArr[idx],
        [...projectionPath, { type: "Item", index: idx }],
        [...valuePath, idx],
      );
      if (cursor) {
        ctx.dispatch({
          type: "MoveCursor",
          toProjectionPath: cursor.projectionPath,
          toValuePath: cursor.valuePath,
        });
      }
    }
  };

  const createClearHandler = () => () => {
    ctx.dispatch({ type: "Unset", at: parseValuePath(valStr) });
  };

  const createRemoveHandler = (index: number) => () => {
    const vp = parseValuePath(valStr);
    const nextState: State = ctx.dispatch({ type: "ListRemove", at: vp, index });
    const nextArrVal = getValueAt(nextState.value, vp);
    const nextArr = Array.isArray(nextArrVal) ? (nextArrVal as EngineValue[]) : [];
    const nextIdx = Math.min(index, Math.max(nextArr.length - 1, 0));
    if (nextArr.length > 0) {
      const cursor = firstActionableCursor(
        node.item,
        nextArr[nextIdx],
        [...projectionPath, { type: "Item", index: nextIdx }],
        [...valuePath, nextIdx],
      );
      if (cursor) {
        ctx.dispatch({
          type: "MoveCursor",
          toProjectionPath: cursor.projectionPath,
          toValuePath: cursor.valuePath,
        });
      }
    } else {
      ctx.dispatch({
        type: "MoveCursor",
        toProjectionPath: projectionPath,
        toValuePath: valuePath,
      });
    }
  };

  const addBtn = h("button", {
    props: { type: "button", disabled: arr.length >= node.maxItems },
    dataset: { projectionPath: projStr, valuePath: valStr },
    on: {
      click: createAddHandler(),
      focus: createFocusHandler(ctx, projStr, valStr),
    },
  }, "Add");

  const clearBtn = h("button", {
    props: { type: "button", tabIndex: -1, disabled: arr.length === 0 },
    on: { click: createClearHandler() },
  }, "Clear list");

  const controls = h("div", { style: { display: "flex", gap: "0.5rem", alignItems: "center" } }, [
    addBtn,
    clearBtn,
  ]);

  const itemVNodes: VNode[] = [];
  for (let i = 0; i < Math.min(arr.length, node.maxItems); i++) {
    const itemProjectionPath: ProjectionPath = [...projectionPath, { type: "Item", index: i }];

    const itemContent = viewNode({
      node: node.item,
      value: arr[i],
      projectionPath: itemProjectionPath,
      valuePath: [...valuePath, i],
      sigma,
      ctx,
      label: node.item.meta?.label ?? `Item ${i}`,
    });

    const removeDisabled = typeof node.minItems === "number" ? arr.length <= node.minItems : false;

    const removeBtn = h("button", {
      props: { type: "button", tabIndex: -1, disabled: removeDisabled },
      on: { click: createRemoveHandler(i) },
    }, "Remove");

    const itemWrapper = h("div.list-item", { key: String(i) }, [
      h("div.item-body", itemContent ? [itemContent] : []),
      removeBtn,
    ]);

    itemVNodes.push(itemWrapper);
  }

  return h("div", {
    class: judgmentClasses(judgment),
    dataset: { projectionPath: projStr, valuePath: valStr },
    hook: { insert: createInsertHook(ctx, projStr) },
  }, [
    h("div.node-header", [
      h("span.node-label", nodeLabel),
      h("code.node-path", projStr),
    ]),
    controls,
    h("div.errors", errorVNodes),
    h("div", itemVNodes),
  ]);
}
