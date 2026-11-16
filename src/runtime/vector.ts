import type { PlotBlock, PlotPoint, SvgElement } from "../schema/vector.js";
import { evaluateFormula, evaluateNumericFormula, type VarScope } from "./formula.js";

export function plotValues(points: readonly PlotPoint[], scope: VarScope): number[] {
  return points.map((point) => point.formula
    ? evaluateNumericFormula(point.formula, scope, point.value ?? 0) : point.value ?? 0);
}

export function plotCenter(block: PlotBlock, scope: VarScope, total: number): number {
  return block.centerFormula ? evaluateNumericFormula(block.centerFormula, scope, total) : total;
}

// Only these geometry fields can reach the SVG DOM, regardless of input object keys.
const coordinates = {
  rect: ["x", "y", "width", "height", "rx"],
  circle: ["cx", "cy", "r"],
  line: ["x1", "y1", "x2", "y2"],
  path: [],
  polyline: [],
  polygon: [],
  text: ["x", "y", "fontSize"],
} as const;

export function svgGeometry(element: SvgElement, scope: VarScope): {
  numbers: Record<string, number>;
  text?: string;
} {
  const numbers: Record<string, number> = {};
  const values: Record<string, unknown> = { ...element };
  for (const key of coordinates[element.type]) {
    const fallback = typeof values[key] === "number" ? values[key] : key === "fontSize" ? 12 : 0;
    const formula = values[`${key}Formula`];
    const number = typeof formula === "string" ? evaluateNumericFormula(formula, scope, fallback) : fallback;
    numbers[key] = ["width", "height", "rx", "r", "fontSize"].includes(key) ? Math.max(0, number) : number;
  }
  if (element.type !== "text") return { numbers };
  const value = element.textFormula ? evaluateFormula(element.textFormula, scope) : null;
  const valid = value !== null && (typeof value !== "number" || Number.isFinite(value));
  return { numbers, text: valid ? String(value) : element.text ?? "" };
}
