import { el, icon } from "../core/dom.js";
import type { BlockRenderer } from "../core/types.js";

export const renderTimeline: BlockRenderer<"timeline"> = (block, context) => {
  const { state } = context;
  const key = state.containerKey(block);
  const wrap = el("div", "iui-timeline");
  const list = el("ol", "iui-timeline-list");
  const details = el("div", "iui-timeline-detail");
  details.setAttribute("role", "status");
  const selectable: Array<{ id: string; button: HTMLButtonElement; detail: string }> = [];
  const select = (id: string) => {
    state.timelineSelections.set(key, id);
    for (const item of selectable) {
      item.button.setAttribute("aria-pressed", String(item.id === id));
      if (item.id === id) details.textContent = item.detail;
    }
  };
  for (const step of block.steps) {
    const li = el("li", `iui-timeline-step ${step.status}`);
    const marker = el("span", "iui-timeline-marker");
    marker.setAttribute("aria-hidden", "true");
    if (step.status === "done") marker.appendChild(icon("check"));
    if (step.status === "warn") marker.appendChild(icon("warning"));
    const body = el("div", "iui-timeline-body");
    const row = el("div", "iui-timeline-heading");
    row.append(el("span", "iui-timeline-title", step.title), el("span", "iui-badge", step.meta ?? step.status));
    if (step.detail) {
      const button = el("button", "iui-timeline-select");
      button.type = "button";
      button.appendChild(row);
      button.addEventListener("click", () => select(step.id));
      selectable.push({ id: step.id, button, detail: step.detail });
      body.appendChild(button);
    } else body.appendChild(row);
    li.append(marker, body);
    list.appendChild(li);
  }
  wrap.append(list, details);
  const initial = selectable.find((item) => item.id === state.timelineSelections.get(key)) ?? selectable[0];
  if (initial) select(initial.id);
  else details.hidden = true;
  return wrap;
};
