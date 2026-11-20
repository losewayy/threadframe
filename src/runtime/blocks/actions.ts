import { el } from "../core/dom.js";
import type { BlockRenderer } from "../core/types.js";

export const renderActions: BlockRenderer<"actions"> = (block, context) => {
  const row = el("div", "iui-actions-row");
  for (const action of block.buttons) {
    const secondary = action.kind === "copy_state" || action.kind === "step_var" || action.kind === "set_var" || action.kind === "play_var";
    const btn = el("button", secondary ? "iui-action-btn secondary" : "iui-action-btn", action.label);
    btn.type = "button";
    btn.addEventListener("click", () => context.state.dispatchAction(action));
    if (action.kind === "play_var" && action.var) {
      const targetVar = action.var;
      const pauseText = action.pauseLabel ?? (context.state.zh ? "暂停" : "Pause");
      const sync = () => {
        const playing = Boolean(context.state.playingVars?.has(targetVar));
        btn.textContent = playing ? pauseText : action.label;
        btn.setAttribute("aria-pressed", String(playing));
      };
      sync();
      context.syncControls.push(sync);
    }
    row.appendChild(btn);
  }
  return row;
};
