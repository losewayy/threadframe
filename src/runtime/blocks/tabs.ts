import { el, uniqueId } from "../core/dom.js";
import type { BlockRenderer } from "../core/types.js";

export const renderTabs: BlockRenderer<"tabs"> = (block, context) => {
  const { state, renderChild } = context;
  const key = state.containerKey(block);
  const prefix = uniqueId("iui-tabs");
  const wrap = el("div", "iui-tabs");
  const list = el("div", "iui-tab-list");
  list.setAttribute("role", "tablist");
  list.setAttribute("aria-label", block.title ?? "Views");
  wrap.appendChild(list);
  const views: Array<{ id: string; button: HTMLButtonElement; panel: HTMLElement }> = [];
  const select = (id: string) => {
    state.tabSelections.set(key, id);
    for (const view of views) {
      const active = view.id === id;
      view.button.setAttribute("aria-selected", String(active));
      view.button.tabIndex = active ? 0 : -1;
      view.panel.hidden = !active;
    }
  };

  block.tabs.forEach((tab, index) => {
    const button = el("button", "iui-tab-btn");
    button.type = "button";
    button.id = `${prefix}-tab-${index}`;
    button.setAttribute("role", "tab");
    button.setAttribute("aria-controls", `${prefix}-panel-${index}`);
    button.appendChild(el("span", "iui-tab-label", tab.label));
    if (tab.badge) button.appendChild(el("span", "iui-tab-badge", tab.badge));
    const panel = el("div", "iui-tab-panel");
    panel.id = `${prefix}-panel-${index}`;
    panel.setAttribute("role", "tabpanel");
    panel.setAttribute("aria-labelledby", button.id);
    panel.tabIndex = 0;
    // Mount every panel once so hidden controls and charts share live bindings.
    for (const child of tab.children) panel.appendChild(renderChild(child));
    button.addEventListener("click", () => select(tab.id));
    button.addEventListener("keydown", (event) => {
      let next: number;
      if (event.key === "ArrowRight") next = (index + 1) % views.length;
      else if (event.key === "ArrowLeft") next = (index - 1 + views.length) % views.length;
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = views.length - 1;
      else return;
      event.preventDefault();
      select(views[next].id);
      views[next].button.focus();
    });
    views.push({ id: tab.id, button, panel });
    list.appendChild(button);
    wrap.appendChild(panel);
  });
  const stored = state.tabSelections.get(key);
  const selected = views.find((view) => view.id === stored)
    ?? views.find((view) => view.id === block.defaultTab) ?? views[0];
  select(selected.id);
  return wrap;
};
