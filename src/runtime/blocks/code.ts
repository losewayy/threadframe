import { el } from "../core/dom.js";
import type { BlockRenderer } from "../core/types.js";
import { interpolateCode } from "../display.js";
import { evaluateNumericOrNull } from "../formula.js";

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

  const numbered = block.activeLine !== undefined || block.activeLineFormula !== undefined;
  let rawText = "";
  let lineRows: HTMLElement[] = [];

  button.addEventListener("click", async () => {
    const copied = await context.state.copy(rawText);
    button.textContent = copied ? "Copied" : "Copy unavailable";
  });

  context.bindings.push({ update: (scope) => {
    const text = interpolateCode(block.template ?? block.code ?? "", scope);
    if (text !== rawText) {
      rawText = text;
      button.textContent = block.copyLabel ?? "Copy";
      if (!numbered) {
        code.textContent = text;
      } else {
        lineRows = text.split(/\r?\n/).map((line, index) => {
          const row = el("span", "iui-code-line");
          row.append(el("span", "iui-code-ln", String(index + 1)), el("span", "iui-code-src", line || " "));
          return row;
        });
        code.replaceChildren(...lineRows);
      }
    }
    if (!numbered) return;
    const evaluated = block.activeLineFormula ? evaluateNumericOrNull(block.activeLineFormula, scope) : null;
    const active = evaluated !== null ? Math.trunc(evaluated) : (block.activeLine ?? 0);
    lineRows.forEach((row, index) => {
      const on = index + 1 === active;
      row.classList.toggle("active", on);
      if (on) row.setAttribute("aria-current", "step");
      else row.removeAttribute("aria-current");
    });
  } });
  return wrap;
};
