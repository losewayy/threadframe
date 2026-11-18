import type { IconName } from "../../schema/atoms.js";

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

const arrowDown = "M12 4v16m-5-5 5 5 5-5";
const replay = "M4 10a8 8 0 1 1 1 7M4 4v6h6";
const iconPaths: Record<IconName, string> = {
  check: "m5 12 4 4L19 6",
  arrow: arrowDown,
  replay,
  warning: "m12 3 10 18H2L12 3Zm0 6v5m0 3v.1",
  info: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 8v6m0-10v.1",
  chevron: "m9 6 6 6-6 6",
  "arrow-down": arrowDown,
  "arrow-right": "M4 12h16m-5-5 5 5-5 5",
  "arrow-up": "M12 20V4m-5 5 5-5 5 5",
  "arrow-left": "M20 12H4m5-5-5 5 5 5",
  terminal: "M5 5h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Zm2 4 3 3-3 3m6 0h4",
  monitor: "M5 4h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm7 13v4m-4 0h8",
  cpu: "M7 5h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Zm2 4h6v6H9zM9 2v3m6-3v3M9 19v3m6-3v3M2 9h3m-3 6h3m14-6h3m-3 6h3",
  database: "M20 6c0 1.7-3.6 3-8 3S4 7.7 4 6s3.6-3 8-3 8 1.3 8 3ZM4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3",
  server: "M5 4h14a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm0 9h14a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2ZM7 7.5h.1M7 16.5h.1",
  layers: "m12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5",
  power: "M12 3v9m5-7a9 9 0 1 1-10 0",
  refresh: "M20 9a8 8 0 0 0-14-3L4 9m0-5v5h5m-5 6a8 8 0 0 0 14 3l2-3m0 5v-5h-5",
  branch: "M8 7a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm0 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM16 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM8 7v10m8-8c0 5-8 1-8 7",
  command: "M9 15V6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3v-3Z",
  copy: "M9 8h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2Zm6-3a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8",
  clock: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 4v5l3 2",
  link: "m10 14 4-4m-7 2-2 2a4 4 0 0 0 6 6l3-3m-4-10 3-3a4 4 0 0 1 6 6l-2 2",
};

export function icon(kind: IconName): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.7");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.classList.add("iui-icon");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", iconPaths[kind]);
  svg.appendChild(path);
  return svg;
}

let nextId = 0;
export function uniqueId(prefix: string): string {
  return `${prefix}-${++nextId}`;
}
