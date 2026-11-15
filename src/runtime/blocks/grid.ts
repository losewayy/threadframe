import { el } from "../core/dom.js";
import type { BlockRenderer } from "../core/types.js";

export const renderGrid: BlockRenderer<"grid"> = (block, context) => {
  const grid = el("div", "iui-layout-grid");
  grid.style.setProperty("--iui-grid-cols", String(block.columns ?? 2));
  for (const child of block.children) grid.appendChild(context.renderChild(child));
  return grid;
};
