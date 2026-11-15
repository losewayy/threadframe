import { el, icon } from "../core/dom.js";
import type { BlockRenderer } from "../core/types.js";

export const renderCompare: BlockRenderer<"compare"> = (block) => {
  const wrap = el("div", "iui-table-wrap");
  const table = el("table", "iui-table");
  const thead = el("thead");
  const headRow = el("tr");
  headRow.appendChild(el("th", undefined, "Criterion"));
  block.columns.forEach((col, idx) => {
    const th = el("th", block.recommendedIndex === idx ? "recommended" : undefined, col);
    th.scope = "col";
    if (block.recommendedIndex === idx) th.appendChild(el("span", "iui-recommended-badge", "Recommended"));
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = el("tbody");
  for (const row of block.rows) {
    const tr = el("tr");
    tr.appendChild(el("td", undefined, row.criterion));
    block.columns.forEach((_, idx) => {
      const td = el("td", row.winnerIndex === idx ? "winner" : undefined, row.values[idx] ?? "-");
      if (block.recommendedIndex === idx) td.classList.add("recommended");
      if (row.winnerIndex === idx) {
        td.appendChild(icon("check"));
        td.appendChild(el("span", "iui-sr-only", " (Best option)"));
      }
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  wrap.appendChild(table);
  return wrap;
};
