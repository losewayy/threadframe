import { el, icon } from "../core/dom.js";
import type { BlockRenderer } from "../core/types.js";

export const renderChecklist: BlockRenderer<"checklist"> = (block, context) => {
  const { state } = context;
  const wrap = el("div");
  const progress = el("div", "iui-check-progress");
  wrap.appendChild(progress);
  const track = el("div", "iui-check-track");
  track.setAttribute("role", "progressbar");
  track.setAttribute("aria-label", "Checklist completion");
  track.setAttribute("aria-valuemin", "0");
  track.setAttribute("aria-valuemax", String(block.items.length));
  const fill = el("div", "iui-check-fill");
  track.appendChild(fill);
  wrap.appendChild(track);

  const updateProgress = () => {
    let done = 0;
    for (const item of block.items) {
      if (state.checklistState.get(item.id)) done++;
    }
    progress.textContent = `${done} of ${block.items.length} completed`;
    fill.style.width = `${block.items.length ? done / block.items.length * 100 : 0}%`;
    track.setAttribute("aria-valuenow", String(done));
  };
  updateProgress();

  for (const item of block.items) {
    const label = el("label", "iui-check-item");
    const box = el("input");
    box.type = "checkbox";
    box.checked = Boolean(state.checklistState.get(item.id));
    label.classList.toggle("checked", box.checked);
    box.addEventListener("change", () => {
      state.checklistState.set(item.id, box.checked);
      label.classList.toggle("checked", box.checked);
      updateProgress();
    });

    const body = el("div");
    body.appendChild(el("div", undefined, item.label));
    if (item.detail) {
      body.appendChild(el("div", "iui-check-detail", item.detail));
    }
    label.appendChild(box);
    const mark = el("span", "iui-check-mark");
    mark.appendChild(icon("check"));
    label.appendChild(mark);
    label.appendChild(body);
    wrap.appendChild(label);
  }

  return wrap;
};
