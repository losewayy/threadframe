import { el } from "../core/dom.js";
import type { BlockRenderer } from "../core/types.js";

export const renderActions: BlockRenderer<"actions"> = (block, context) => {
  const row = el("div", "iui-actions-row");
  for (const action of block.buttons) {
    const secondary = action.kind === "copy_state" || action.kind === "step_var" || action.kind === "set_var";
    const btn = el("button", secondary ? "iui-action-btn secondary" : "iui-action-btn", action.label);
    btn.type = "button";
    btn.addEventListener("click", () => context.state.dispatchAction(action));
    row.appendChild(btn);
  }
  return row;
};
