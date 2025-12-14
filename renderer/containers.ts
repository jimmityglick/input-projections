import type { EngineValue, Sigma } from "../dist/esm/index.js";
import type {
  CompiledListNode,
  CompiledNode,
  CompiledStructNode,
  CompiledUnionNode,
  ProjectionPath,
  ValuePath,
} from "../dist/esm/index.js";
import type { RenderContext } from "./types";
import { getOrCreate } from "./cache";
import { createErrorElements, issuesForProjectionPath } from "./errors";
import {
  nodeIdFromProjectionPath,
  parseProjectionPath,
  parseValuePath,
  projectionPathToString,
  reconcileChildren,
  setJudgmentClasses,
  valuePathToString,
} from "./utils";
import { processNode } from "./traverse";
import { renderScalarCell, renderReferenceCell } from "./scalars";

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

function bindCursorFocus(el: HTMLElement, ctx: RenderContext): void {
  el.onfocus = (e) => {
    const target = e.currentTarget as HTMLElement;
    const projPathStr = target.dataset.projectionPath;
    const valPathStr = target.dataset.valuePath;
    if (!projPathStr || !valPathStr) return;
    ctx.dispatch({
      type: "MoveCursor",
      toProjectionPath: parseProjectionPath(projPathStr),
      toValuePath: parseValuePath(valPathStr),
    });
  };
}

function renderErrorsBox(
  container: HTMLElement,
  sigma: Sigma,
  projectionPathString: string,
  idBase: string,
): void {
  const issues = issuesForProjectionPath(sigma, projectionPathString);
  const els = createErrorElements(issues, idBase);
  reconcileChildren(container, els);
}

export function renderStruct(
  node: CompiledStructNode,
  value: EngineValue,
  projectionPath: ProjectionPath,
  valuePath: ValuePath,
  projectionPathString: string,
  judgment: string,
  sigma: Sigma,
  ctx: RenderContext,
  labelOverride?: string,
): HTMLElement {
  const wrapper = getOrCreate(ctx.cache, projectionPathString, () => {
    const fs = document.createElement("fieldset");
    const legend = document.createElement("legend");
    legend.dataset.role = "legend";
    const errors = document.createElement("div");
    errors.dataset.role = "errors";
    errors.className = "errors";
    const content = document.createElement("div");
    content.dataset.role = "content";
    fs.append(legend, errors, content);
    return fs;
  });

  setJudgmentClasses(wrapper, judgment);
  wrapper.dataset.projectionPath = projectionPathString;
  wrapper.dataset.valuePath = valuePathToString(valuePath);

  const legend = wrapper.querySelector<HTMLElement>(':scope > legend[data-role="legend"]')!;
  legend.textContent = labelOverride ?? node.meta?.label ?? "Struct";

  const errors = wrapper.querySelector<HTMLElement>(':scope > div[data-role="errors"]')!;
  renderErrorsBox(errors, sigma, projectionPathString, `${projectionPathString.replaceAll("/", "_")}_struct`);

  const content = wrapper.querySelector<HTMLElement>(':scope > div[data-role="content"]')!;
  const obj =
    value !== undefined && typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as Record<string, EngineValue>)
      : {};

  const desired: HTMLElement[] = [];
  for (const fieldName of node.fieldOrder) {
    const childNode = node.fields[fieldName];
    const childValue = obj[fieldName];
    const childEl = processNode(
      childNode,
      childValue,
      [...projectionPath, { type: "Field", name: fieldName }],
      [...valuePath, fieldName],
      sigma,
      ctx,
      childNode.meta?.label ?? fieldName,
    );
    if (childEl) desired.push(childEl);
  }
  reconcileChildren(content, desired);
  return wrapper;
}

function selectUnionVariant(node: CompiledUnionNode, value: EngineValue): string | undefined {
  if (value !== undefined && (typeof value !== "object" || value === null || Array.isArray(value))) return undefined;
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

export function renderUnion(
  node: CompiledUnionNode,
  value: EngineValue,
  projectionPath: ProjectionPath,
  valuePath: ValuePath,
  projectionPathString: string,
  judgment: string,
  sigma: Sigma,
  ctx: RenderContext,
  labelOverride?: string,
): HTMLElement {
  const wrapper = getOrCreate(ctx.cache, projectionPathString, () => {
    const root = document.createElement("div");

    const header = document.createElement("div");
    header.dataset.role = "header";
    header.className = "node-header";

    const label = document.createElement("label");
    label.dataset.role = "label";
    label.className = "node-label";

    const path = document.createElement("code");
    path.dataset.role = "path";
    path.className = "node-path";

    header.append(label, path);

    const controls = document.createElement("div");
    controls.dataset.role = "controls";
    controls.className = "control-row";

    const errors = document.createElement("div");
    errors.dataset.role = "errors";
    errors.className = "errors";

    const content = document.createElement("div");
    content.dataset.role = "content";

    root.append(header, controls, errors, content);
    return root;
  });

  setJudgmentClasses(wrapper, judgment);
  wrapper.dataset.projectionPath = projectionPathString;
  wrapper.dataset.valuePath = valuePathToString(valuePath);

  const header = wrapper.querySelector<HTMLElement>(':scope > [data-role="header"]')!;
  const labelEl = header.querySelector<HTMLLabelElement>(':scope > [data-role="label"]')!;
  const pathEl = header.querySelector<HTMLElement>(':scope > [data-role="path"]')!;
  labelEl.textContent = labelOverride ?? node.meta?.label ?? "Union";
  pathEl.textContent = projectionPathString;

  const controls = wrapper.querySelector<HTMLElement>(':scope > [data-role="controls"]')!;
  const select = (controls.querySelector("select") ?? document.createElement("select")) as HTMLSelectElement;
  select.id = `${nodeIdFromProjectionPath(projectionPathString)}-discriminator`;
  labelEl.htmlFor = select.id;

  const discValuePath = [...valuePath, node.discriminator];
  select.dataset.projectionPath = projectionPathString;
  select.dataset.valuePath = valuePathToString(discValuePath);
  bindCursorFocus(select, ctx);

  const selected = selectUnionVariant(node, value);
  const UNSET = "__unset__";

  const desiredOptions: HTMLOptionElement[] = [];
  const optUnset = document.createElement("option");
  optUnset.value = UNSET;
  optUnset.textContent = "(select variant)";
  desiredOptions.push(optUnset);
  for (const key of node.variantOrder) {
    const opt = document.createElement("option");
    opt.value = key;
    opt.textContent = key;
    desiredOptions.push(opt);
  }
  reconcileChildren(select, desiredOptions);

  select.value = selected ?? UNSET;
  select.onchange = (e) => {
    const target = e.currentTarget as HTMLSelectElement;
    const vpStr = target.dataset.valuePath;
    if (!vpStr) return;
    const discVp = parseValuePath(vpStr);
    const at = discVp.length > 0 ? discVp.slice(0, -1) : [];
    if (target.value === UNSET) {
      ctx.dispatch({ type: "Unset", at: discVp });
      return;
    }
    ctx.dispatch({ type: "SelectVariant", at, variantKey: target.value });

    const variantNode = node.variants[target.value];
    if (variantNode?.kind === "Scalar" && variantNode.scalar.type === "null") {
      ctx.dispatch({ type: "SetScalar", at: [...at, "data"], value: null });
    }
  };

  reconcileChildren(controls, [select]);

  const errors = wrapper.querySelector<HTMLElement>(':scope > [data-role="errors"]')!;
  renderErrorsBox(errors, sigma, projectionPathString, `${projectionPathString.replaceAll("/", "_")}_union`);

  const content = wrapper.querySelector<HTMLElement>(':scope > [data-role="content"]')!;
  const desiredContent: HTMLElement[] = [];
  if (selected) {
    const obj =
      value !== undefined && typeof value === "object" && value !== null && !Array.isArray(value)
        ? (value as Record<string, EngineValue>)
        : {};
    const child = processNode(
      node.variants[selected],
      obj.data,
      [...projectionPath, { type: "Variant", key: selected }],
      [...valuePath, "data"],
      sigma,
      ctx,
      node.variants[selected].meta?.label ?? selected,
    );
    if (child) desiredContent.push(child);
  }
  reconcileChildren(content, desiredContent);
  return wrapper;
}

type ActionableCursor = { projectionPath: ProjectionPath; valuePath: ValuePath } | null;

/**
 * Column definition for table rendering.
 * Abstracts the differences between flat tables and union tables.
 */
type TableColumn =
  | { type: "field"; fieldName: string; node: CompiledNode }
  | { type: "discriminator"; unionFieldName: string; unionNode: CompiledUnionNode }
  | { type: "variant"; unionFieldName: string; unionNode: CompiledUnionNode; variantKey: string; fieldName: string; node: CompiledNode };

/**
 * Build the column model for a table. Returns null if not eligible for table view.
 */
function buildTableColumns(node: CompiledListNode): TableColumn[] | null {
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
      // Only one union allowed per row (v1 restriction)
      if (unionFieldName !== undefined) return null;
      unionFieldName = fieldName;
      unionNode = field;

      // Check all variants are Structs with only Scalar/Reference fields
      for (const variantKey of unionNode.variantOrder) {
        const variant = unionNode.variants[variantKey];
        if (variant.kind !== "Struct") return null;
        if (variant.relations && variant.relations.length > 0) return null;
        for (const vFieldName of variant.fieldOrder) {
          const vField = variant.fields[vFieldName];
          if (vField.kind !== "Scalar" && vField.kind !== "Reference") return null;
        }
      }

      // Add discriminator column
      columns.push({ type: "discriminator", unionFieldName: fieldName, unionNode: field });

      // Add variant columns
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

    // Other kinds (List, Struct) make it ineligible
    return null;
  }

  return columns;
}

function firstActionableCursor(
  node: CompiledListNode["item"],
  value: EngineValue,
  projectionPath: ProjectionPath,
  valuePath: ValuePath,
): ActionableCursor {
  if (node.kind === "Scalar" || node.kind === "Reference") return { projectionPath, valuePath };

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

  // List: focus the list itself (Add button).
  return { projectionPath, valuePath };
}

function renderListAsTable(
  node: CompiledListNode,
  value: EngineValue,
  projectionPath: ProjectionPath,
  valuePath: ValuePath,
  projectionPathString: string,
  judgment: string,
  sigma: Sigma,
  ctx: RenderContext,
  columns: TableColumn[],
  labelOverride?: string,
): HTMLElement {
  const structItem = node.item as CompiledStructNode;
  const listValPathStr = valuePathToString(valuePath);
  const arr = Array.isArray(value) ? (value as EngineValue[]) : [];
  const hasUnion = columns.some((c) => c.type === "discriminator" || c.type === "variant");

  const wrapper = getOrCreate(ctx.cache, projectionPathString, () => {
    const root = document.createElement("div");
    root.className = "grid-list";

    const header = document.createElement("div");
    header.dataset.role = "header";
    header.className = "node-header";

    const label = document.createElement("span");
    label.dataset.role = "label";
    label.className = "node-label";

    const path = document.createElement("code");
    path.dataset.role = "path";
    path.className = "node-path";

    header.append(label, path);

    const controls = document.createElement("div");
    controls.dataset.role = "controls";
    controls.style.display = "flex";
    controls.style.gap = "0.5rem";
    controls.style.alignItems = "center";

    const errors = document.createElement("div");
    errors.dataset.role = "errors";
    errors.className = "errors";

    const tableWrapper = document.createElement("div");
    tableWrapper.dataset.role = "table-wrapper";
    tableWrapper.className = "grid-table-wrapper";

    const table = document.createElement("table");
    table.className = "grid-table";
    const thead = document.createElement("thead");
    const tbody = document.createElement("tbody");
    table.append(thead, tbody);
    tableWrapper.appendChild(table);

    root.append(header, controls, errors, tableWrapper);
    return root;
  });

  setJudgmentClasses(wrapper, judgment);
  wrapper.dataset.projectionPath = projectionPathString;
  wrapper.dataset.valuePath = listValPathStr;

  // Header
  const header = wrapper.querySelector<HTMLElement>(':scope > [data-role="header"]')!;
  const labelEl = header.querySelector<HTMLElement>(':scope > [data-role="label"]')!;
  const pathEl = header.querySelector<HTMLElement>(':scope > [data-role="path"]')!;
  labelEl.textContent = labelOverride ?? node.meta?.label ?? "List";
  pathEl.textContent = projectionPathString;

  // Controls
  const controls = wrapper.querySelector<HTMLElement>(':scope > [data-role="controls"]')!;
  const addBtn = (controls.querySelector("button[data-role=\"add\"]") ??
    document.createElement("button")) as HTMLButtonElement;
  addBtn.type = "button";
  addBtn.dataset.role = "add";
  addBtn.textContent = "Add";
  addBtn.disabled = arr.length >= node.maxItems;
  addBtn.dataset.projectionPath = projectionPathString;
  addBtn.dataset.valuePath = listValPathStr;

  addBtn.onclick = () => {
    const vpStr = addBtn.dataset.valuePath;
    if (!vpStr) return;
    const vp = parseValuePath(vpStr);
    const nextState = ctx.dispatch({ type: "ListAdd", at: vp });
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
      if (cursor) ctx.dispatch({ type: "MoveCursor", toProjectionPath: cursor.projectionPath, toValuePath: cursor.valuePath });
    }
  };

  const resetBtn = (controls.querySelector("button[data-role=\"reset-list\"]") ??
    document.createElement("button")) as HTMLButtonElement;
  resetBtn.type = "button";
  resetBtn.dataset.role = "reset-list";
  resetBtn.textContent = "Clear list";
  resetBtn.tabIndex = -1;
  resetBtn.disabled = arr.length === 0;
  resetBtn.onclick = () => {
    const vpStr = addBtn.dataset.valuePath;
    if (!vpStr) return;
    const vp = parseValuePath(vpStr);
    ctx.dispatch({ type: "Unset", at: vp });
  };
  resetBtn.dataset.projectionPath = projectionPathString;
  resetBtn.dataset.valuePath = listValPathStr;

  reconcileChildren(controls, [addBtn, resetBtn]);

  // Errors
  const errors = wrapper.querySelector<HTMLElement>(':scope > [data-role="errors"]')!;
  renderErrorsBox(errors, sigma, projectionPathString, `${projectionPathString.replaceAll("/", "_")}_list`);

  // Table
  const table = wrapper.querySelector<HTMLTableElement>("table.grid-table")!;
  const thead = table.querySelector<HTMLTableSectionElement>("thead")!;
  const tbody = table.querySelector<HTMLTableSectionElement>("tbody")!;

  // Header row - generated from column model
  const desiredHeadCells: HTMLTableCellElement[] = [];
  for (const col of columns) {
    const th = document.createElement("th");
    th.scope = "col";
    if (col.type === "field") {
      th.textContent = col.node.meta?.label ?? col.fieldName;
    } else if (col.type === "discriminator") {
      th.textContent = `${col.unionFieldName}.${col.unionNode.discriminator}`;
    } else {
      // variant column
      th.textContent = col.node.meta?.label ? `${col.variantKey}.${col.node.meta.label}` : `${col.variantKey}.${col.fieldName}`;
    }
    desiredHeadCells.push(th);
  }
  // Actions column
  const thActions = document.createElement("th");
  thActions.scope = "col";
  thActions.className = "grid-table-actions";
  thActions.textContent = "";
  desiredHeadCells.push(thActions);

  const headerRow = (thead.querySelector("tr") ?? document.createElement("tr")) as HTMLTableRowElement;
  reconcileChildren(headerRow, desiredHeadCells);
  reconcileChildren(thead, [headerRow]);

  // Body rows
  const desiredRows: HTMLTableRowElement[] = [];
  for (let i = 0; i < Math.min(arr.length, node.maxItems); i += 1) {
    const itemProjectionPath: ProjectionPath = [...projectionPath, { type: "Item", index: i }];
    const itemProjectionPathStr = projectionPathToString(itemProjectionPath);
    const rowKey = `${itemProjectionPathStr}::table-row`;

    // Cache the entire row structure including cells and remove button
    const tr = getOrCreate(ctx.cache, rowKey, () => {
      const row = document.createElement("tr");
      // Create cells for each column
      for (let colIdx = 0; colIdx < columns.length; colIdx++) {
        const td = document.createElement("td");
        td.className = "grid-table-cell";
        td.dataset.colIdx = String(colIdx);
        row.appendChild(td);
      }
      // Create actions cell with remove button
      const tdActions = document.createElement("td");
      tdActions.className = "grid-table-actions";
      tdActions.dataset.role = "actions";
      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.textContent = "Remove";
      removeBtn.dataset.role = "remove";
      tdActions.appendChild(removeBtn);
      row.appendChild(tdActions);
      return row;
    }) as HTMLTableRowElement;

    tr.dataset.projectionPath = itemProjectionPathStr;
    tr.dataset.valuePath = valuePathToString([...valuePath, i]);

    const rowValue = arr[i];
    const rowObj =
      rowValue !== undefined && typeof rowValue === "object" && rowValue !== null && !Array.isArray(rowValue)
        ? (rowValue as Record<string, EngineValue>)
        : {};

    // For union columns, get the union value and selected variant
    let unionObj: Record<string, EngineValue> = {};
    let selectedVariant: string | undefined;
    if (hasUnion) {
      const unionCol = columns.find((c) => c.type === "discriminator");
      if (unionCol && unionCol.type === "discriminator") {
        const unionValue = rowObj[unionCol.unionFieldName];
        unionObj =
          unionValue !== undefined && typeof unionValue === "object" && unionValue !== null && !Array.isArray(unionValue)
            ? (unionValue as Record<string, EngineValue>)
            : {};
        selectedVariant = typeof unionObj[unionCol.unionNode.discriminator] === "string"
          ? (unionObj[unionCol.unionNode.discriminator] as string)
          : unionCol.unionNode.default;
      }
    }

    // Update cells based on column model
    for (let colIdx = 0; colIdx < columns.length; colIdx++) {
      const col = columns[colIdx];
      const td = tr.querySelector<HTMLTableCellElement>(`td[data-col-idx="${colIdx}"]`)!;

      if (col.type === "field") {
        // Simple field cell (Scalar/Reference)
        const fieldProjectionPath: ProjectionPath = [...itemProjectionPath, { type: "Field", name: col.fieldName }];
        const fieldProjectionPathStr = projectionPathToString(fieldProjectionPath);
        const fieldValuePath: ValuePath = [...valuePath, i, col.fieldName];
        const fieldValuePathStr = valuePathToString(fieldValuePath);
        const fieldValue = rowObj[col.fieldName];

        const nodeSigma = sigma.byProjectionPath.get(fieldProjectionPathStr);
        const cellJudgment = nodeSigma?.judgment ?? "Valid";

        if (cellJudgment !== "Inactive") {
          let cellEl: HTMLElement | null = null;
          if (col.node.kind === "Scalar") {
            cellEl = renderScalarCell(col.node, fieldValue, fieldProjectionPathStr, fieldValuePathStr, cellJudgment, sigma, ctx);
          } else if (col.node.kind === "Reference") {
            cellEl = renderReferenceCell(col.node, fieldValue, fieldProjectionPathStr, fieldValuePathStr, cellJudgment, sigma, ctx);
          }
          reconcileChildren(td, cellEl ? [cellEl] : []);
        } else {
          reconcileChildren(td, []);
        }
      } else if (col.type === "discriminator") {
        // Union discriminator select
        const unionProjectionPath: ProjectionPath = [...itemProjectionPath, { type: "Field", name: col.unionFieldName }];
        const unionProjectionPathStr = projectionPathToString(unionProjectionPath);
        const discValuePath: ValuePath = [...valuePath, i, col.unionFieldName, col.unionNode.discriminator];
        const discValuePathStr = valuePathToString(discValuePath);

        const nodeSigma = sigma.byProjectionPath.get(unionProjectionPathStr);
        const cellJudgment = nodeSigma?.judgment ?? "Valid";

        const cellWrapper = document.createElement("div");
        cellWrapper.className = "grid-cell";
        setJudgmentClasses(cellWrapper, cellJudgment);
        cellWrapper.dataset.projectionPath = unionProjectionPathStr;
        cellWrapper.dataset.valuePath = discValuePathStr;

        const stack = document.createElement("div");
        stack.dataset.role = "stack";
        stack.className = "grid-cell-stack";

        const select = document.createElement("select");
        select.className = "grid-cell-input";
        select.dataset.valuePath = valuePathToString([...valuePath, i, col.unionFieldName]);
        select.dataset.projectionPath = unionProjectionPathStr;
        bindCursorFocus(select, ctx);

        for (const variantKey of col.unionNode.variantOrder) {
          const opt = document.createElement("option");
          opt.value = variantKey;
          opt.textContent = variantKey;
          select.appendChild(opt);
        }
        select.value = selectedVariant ?? "";

        select.onchange = (e) => {
          const target = e.currentTarget as HTMLSelectElement;
          const vpStr = target.dataset.valuePath;
          if (!vpStr) return;
          const vp = parseValuePath(vpStr);
          ctx.dispatch({ type: "SelectVariant", at: vp, variantKey: target.value });
        };

        stack.appendChild(select);

        // Show union-level errors
        const issues = issuesForProjectionPath(sigma, unionProjectionPathStr);
        const errorEls = createErrorElements(issues, `${unionProjectionPathStr.replaceAll("/", "_")}_disc`);
        for (const el of errorEls) stack.appendChild(el);

        cellWrapper.appendChild(stack);
        reconcileChildren(td, [cellWrapper]);
      } else {
        // Variant field cell
        const isActiveVariant = col.variantKey === selectedVariant;

        if (!isActiveVariant) {
          // Inactive variant: empty cell
          reconcileChildren(td, []);
        } else {
          // Active variant: render the field
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

          if (cellJudgment !== "Inactive") {
            let cellEl: HTMLElement | null = null;
            if (col.node.kind === "Scalar") {
              cellEl = renderScalarCell(col.node, variantFieldValue, variantFieldProjectionPathStr, variantFieldValuePathStr, cellJudgment, sigma, ctx);
            } else if (col.node.kind === "Reference") {
              cellEl = renderReferenceCell(col.node, variantFieldValue, variantFieldProjectionPathStr, variantFieldValuePathStr, cellJudgment, sigma, ctx);
            }
            reconcileChildren(td, cellEl ? [cellEl] : []);
          } else {
            reconcileChildren(td, []);
          }
        }
      }
    }

    // Update remove button
    const removeBtn = tr.querySelector<HTMLButtonElement>('button[data-role="remove"]')!;
    removeBtn.dataset.projectionPath = projectionPathString;
    removeBtn.dataset.valuePath = listValPathStr;
    removeBtn.dataset.index = String(i);
    removeBtn.tabIndex = -1;
    removeBtn.disabled = typeof node.minItems === "number" ? arr.length <= node.minItems : false;
    removeBtn.onclick = () => {
      const vpStr = removeBtn.dataset.valuePath;
      if (!vpStr) return;
      const vp = parseValuePath(vpStr);
      const idx = Number(removeBtn.dataset.index ?? "0");
      const nextState = ctx.dispatch({ type: "ListRemove", at: vp, index: idx });
      const nextArrVal = getValueAt(nextState.value, vp);
      const nextArr = Array.isArray(nextArrVal) ? (nextArrVal as EngineValue[]) : [];
      const nextIdx = Math.min(idx, Math.max(nextArr.length - 1, 0));
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
        ctx.dispatch({ type: "MoveCursor", toProjectionPath: projectionPath, toValuePath: valuePath });
      }
    };

    desiredRows.push(tr);
  }
  reconcileChildren(tbody, desiredRows);

  return wrapper;
}

export function renderList(
  node: CompiledListNode,
  value: EngineValue,
  projectionPath: ProjectionPath,
  valuePath: ValuePath,
  projectionPathString: string,
  judgment: string,
  sigma: Sigma,
  ctx: RenderContext,
  labelOverride?: string,
): HTMLElement {
  // Use table view for eligible List<Struct> (with or without union)
  const columns = buildTableColumns(node);
  if (columns !== null) {
    return renderListAsTable(node, value, projectionPath, valuePath, projectionPathString, judgment, sigma, ctx, columns, labelOverride);
  }

  const wrapper = getOrCreate(ctx.cache, projectionPathString, () => {
    const root = document.createElement("div");

    const header = document.createElement("div");
    header.dataset.role = "header";
    header.className = "node-header";

    const label = document.createElement("span");
    label.dataset.role = "label";
    label.className = "node-label";

    const path = document.createElement("code");
    path.dataset.role = "path";
    path.className = "node-path";

    header.append(label, path);

    const controls = document.createElement("div");
    controls.dataset.role = "controls";
    controls.style.display = "flex";
    controls.style.gap = "0.5rem";
    controls.style.alignItems = "center";

    const errors = document.createElement("div");
    errors.dataset.role = "errors";
    errors.className = "errors";

    const items = document.createElement("div");
    items.dataset.role = "items";

    root.append(header, controls, errors, items);
    return root;
  });

  setJudgmentClasses(wrapper, judgment);
  wrapper.dataset.projectionPath = projectionPathString;
  wrapper.dataset.valuePath = valuePathToString(valuePath);

  const header = wrapper.querySelector<HTMLElement>(':scope > [data-role="header"]')!;
  const labelEl = header.querySelector<HTMLElement>(':scope > [data-role="label"]')!;
  const pathEl = header.querySelector<HTMLElement>(':scope > [data-role="path"]')!;
  labelEl.textContent = labelOverride ?? node.meta?.label ?? "List";
  pathEl.textContent = projectionPathString;

  const listValPathStr = valuePathToString(valuePath);
  const arr = Array.isArray(value) ? (value as EngineValue[]) : [];

  const controls = wrapper.querySelector<HTMLElement>(':scope > [data-role="controls"]')!;
  const addBtn = (controls.querySelector("button[data-role=\"add\"]") ??
    document.createElement("button")) as HTMLButtonElement;
  addBtn.type = "button";
  addBtn.dataset.role = "add";
  addBtn.textContent = "Add";
  addBtn.disabled = arr.length >= node.maxItems;
  addBtn.dataset.projectionPath = projectionPathString;
  addBtn.dataset.valuePath = listValPathStr;
  bindCursorFocus(addBtn, ctx);

  addBtn.onclick = () => {
    const vpStr = addBtn.dataset.valuePath;
    if (!vpStr) return;
    const vp = parseValuePath(vpStr);
    const nextState = ctx.dispatch({ type: "ListAdd", at: vp });
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
      if (cursor) ctx.dispatch({ type: "MoveCursor", toProjectionPath: cursor.projectionPath, toValuePath: cursor.valuePath });
    }
  };

  const resetBtn = (controls.querySelector("button[data-role=\"reset-list\"]") ??
    document.createElement("button")) as HTMLButtonElement;
  resetBtn.type = "button";
  resetBtn.dataset.role = "reset-list";
  resetBtn.textContent = "Clear list";
  // Secondary action: keep clickable, but remove from sequential keyboard navigation (Tab order).
  resetBtn.tabIndex = -1;
  resetBtn.disabled = arr.length === 0;
  resetBtn.onclick = () => {
    const vpStr = addBtn.dataset.valuePath;
    if (!vpStr) return;
    const vp = parseValuePath(vpStr);
    // Best-effort: unset the list value entirely.
    ctx.dispatch({ type: "Unset", at: vp });
  };
  bindCursorFocus(resetBtn, ctx);
  resetBtn.dataset.projectionPath = projectionPathString;
  resetBtn.dataset.valuePath = listValPathStr;

  reconcileChildren(controls, [addBtn, resetBtn]);

  const errors = wrapper.querySelector<HTMLElement>(':scope > [data-role="errors"]')!;
  renderErrorsBox(errors, sigma, projectionPathString, `${projectionPathString.replaceAll("/", "_")}_list`);

  const items = wrapper.querySelector<HTMLElement>(':scope > [data-role="items"]')!;
  const desiredItems: HTMLElement[] = [];

  for (let i = 0; i < Math.min(arr.length, node.maxItems); i += 1) {
    const itemProjectionPath: ProjectionPath = [...projectionPath, { type: "Item", index: i }];
    const itemProjectionPathStr = projectionPathToString(itemProjectionPath);
    const itemWrapperKey = `${itemProjectionPathStr}::list-item`;
    const itemWrapper = getOrCreate(ctx.cache, itemWrapperKey, () => {
      const div = document.createElement("div");
      div.className = "list-item";
      const body = document.createElement("div");
      body.className = "item-body";
      body.dataset.role = "body";
      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "Remove";
      remove.dataset.role = "remove";
      div.append(body, remove);
      return div;
    });

    const body = itemWrapper.querySelector<HTMLElement>('[data-role="body"]')!;
    const removeBtn = itemWrapper.querySelector<HTMLButtonElement>('button[data-role="remove"]')!;

    const listVpStr = listValPathStr;
    removeBtn.dataset.projectionPath = projectionPathString;
    removeBtn.dataset.valuePath = listVpStr;
    removeBtn.dataset.index = String(i);
    // Secondary action: keep clickable, but remove from sequential keyboard navigation (Tab order).
    removeBtn.tabIndex = -1;
    removeBtn.disabled = typeof node.minItems === "number" ? arr.length <= node.minItems : false;
    bindCursorFocus(removeBtn, ctx);
    removeBtn.onclick = () => {
      const vpStr = removeBtn.dataset.valuePath;
      if (!vpStr) return;
      const vp = parseValuePath(vpStr);
      const idx = Number(removeBtn.dataset.index ?? "0");
      const nextState = ctx.dispatch({ type: "ListRemove", at: vp, index: idx });
      const nextArrVal = getValueAt(nextState.value, vp);
      const nextArr = Array.isArray(nextArrVal) ? (nextArrVal as EngineValue[]) : [];
      const nextIdx = Math.min(idx, Math.max(nextArr.length - 1, 0));
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
        ctx.dispatch({ type: "MoveCursor", toProjectionPath: projectionPath, toValuePath: valuePath });
      }
    };

    const itemNodeEl = processNode(
      node.item,
      arr[i],
      itemProjectionPath,
      [...valuePath, i],
      sigma,
      ctx,
      node.item.meta?.label ?? `Item ${i}`,
    );
    reconcileChildren(body, itemNodeEl ? [itemNodeEl] : []);

    desiredItems.push(itemWrapper);
  }

  reconcileChildren(items, desiredItems);
  return wrapper;
}
