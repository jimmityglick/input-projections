import type { EngineValue, Sigma } from "../dist/esm/index.js";
import type {
  CompiledListNode,
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
 * Determines if a List<Struct> is eligible for table view rendering.
 * Eligible when: item is Struct and all Struct fields are Scalar or Reference.
 */
function isEligibleForTableView(node: CompiledListNode): boolean {
  if (node.item.kind !== "Struct") return false;
  const structItem = node.item;
  for (const fieldName of structItem.fieldOrder) {
    const field = structItem.fields[fieldName];
    if (field.kind !== "Scalar" && field.kind !== "Reference") return false;
  }
  return true;
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
  labelOverride?: string,
): HTMLElement {
  const structItem = node.item as CompiledStructNode;
  const listValPathStr = valuePathToString(valuePath);
  const arr = Array.isArray(value) ? (value as EngineValue[]) : [];

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
  bindCursorFocusForList(addBtn, ctx);

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
  bindCursorFocusForList(resetBtn, ctx);
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

  // Header row
  const desiredHeadCells: HTMLTableCellElement[] = [];
  for (const fieldName of structItem.fieldOrder) {
    const th = document.createElement("th");
    th.scope = "col";
    th.textContent = structItem.fields[fieldName].meta?.label ?? fieldName;
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

    const tr = getOrCreate(ctx.cache, rowKey, () => document.createElement("tr")) as HTMLTableRowElement;
    tr.dataset.projectionPath = itemProjectionPathStr;
    tr.dataset.valuePath = valuePathToString([...valuePath, i]);

    const rowValue = arr[i];
    const rowObj =
      rowValue !== undefined && typeof rowValue === "object" && rowValue !== null && !Array.isArray(rowValue)
        ? (rowValue as Record<string, EngineValue>)
        : {};

    const desiredCells: HTMLTableCellElement[] = [];
    for (const fieldName of structItem.fieldOrder) {
      const fieldNode = structItem.fields[fieldName];
      const fieldProjectionPath: ProjectionPath = [...itemProjectionPath, { type: "Field", name: fieldName }];
      const fieldProjectionPathStr = projectionPathToString(fieldProjectionPath);
      const fieldValuePath: ValuePath = [...valuePath, i, fieldName];
      const fieldValuePathStr = valuePathToString(fieldValuePath);
      const fieldValue = rowObj[fieldName];

      const nodeSigma = sigma.byProjectionPath.get(fieldProjectionPathStr);
      const cellJudgment = nodeSigma?.judgment ?? "Valid";

      const td = document.createElement("td");
      td.className = "grid-table-cell";

      if (cellJudgment !== "Inactive") {
        let cellEl: HTMLElement | null = null;
        if (fieldNode.kind === "Scalar") {
          cellEl = renderScalarCell(fieldNode, fieldValue, fieldProjectionPathStr, fieldValuePathStr, cellJudgment, sigma, ctx);
        } else if (fieldNode.kind === "Reference") {
          cellEl = renderReferenceCell(fieldNode, fieldValue, fieldProjectionPathStr, fieldValuePathStr, cellJudgment, sigma, ctx);
        }
        if (cellEl) {
          reconcileChildren(td, [cellEl]);
        }
      }
      desiredCells.push(td);
    }

    // Actions cell (Remove button)
    const tdActions = document.createElement("td");
    tdActions.className = "grid-table-actions";
    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.textContent = "Remove";
    removeBtn.dataset.role = "remove";
    removeBtn.dataset.projectionPath = projectionPathString;
    removeBtn.dataset.valuePath = listValPathStr;
    removeBtn.dataset.index = String(i);
    removeBtn.tabIndex = -1;
    removeBtn.disabled = typeof node.minItems === "number" ? arr.length <= node.minItems : false;
    bindCursorFocusForList(removeBtn, ctx);
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
    reconcileChildren(tdActions, [removeBtn]);
    desiredCells.push(tdActions);

    reconcileChildren(tr, desiredCells);
    desiredRows.push(tr);
  }
  reconcileChildren(tbody, desiredRows);

  return wrapper;
}

function bindCursorFocusForList(el: HTMLElement, ctx: RenderContext): void {
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
  // Use table view for eligible List<Struct>
  if (isEligibleForTableView(node)) {
    return renderListAsTable(node, value, projectionPath, valuePath, projectionPathString, judgment, sigma, ctx, labelOverride);
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
