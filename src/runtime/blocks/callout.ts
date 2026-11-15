import { el, icon } from "../core/dom.js";
import type { BlockRenderer } from "../core/types.js";

export const renderCallout: BlockRenderer<"callout"> = (block) => {
  const tone = block.tone ?? "info";
  const wrap = el("div", `iui-callout ${tone}`);
  wrap.setAttribute("role", "note");
  wrap.appendChild(icon(tone === "success" ? "check" : tone === "warn" ? "warning" : "info"));
  const content = el("div", "iui-callout-content");
  content.appendChild(el("p", undefined, block.body));
  if (block.items?.length) {
    const list = el("ul");
    for (const item of block.items) list.appendChild(el("li", undefined, item));
    content.appendChild(list);
  }
  wrap.appendChild(content);
  return wrap;
};
