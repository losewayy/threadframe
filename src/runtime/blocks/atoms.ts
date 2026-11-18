import { inlineFormulaValue, parseInlineText } from "../../schema/inlineText.js";
import { el, icon } from "../core/dom.js";
import type { BlockRenderer } from "../core/types.js";

const inlineTags = { text: "p", title: "h3", caption: "p", badge: "span" } as const;

export const renderInlineAtom: BlockRenderer<keyof typeof inlineTags> = (block, { bindings }) => {
  const node = el(inlineTags[block.kind], `iui-atom-${block.kind}`);
  if (block.kind === "badge" && block.tint) node.dataset.tint = block.tint;

  let emphasis: HTMLElement | undefined;
  for (const part of parseInlineText(block.text)) {
    if (part.strong && !emphasis) {
      emphasis = el("strong");
      node.appendChild(emphasis);
    } else if (!part.strong) emphasis = undefined;
    const parent = emphasis ?? node;
    if (part.kind === "code") {
      parent.appendChild(el("code", undefined, part.text));
    } else if (part.kind === "formula") {
      const text = document.createTextNode("");
      parent.appendChild(text);
      bindings.push({ update: (scope) => { text.data = inlineFormulaValue(part.formula, scope); } });
    } else {
      parent.appendChild(document.createTextNode(part.text));
    }
  }
  return node;
};

export const renderBox: BlockRenderer<"box"> = (block, context) => {
  const node = el("div", "iui-box");
  node.dataset.direction = block.direction ?? "column";
  node.dataset.align = block.align ?? "start";
  node.dataset.gap = block.gap ?? "md";
  node.dataset.padding = block.padding ?? (block.tint || block.border ? "md" : "none");
  node.dataset.radius = block.radius ?? "md";
  if (block.border) node.dataset.border = "true";
  if (block.tint) node.dataset.tint = block.tint;
  for (const child of block.children) node.appendChild(context.renderChild(child));
  return node;
};

export const renderIcon: BlockRenderer<"icon"> = (block) => {
  const node = el("span", "iui-atom-icon");
  node.dataset.size = block.size ?? "md";
  if (block.tint) node.dataset.tint = block.tint;
  if (block.label) {
    node.setAttribute("role", "img");
    node.setAttribute("aria-label", block.label);
  }
  node.appendChild(icon(block.name));
  return node;
};

export const renderDivider: BlockRenderer<"divider"> = () => el("hr", "iui-divider");
