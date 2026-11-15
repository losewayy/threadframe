export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function icon(kind: "check" | "arrow" | "replay" | "warning"): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.7");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  svg.classList.add("iui-icon");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", {
    check: "m5 12 4 4L19 6",
    arrow: "M12 3v18m-5-5 5 5 5-5",
    replay: "M4 10a8 8 0 1 1 1 7M4 4v6h6",
    warning: "m12 3 10 18H2L12 3Zm0 6v5m0 3v.1",
  }[kind]);
  svg.appendChild(path);
  return svg;
}
