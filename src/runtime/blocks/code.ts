import { el } from "../core/dom.js";
import type { BlockRenderer } from "../core/types.js";
import { interpolateCode } from "../display.js";

export const renderCode: BlockRenderer<"code"> = (block, context) => {
  const wrap = el("div", "iui-code");
  const header = el("div", "iui-code-header");
  const button = el("button", "iui-action-btn secondary", block.copyLabel ?? "Copy");
  button.type = "button";
  header.append(el("span", "iui-badge", block.language ?? "text"), button);
  const pre = el("pre");
  const code = el("code");
  pre.appendChild(code);
  wrap.append(header, pre);
  if (block.caption) wrap.appendChild(el("p", "iui-code-caption", block.caption));
  button.addEventListener("click", async () => {
    const copied = await context.state.copy(code.textContent ?? "");
    button.textContent = copied ? "Copied" : "Copy unavailable";
  });
  context.bindings.push({ update: (scope) => {
    const text = interpolateCode(block.template ?? block.code ?? "", scope);
    if (code.textContent !== text) {
      code.textContent = text;
      button.textContent = block.copyLabel ?? "Copy";
    }
  } });
  return wrap;
};
