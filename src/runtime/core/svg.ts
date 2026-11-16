type VectorTag = "svg" | "path" | "rect" | "circle" | "line" | "text" | "title" | "polyline" | "polygon";

export function svgNode<K extends VectorTag>(tag: K, className?: string): SVGElementTagNameMap[K] {
  const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
  if (className) node.setAttribute("class", className);
  return node;
}

export function svgCanvas(width: number, height: number, label: string): SVGSVGElement {
  const canvas = svgNode("svg", "iui-vector-canvas");
  canvas.setAttribute("viewBox", `0 0 ${width} ${height}`);
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-label", label);
  const title = svgNode("title");
  title.textContent = label;
  canvas.appendChild(title);
  return canvas;
}

export function svgText(x: number, y: number, text: string, className?: string): SVGTextElement {
  const node = svgNode("text", className);
  node.setAttribute("x", String(x));
  node.setAttribute("y", String(y));
  node.textContent = text;
  return node;
}

export const vectorColors = {
  primary: "var(--iui-chart-primary)",
  accent: "var(--iui-chart-secondary)",
  success: "var(--iui-success)",
  warn: "var(--iui-warn)",
  muted: "var(--iui-muted)",
  text: "var(--iui-text)",
} as const;
