import { el, icon } from "../core/dom.js";
import { uiCopy } from "../display.js";
import type { BlockRenderer } from "../core/types.js";

export const renderChoices: BlockRenderer<"choices"> = (block, context) => {
  const { state } = context;
  const copy = uiCopy(Boolean(state.zh));
  const grid = el("div", "iui-choices");
  const groupIds = new Set(block.options.map((opt) => opt.id));
  const buttons: Array<{ id: string; btn: HTMLButtonElement }> = [];

  for (const opt of block.options) {
    const btn = el("button", "iui-choice-btn");
    btn.type = "button";
    btn.classList.toggle("active", state.selectedChoiceIds.has(opt.id));
    btn.setAttribute("aria-pressed", String(state.selectedChoiceIds.has(opt.id)));
    const mark = el("span", "iui-choice-check");
    mark.appendChild(icon("check"));
    btn.appendChild(mark);
    if (opt.icon) {
      const pictogram = icon(opt.icon);
      pictogram.classList.add("iui-choice-icon");
      btn.appendChild(pictogram);
    }
    btn.appendChild(el("span", "iui-choice-label", opt.label));
    if (opt.description) {
      btn.appendChild(el("span", "iui-choice-desc", opt.description));
    }

    btn.addEventListener("click", () => {
      if (!block.multi) {
        for (const id of groupIds) state.selectedChoiceIds.delete(id);
      }
      if (state.selectedChoiceIds.has(opt.id) && block.multi) {
        state.selectedChoiceIds.delete(opt.id);
      } else {
        state.selectedChoiceIds.add(opt.id);
      }

      for (const item of buttons) {
        item.btn.classList.toggle("active", state.selectedChoiceIds.has(item.id));
        item.btn.setAttribute("aria-pressed", String(state.selectedChoiceIds.has(item.id)));
      }

      if (opt.setVars) {
        Object.assign(state.scope, opt.setVars);
        state.notifyScopeChange();
        state.setStatus(`${copy.profilePrefix}${opt.label}`);
      } else if (!state.hasSubmitAction && opt.prompt && state.prompt(opt.prompt)) {
        state.setStatus(`${copy.promptedPrefix}${opt.label}`);
      } else {
        state.setStatus(`${copy.selectedPrefix}${opt.label}`);
      }
    });

    buttons.push({ id: opt.id, btn });
    grid.appendChild(btn);
  }

  return grid;
};
