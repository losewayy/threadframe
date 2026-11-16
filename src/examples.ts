import type { UiSpec } from "./schema/uiSpec.js";

export const SVG_EXAMPLES: Record<string, UiSpec> = {
  capacity: {
    title: "Capacity allocation", subtitle: "Illustrative units, not measured memory usage.",
    blocks: [
      { kind: "controls", controls: [{ kind: "slider", id: "used", label: "Used", min: 0, max: 12, defaultValue: 4 }] },
      { kind: "stats", items: [{ label: "Used", formula: "used", unit: "GB" }] },
      { kind: "svg", width: 280, height: 64, elements: [
        { type: "rect", x: 10, y: 8, width: 240, height: 20, rx: 4, fill: "muted", opacity: 0.2 },
        { type: "rect", x: 10, y: 8, widthFormula: "used * 20", height: 20, rx: 4, fill: "primary" },
        { type: "text", x: 10, y: 52, textFormula: "used + ' / 12 GB'", fontSize: 14 },
      ] },
    ],
  },
  flow: {
    title: "Request flow", blocks: [{ kind: "svg", width: 300, height: 100, elements: [
      { type: "rect", x: 10, y: 20, width: 90, height: 40, rx: 5, fill: "primary", opacity: 0.25 },
      { type: "text", x: 55, y: 45, text: "Request", textAnchor: "middle", fontSize: 13 },
      { type: "line", x1: 110, y1: 40, x2: 180, y2: 40, stroke: "muted", strokeWidth: 2 },
      { type: "polygon", points: "180,35 188,40 180,45", fill: "muted" },
      { type: "rect", x: 198, y: 20, width: 90, height: 40, rx: 5, fill: "accent", opacity: 0.25 },
      { type: "text", x: 243, y: 45, text: "Worker", textAnchor: "middle", fontSize: 13 },
    ] }],
  },
  size: {
    title: "Reactive dimensions", blocks: [
      { kind: "controls", controls: [{ kind: "slider", id: "size", label: "Size", min: 10, max: 100, defaultValue: 40 }] },
      { kind: "svg", width: 240, height: 140, elements: [
        { type: "rect", x: 10, y: 10, widthFormula: "size * 2", heightFormula: "size", rx: 4, fill: "success", opacity: 0.5 },
        { type: "text", x: 10, y: 130, textFormula: "size * 2 + ' × ' + size", fontSize: 14 },
      ] },
    ],
  },
};
