import { el } from "../core/dom.js";
import type { BlockRenderer } from "../core/types.js";
import { formatCell, filterTableRows, sortTableRows, statusValues, resolveCell, type TableSort } from "../table.js";

export const renderTable: BlockRenderer<"table"> = (block, context) => {
  const { state, bindings } = context;
  const wrap = el("div", "iui-table-block");
  let query = "";
  let status = "All";
  let sort: TableSort | null = null;
  const tools = el("div", "iui-table-tools");
  const search = el("input", "iui-table-search");
  search.type = "search";
  search.placeholder = block.filter?.placeholder ?? "Filter rows";
  search.setAttribute("aria-label", block.filter?.placeholder ?? "Filter rows");
  tools.appendChild(search);
  const pills = el("div", "iui-status-pills");
  const options = statusValues(block.rows, block.filter?.key, block.filter?.options);
  if (options.length) {
    for (const option of ["All", ...options]) {
      const pill = el("button", "iui-status-pill", option);
      pill.type = "button";
      pill.setAttribute("aria-pressed", String(option === "All"));
      pill.addEventListener("click", () => {
        status = option;
        for (const item of pills.querySelectorAll("button")) {
          item.setAttribute("aria-pressed", String(item.textContent === option));
        }
        apply();
      });
      pills.appendChild(pill);
    }
    tools.appendChild(pills);
  }
  wrap.appendChild(tools);
  const scroll = el("div", "iui-table-scroll");
  const table = el("table", "iui-data-table");
  const head = el("thead");
  const headRow = el("tr");
  head.appendChild(headRow);
  const body = el("tbody");
  table.append(head, body);
  scroll.appendChild(table);
  wrap.appendChild(scroll);
  if (block.caption) wrap.appendChild(el("p", "iui-vector-caption", block.caption));

  const apply = () => {
    headRow.replaceChildren(...block.columns.map((column) => {
      const th = el("th", undefined);
      th.scope = "col";
      if (column.align) th.style.textAlign = column.align;
      const label = column.sortable === false ? el("span", undefined, column.label) : el("button", "iui-sort-btn");
      if (label instanceof HTMLButtonElement) {
        label.type = "button";
        label.appendChild(el("span", undefined, column.label));
        const indicator = el("span", "iui-sort-mark", sort?.key === column.key ? (sort.direction === "asc" ? "↑" : "↓") : "↕");
        label.appendChild(indicator);
        label.setAttribute("aria-label", `Sort by ${column.label}`);
        const current = sort?.key === column.key ? sort.direction : undefined;
        th.setAttribute("aria-sort", current === "asc" ? "ascending" : current === "desc" ? "descending" : "none");
        label.addEventListener("click", () => {
          sort = sort?.key === column.key && sort.direction === "asc"
            ? { key: column.key, direction: "desc" }
            : sort?.key === column.key && sort.direction === "desc" ? null
            : { key: column.key, direction: "asc" };
          apply();
        });
      } else {
        label.textContent = column.label;
      }
      th.appendChild(label);
      return th;
    }));
    const rows = sortTableRows(filterTableRows(block.rows, query, block.filter?.key, status), block.columns, sort, state.scope);
    if (!rows.length) {
      const row = el("tr");
      const cell = el("td", "iui-table-empty", "No matching rows");
      cell.colSpan = block.columns.length;
      row.appendChild(cell);
      body.replaceChildren(row);
      return;
    }
    body.replaceChildren(...rows.map((row) => {
      const tr = el("tr", row.tone ? `tone ${row.tone}` : undefined);
      for (const column of block.columns) {
        const value = resolveCell(row, column, state.scope);
        const cell = el("td", column.key === block.filter?.key && typeof value === "string" ? "iui-status-cell" : undefined,
          formatCell(value, column.precision));
        if (column.align) cell.style.textAlign = column.align;
        tr.appendChild(cell);
      }
      return tr;
    }));
  };

  search.addEventListener("input", () => { query = search.value; apply(); });
  bindings.push({ update: () => apply() });
  apply();
  return wrap;
};
