import { el, icon, uniqueId } from "../core/dom.js";
import type { BlockRenderer } from "../core/types.js";

export const renderAccordion: BlockRenderer<"accordion"> = (block, context) => {
  const { state, renderChild } = context;
  const key = state.containerKey(block);
  const wrap = el("div", "iui-accordion");
  for (const item of block.items) {
    const itemKey = JSON.stringify([key, item.id]);
    const prefix = uniqueId("iui-accordion");
    const section = el("div", "iui-accordion-item");
    const button = el("button", "iui-accordion-trigger");
    button.type = "button";
    button.id = `${prefix}-trigger`;
    button.setAttribute("aria-controls", `${prefix}-panel`);
    button.appendChild(icon("chevron"));
    button.appendChild(el("span", "iui-accordion-title", item.title));
    if (item.summary) button.appendChild(el("span", "iui-accordion-summary", item.summary));
    const panel = el("div", "iui-accordion-panel");
    panel.id = `${prefix}-panel`;
    panel.setAttribute("role", "region");
    panel.setAttribute("aria-labelledby", button.id);
    for (const child of item.children) panel.appendChild(renderChild(child));
    const sync = () => {
      const open = state.accordionOpen.get(itemKey) ?? false;
      button.setAttribute("aria-expanded", String(open));
      panel.hidden = !open;
    };
    button.addEventListener("click", () => {
      state.accordionOpen.set(itemKey, !state.accordionOpen.get(itemKey));
      sync();
    });
    sync();
    section.append(button, panel);
    wrap.appendChild(section);
  }
  return wrap;
};
