import { el, icon } from "../core/dom.js";
import type { BlockRenderer } from "../core/types.js";
import { statDisplay, uiCopy } from "../display.js";

export const renderStats: BlockRenderer<"stats"> = (block, context) => {
  const copy = uiCopy(Boolean(context.state.zh));
  const grid = el("div", "iui-stats");
  if (block.columns) grid.style.setProperty("--iui-stats-cols", String(block.columns));
  for (const item of block.items) {
    const card = el("div", `iui-stat ${item.tone ?? "primary"}`);
    card.appendChild(el("div", "iui-stat-label", item.label));
    const row = el("div", "iui-stat-value-row");
    const value = el("span", "iui-stat-value");
    row.appendChild(value);
    if (item.unit) row.appendChild(el("span", "iui-stat-unit", item.unit));
    const delta = el("div", "iui-stat-delta");
    const warning = el("span", "iui-stat-warning", copy.aboveThreshold);
    warning.prepend(icon("warning"));
    card.append(row, delta, warning);
    grid.appendChild(card);
    context.bindings.push({ update: (scope) => {
      const display = statDisplay(item, scope);
      value.textContent = display.value;
      delta.textContent = display.delta === undefined ? "" : `${copy.changePrefix}${display.delta}`;
      delta.hidden = display.delta === undefined;
      warning.hidden = !display.warning;
      card.classList.toggle("over-budget", display.warning);
    } });
  }
  return grid;
};
