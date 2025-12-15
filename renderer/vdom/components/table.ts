import type { VNode } from "snabbdom";
import type {
  CompiledListNode,
  CompiledNode,
  CompiledReferenceNode,
  CompiledScalarNode,
  CompiledStructNode,
  CompiledUnionNode,
  EngineValue,
  ProjectionPath,
  Sigma,
  State,
  ValuePath,
} from "../../../dist/esm/index.js";
import type { VDOMContext } from "../context";
import type { Judgment } from "../view";
import { h } from "../patch";
import { nodeIdFromProjectionPath, parseValuePath, projectionPathToString, valuePathToString } from "../../utils";
import { issuesForProjectionPath, viewErrors, computeAriaErrorAttrs } from "../helpers/errors";
import { createFocusHandler, createSetScalarHandler, createUnsetHandler, createCheckboxHandler } from "../helpers/handlers";

const UNSET = "__unset__";

type TableColumn =
  | { type: "field"; fieldName: string; node: CompiledNode }
  | { type: "discriminator"; unionFieldName: string; unionNode: CompiledUnionNode }
  | { type: "variant"; unionFieldName: string; unionNode: CompiledUnionNode; variantKey: string; fieldName: string; node: CompiledNode };

export function buildTableColumns(node: CompiledListNode): TableColumn[] | null {
  if (node.item.kind !== "Struct") return null;
  const structItem = node.item;
  if (structItem.relations && structItem.relations.length > 0) return null;

  const columns: TableColumn[] = [];
  let unionFieldName: string | undefined;
  let unionNode: CompiledUnionNode | undefined;

  for (const fieldName of structItem.fieldOrder) {
    const field = structItem.fields[fieldName];

    if (field.kind === "Scalar" || field.kind === "Reference") {
      columns.push({ type: "field", fieldName, node: field });
      continue;
    }

    if (field.kind === "Union") {
      if (unionFieldName !== undefined) return null;
      unionFieldName = fieldName;
      unionNode = field;

      for (const variantKey of unionNode.variantOrder) {
        const variant = unionNode.variants[variantKey];
        if (variant.kind !== "Struct") return null;
        if (variant.relations && variant.relations.length > 0) return null;
        for (const vFieldName of variant.fieldOrder) {
          const vField = variant.fields[vFieldName];
          if (vField.kind !== "Scalar" && vField.kind !== "Reference") return null;
        }
      }

      columns.push({ type: "discriminator", unionFieldName: fieldName, unionNode: field });

      for (const variantKey of unionNode.variantOrder) {
        const variant = unionNode.variants[variantKey];
        if (variant.kind === "Struct") {
          for (const vFieldName of variant.fieldOrder) {
            columns.push({
              type: "variant",
              unionFieldName: fieldName,
              unionNode: field,
              variantKey,
              fieldName: vFieldName,
              node: variant.fields[vFieldName],
            });
          }
        }
      }
      continue;
    }

    return null;
  }

  return columns;
}

function selectUnionVariant(node: CompiledUnionNode, value: EngineValue): string | undefined {
  if (value !== undefined && (typeof value !== "object" || value === null || Array.isArray(value))) {
    return undefined;
  }
  const obj =
    value !== undefined && typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as Record<string, EngineValue>)
      : {};
  const discValue = obj[node.discriminator];
  if (discValue === undefined) return node.default;
  if (typeof discValue !== "string") return undefined;
  if (!(discValue in node.variants)) return undefined;
  return discValue;
}

function judgmentClasses(judgment: string): Record<string, boolean> {
  return {
    "grid-cell": true,
    node: true,
    "judgment-valid": judgment === "Valid",
    "judgment-invalid": judgment === "Invalid",
    "judgment-incomplete": judgment === "Incomplete",
  };
}

function createInsertHook(ctx: VDOMContext, projStr: string) {
  return (vnode: VNode) => {
    const el = vnode.elm as HTMLElement | undefined;
    if (el) ctx.elByProjectionPath.set(projStr, el);
  };
}

function viewScalarCell(
  node: CompiledScalarNode,
  value: EngineValue,
  projStr: string,
  valStr: string,
  judgment: string,
  sigma: Sigma,
  ctx: VDOMContext,
): VNode {
  const idBase = nodeIdFromProjectionPath(projStr);
  const issues = issuesForProjectionPath(sigma, projStr);
  const errorIds = issues.map((_, idx) => `${idBase}-err-${idx}`);
  const ariaAttrs = computeAriaErrorAttrs(errorIds, judgment);
  const errorVNodes = viewErrors(issues, idBase);

  let control: VNode;

  if (node.scalar.type === "string") {
    if (node.scalar.enum) {
      const enumValues = node.scalar.enum;
      const current = value === undefined ? UNSET : typeof value === "string" ? value : UNSET;
      control = h("select.grid-cell-input", {
        props: { id: `${idBase}-input`, value: current },
        dataset: { projectionPath: projStr, valuePath: valStr },
        attrs: ariaAttrs,
        on: {
          change: createSetScalarHandler(ctx, valStr, (v) => (v === UNSET ? undefined : v)),
          focus: createFocusHandler(ctx, projStr, valStr),
        },
      }, [
        h("option", { props: { value: UNSET } }, ""),
        ...enumValues.map((v) => h("option", { props: { value: v } }, v)),
      ]);
    } else {
      const inputValue = typeof value === "string" ? value : "";
      const placeholder = value === undefined ? "(unset)" : "";
      control = h("input.grid-cell-input", {
        props: { id: `${idBase}-input`, type: "text", value: inputValue, placeholder },
        dataset: { projectionPath: projStr, valuePath: valStr },
        attrs: ariaAttrs,
        on: {
          input: createSetScalarHandler(ctx, valStr, (v) => v),
          focus: createFocusHandler(ctx, projStr, valStr),
        },
      });
    }
  } else if (node.scalar.type === "number") {
    if (node.scalar.enum) {
      const enumValues = node.scalar.enum;
      const current = typeof value === "number" ? String(value) : UNSET;
      control = h("select.grid-cell-input", {
        props: { id: `${idBase}-input`, value: current },
        dataset: { projectionPath: projStr, valuePath: valStr },
        attrs: ariaAttrs,
        on: {
          change: createSetScalarHandler(ctx, valStr, (v) => (v === UNSET ? undefined : Number(v))),
          focus: createFocusHandler(ctx, projStr, valStr),
        },
      }, [
        h("option", { props: { value: UNSET } }, ""),
        ...enumValues.map((v) => h("option", { props: { value: String(v) } }, String(v))),
      ]);
    } else {
      const inputValue = typeof value === "number" ? String(value) : "";
      control = h("input.grid-cell-input", {
        props: { id: `${idBase}-input`, type: "number", value: inputValue },
        dataset: { projectionPath: projStr, valuePath: valStr },
        attrs: ariaAttrs,
        on: {
          input: createSetScalarHandler(ctx, valStr, (v) => (v === "" ? undefined : Number(v))),
          focus: createFocusHandler(ctx, projStr, valStr),
        },
      });
    }
  } else if (node.scalar.type === "boolean") {
    control = h("input.grid-cell-checkbox", {
      props: { id: `${idBase}-input`, type: "checkbox", checked: value === true },
      dataset: { projectionPath: projStr, valuePath: valStr },
      attrs: ariaAttrs,
      on: {
        change: createCheckboxHandler(ctx, valStr),
        focus: createFocusHandler(ctx, projStr, valStr),
      },
    });
  } else {
    // null
    control = h("input.grid-cell-input", {
      props: { type: "text", disabled: true, value: value === null ? "null" : "" },
    });
  }

  return h("div", {
    class: judgmentClasses(judgment),
    dataset: { projectionPath: projStr, valuePath: valStr },
    hook: { insert: createInsertHook(ctx, projStr) },
  }, [
    h("div.grid-cell-stack", [control, ...errorVNodes]),
  ]);
}

function viewReferenceCell(
  node: CompiledReferenceNode,
  value: EngineValue,
  projStr: string,
  valStr: string,
  judgment: string,
  sigma: Sigma,
  ctx: VDOMContext,
): VNode {
  const idBase = nodeIdFromProjectionPath(projStr);
  const issues = issuesForProjectionPath(sigma, projStr);
  const errorIds = issues.map((_, idx) => `${idBase}-err-${idx}`);
  const ariaAttrs = computeAriaErrorAttrs(errorIds, judgment);
  const errorVNodes = viewErrors(issues, idBase);

  let control: VNode;

  if (node.format?.enum) {
    const enumValues = node.format.enum;
    const current = value === undefined ? UNSET : typeof value === "string" ? value : UNSET;
    control = h("select.grid-cell-input", {
      props: { id: `${idBase}-input`, value: current },
      dataset: { projectionPath: projStr, valuePath: valStr },
      attrs: ariaAttrs,
      on: {
        change: createSetScalarHandler(ctx, valStr, (v) => (v === UNSET ? undefined : v)),
        focus: createFocusHandler(ctx, projStr, valStr),
      },
    }, [
      h("option", { props: { value: UNSET } }, ""),
      ...enumValues.map((v) => h("option", { props: { value: v } }, v)),
    ]);
  } else {
    const inputValue = typeof value === "string" ? value : "";
    const placeholder = value === undefined ? "(unset)" : "";
    control = h("input.grid-cell-input", {
      props: { id: `${idBase}-input`, type: "text", value: inputValue, placeholder },
      dataset: { projectionPath: projStr, valuePath: valStr },
      attrs: ariaAttrs,
      on: {
        input: createSetScalarHandler(ctx, valStr, (v) => v),
        focus: createFocusHandler(ctx, projStr, valStr),
      },
    });
  }

  return h("div", {
    class: judgmentClasses(judgment),
    dataset: { projectionPath: projStr, valuePath: valStr },
    hook: { insert: createInsertHook(ctx, projStr) },
  }, [
    h("div.grid-cell-stack", [control, ...errorVNodes]),
  ]);
}

function firstActionableCursor(
  node: CompiledNode,
  value: EngineValue,
  projectionPath: ProjectionPath,
  valuePath: ValuePath,
): { projectionPath: ProjectionPath; valuePath: ValuePath } | null {
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
    return { projectionPath, valuePath: [...valuePath, node.discriminator] };
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

export function viewTable(
  node: CompiledListNode,
  value: EngineValue,
  projectionPath: ProjectionPath,
  valuePath: ValuePath,
  projStr: string,
  valStr: string,
  judgment: Judgment,
  sigma: Sigma,
  ctx: VDOMContext,
  columns: TableColumn[],
  label?: string,
): VNode {
  const structItem = node.item as CompiledStructNode;
  const arr = Array.isArray(value) ? (value as EngineValue[]) : [];
  const hasUnion = columns.some((c) => c.type === "discriminator" || c.type === "variant");

  const nodeLabel = label ?? node.meta?.label ?? "List";
  const idBase = projStr.replaceAll("/", "_");
  const issues = issuesForProjectionPath(sigma, projStr);
  const errorVNodes = viewErrors(issues, `${idBase}_list`);

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

  // Header cells
  const headerCells: VNode[] = columns.map((col) => {
    let text: string;
    if (col.type === "field") {
      text = col.node.meta?.label ?? col.fieldName;
    } else if (col.type === "discriminator") {
      text = `${col.unionFieldName}.${col.unionNode.discriminator}`;
    } else {
      text = col.node.meta?.label
        ? `${col.variantKey}.${col.node.meta.label}`
        : `${col.variantKey}.${col.fieldName}`;
    }
    return h("th", { attrs: { scope: "col" } }, text);
  });
  headerCells.push(h("th.grid-table-actions", { attrs: { scope: "col" } }, ""));

  // Body rows
  const bodyRows: VNode[] = [];
  for (let i = 0; i < Math.min(arr.length, node.maxItems); i++) {
    const itemProjectionPath: ProjectionPath = [...projectionPath, { type: "Item", index: i }];
    const itemProjectionPathStr = projectionPathToString(itemProjectionPath);
    const rowValue = arr[i];
    const rowObj =
      rowValue !== undefined && typeof rowValue === "object" && rowValue !== null && !Array.isArray(rowValue)
        ? (rowValue as Record<string, EngineValue>)
        : {};

    let unionObj: Record<string, EngineValue> = {};
    let unionValue: EngineValue = undefined;
    let selectedVariant: string | undefined;
    if (hasUnion) {
      const unionCol = columns.find((c) => c.type === "discriminator");
      if (unionCol && unionCol.type === "discriminator") {
        unionValue = rowObj[unionCol.unionFieldName];
        unionObj =
          unionValue !== undefined && typeof unionValue === "object" && unionValue !== null && !Array.isArray(unionValue)
            ? (unionValue as Record<string, EngineValue>)
            : {};
        selectedVariant = selectUnionVariant(unionCol.unionNode, unionValue);
      }
    }

    const cells: VNode[] = columns.map((col) => {
      if (col.type === "field") {
        const fieldProjectionPath: ProjectionPath = [...itemProjectionPath, { type: "Field", name: col.fieldName }];
        const fieldProjectionPathStr = projectionPathToString(fieldProjectionPath);
        const fieldValuePath: ValuePath = [...valuePath, i, col.fieldName];
        const fieldValuePathStr = valuePathToString(fieldValuePath);
        const fieldValue = rowObj[col.fieldName];

        const nodeSigma = sigma.byProjectionPath.get(fieldProjectionPathStr);
        const cellJudgment = nodeSigma?.judgment ?? "Valid";

        if (cellJudgment === "Inactive") {
          return h("td.grid-table-cell", []);
        }

        if (col.node.kind === "Scalar") {
          return h("td.grid-table-cell", [
            viewScalarCell(col.node as CompiledScalarNode, fieldValue, fieldProjectionPathStr, fieldValuePathStr, cellJudgment, sigma, ctx),
          ]);
        } else if (col.node.kind === "Reference") {
          return h("td.grid-table-cell", [
            viewReferenceCell(col.node as CompiledReferenceNode, fieldValue, fieldProjectionPathStr, fieldValuePathStr, cellJudgment, sigma, ctx),
          ]);
        }
        return h("td.grid-table-cell", []);
      } else if (col.type === "discriminator") {
        const unionProjectionPath: ProjectionPath = [...itemProjectionPath, { type: "Field", name: col.unionFieldName }];
        const unionProjectionPathStr = projectionPathToString(unionProjectionPath);
        const unionValuePath: ValuePath = [...valuePath, i, col.unionFieldName];
        const unionValuePathStr = valuePathToString(unionValuePath);
        const discValuePath: ValuePath = [...unionValuePath, col.unionNode.discriminator];
        const discValuePathStr = valuePathToString(discValuePath);

        const nodeSigma = sigma.byProjectionPath.get(unionProjectionPathStr);
        const cellJudgment = nodeSigma?.judgment ?? "Valid";

        const issues = issuesForProjectionPath(sigma, unionProjectionPathStr);
        const discIdBase = unionProjectionPathStr.replaceAll("/", "_");
        const errorVNodes = viewErrors(issues, `${discIdBase}_disc`);

        const createDiscChangeHandler = () => (e: Event) => {
          const target = e.currentTarget as HTMLSelectElement;
          const discVp = parseValuePath(discValuePathStr);
          const at = discVp.length > 0 ? discVp.slice(0, -1) : [];
          if (target.value === UNSET) {
            ctx.dispatch({ type: "Unset", at: discVp });
            return;
          }
          ctx.dispatch({ type: "SelectVariant", at, variantKey: target.value });
        };

        const select = h("select.grid-cell-input", {
          dataset: { projectionPath: unionProjectionPathStr, valuePath: discValuePathStr },
          on: {
            change: createDiscChangeHandler(),
            focus: createFocusHandler(ctx, unionProjectionPathStr, discValuePathStr),
          },
        }, [
          h("option", { props: { value: UNSET, selected: selectedVariant === undefined } }, "(select variant)"),
          ...col.unionNode.variantOrder.map((key) => h("option", { props: { value: key, selected: key === selectedVariant } }, key)),
        ]);

        return h("td.grid-table-cell", [
          h("div", {
            class: judgmentClasses(cellJudgment),
            dataset: { projectionPath: unionProjectionPathStr, valuePath: unionValuePathStr },
            hook: { insert: createInsertHook(ctx, unionProjectionPathStr) },
          }, [
            h("div.grid-cell-stack", [select, ...errorVNodes]),
          ]),
        ]);
      } else {
        // Variant field
        const isActiveVariant = col.variantKey === selectedVariant;
        if (!isActiveVariant) {
          return h("td.grid-table-cell", []);
        }

        const variantFieldProjectionPath: ProjectionPath = [
          ...itemProjectionPath,
          { type: "Field", name: col.unionFieldName },
          { type: "Variant", key: col.variantKey },
          { type: "Field", name: col.fieldName },
        ];
        const variantFieldProjectionPathStr = projectionPathToString(variantFieldProjectionPath);
        const variantFieldValuePath: ValuePath = [...valuePath, i, col.unionFieldName, "data", col.fieldName];
        const variantFieldValuePathStr = valuePathToString(variantFieldValuePath);
        const variantData =
          unionObj.data !== undefined && typeof unionObj.data === "object" && unionObj.data !== null && !Array.isArray(unionObj.data)
            ? (unionObj.data as Record<string, EngineValue>)
            : {};
        const variantFieldValue = variantData[col.fieldName];

        const nodeSigma = sigma.byProjectionPath.get(variantFieldProjectionPathStr);
        const cellJudgment = nodeSigma?.judgment ?? "Valid";

        if (cellJudgment === "Inactive") {
          return h("td.grid-table-cell", []);
        }

        if (col.node.kind === "Scalar") {
          return h("td.grid-table-cell", [
            viewScalarCell(col.node as CompiledScalarNode, variantFieldValue, variantFieldProjectionPathStr, variantFieldValuePathStr, cellJudgment, sigma, ctx),
          ]);
        } else if (col.node.kind === "Reference") {
          return h("td.grid-table-cell", [
            viewReferenceCell(col.node as CompiledReferenceNode, variantFieldValue, variantFieldProjectionPathStr, variantFieldValuePathStr, cellJudgment, sigma, ctx),
          ]);
        }
        return h("td.grid-table-cell", []);
      }
    });

    const removeDisabled = typeof node.minItems === "number" ? arr.length <= node.minItems : false;
    cells.push(
      h("td.grid-table-actions", [
        h("button", {
          props: { type: "button", tabIndex: -1, disabled: removeDisabled },
          on: { click: createRemoveHandler(i) },
        }, "Remove"),
      ])
    );

    bodyRows.push(h("tr", { key: String(i), dataset: { projectionPath: itemProjectionPathStr } }, cells));
  }

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

  return h("div.grid-list", {
    class: {
      node: true,
      "judgment-valid": judgment === "Valid",
      "judgment-invalid": judgment === "Invalid",
      "judgment-incomplete": judgment === "Incomplete",
    },
    dataset: { projectionPath: projStr, valuePath: valStr },
    hook: { insert: createInsertHook(ctx, projStr) },
  }, [
    h("div.node-header", [
      h("span.node-label", nodeLabel),
      h("code.node-path", projStr),
    ]),
    h("div", { style: { display: "flex", gap: "0.5rem", alignItems: "center" } }, [addBtn, clearBtn]),
    h("div.errors", errorVNodes),
    h("div.grid-table-wrapper", [
      h("table.grid-table", [
        h("thead", [h("tr", headerCells)]),
        h("tbody", bodyRows),
      ]),
    ]),
  ]);
}
