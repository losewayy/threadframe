import { el, icon } from "../core/dom.js";
import type { BlockRenderer } from "../core/types.js";

export const renderTimeline: BlockRenderer<"timeline"> = (block, context) => {
  const { state } = context;
  const key = state.containerKey(block);
  const wrap = el("div", "iui-timeline");
  const list = el("ol", "iui-timeline-list");
  const details = el("div", "iui-timeline-detail");
  details.setAttribute("role", "status");
  const selectable: Array<{ id: string; button: HTMLButtonElement; detail?: string }> = [];
  const select = (id: string, emit = false) => {
    state.timelineSelections.set(key, id);
    let shown = false;
    for (const item of selectable) {
      const on = item.id === id;
      item.button.setAttribute("aria-pressed", String(on));
      if (on && item.detail) {
        details.textContent = item.detail;
        shown = true;
      }
    }
    details.hidden = !shown;
    if (emit && block.selectVar) {
      state.scope[block.selectVar] = id;
      state.notifyScopeChange();
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
    if (step.detail || block.selectVar) {
      const button = el("button", "iui-timeline-select");
      button.type = "button";
      button.appendChild(row);
      button.addEventListener("click", () => select(step.id, true));
      selectable.push({ id: step.id, button, detail: step.detail });
      body.appendChild(button);
    } else body.appendChild(row);
    li.append(marker, body);
    list.appendChild(li);
  }
  wrap.append(list, details);
  const initialId = (block.selectVar ? String(state.scope[block.selectVar] ?? "") : "") || state.timelineSelections.get(key);
  const initial = selectable.find((item) => item.id === initialId) ?? selectable[0];
  if (initial) select(initial.id);
  else details.hidden = true;
  if (block.selectVar) {
    const varName = block.selectVar;
    context.syncControls.push((scope) => {
      const target = String(scope[varName] ?? "");
      if (target && selectable.some((item) => item.id === target)) select(target);
    });
  }
  return wrap;
};
