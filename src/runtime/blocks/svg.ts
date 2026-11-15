import { el } from "../core/dom.js";
import { svgCanvas, svgNode, vectorColors } from "../core/svg.js";
import type { BlockRenderer } from "../core/types.js";
import { svgGeometry } from "../vector.js";

export const renderSvg: BlockRenderer<"svg"> = (block, context) => {
  const wrap = el("figure", "iui-svg-figure");
  const canvas = svgCanvas(block.width, block.height, block.title ?? block.caption ?? "Vector diagram");
  const nodes = block.elements.map((element) => {
    const node = svgNode(element.type);
    const outlined = element.type === "line" || element.type === "path";
    node.setAttribute("fill", element.fill ? vectorColors[element.fill] : outlined ? "none" : vectorColors.primary);
    if (element.type === "text" && !element.fill) node.setAttribute("fill", vectorColors.text);
    if (element.stroke || outlined) node.setAttribute("stroke", vectorColors[element.stroke ?? "primary"]);
    node.setAttribute("stroke-width", String(element.strokeWidth ?? 1.5));
    node.setAttribute("opacity", String(element.opacity ?? 1));
    if (element.type === "path") node.setAttribute("d", element.d);
    if (element.type === "text") node.setAttribute("text-anchor", element.textAnchor ?? "start");
    canvas.appendChild(node);
    return { element, node };
  });
  context.bindings.push({
    update: (scope) => {
      for (const { element, node } of nodes) {
        const geometry = svgGeometry(element, scope);
        for (const [key, value] of Object.entries(geometry.numbers)) {
          node.setAttribute(key === "fontSize" ? "font-size" : key, String(value));
        }
        if (geometry.text !== undefined) node.textContent = geometry.text;
      }
    },
  });
  wrap.appendChild(canvas);
  if (block.caption) wrap.appendChild(el("figcaption", "iui-vector-caption", block.caption));
  return wrap;
};
