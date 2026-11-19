import { evaluateNumericSample, type VarScope } from "./formula.js";

export interface CurvePoint {
  x: number;
  y: number | null;
}

function hasPoleBetween(
  formula: string,
  scope: VarScope,
  variable: string,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  smallEdge = Math.min(Math.abs(ay), Math.abs(by)),
  largeEdge = Math.max(Math.abs(ay), Math.abs(by)),
  depth = 0,
): boolean {
  if (ay * by >= 0) return false;
  const midX = (ax + bx) / 2;
  const midY = evaluateNumericSample(formula, { ...scope, [variable]: midX });
  if (!Number.isFinite(midY) || Math.abs(midY) > largeEdge * 4) return true;
  if (Math.abs(midY) <= smallEdge) return false;
  if (depth >= 6) return Math.abs(midY) > smallEdge * 4;
  return midY * ay < 0
    ? hasPoleBetween(formula, scope, variable, ax, ay, midX, midY, smallEdge, largeEdge, depth + 1)
    : hasPoleBetween(formula, scope, variable, midX, midY, bx, by, smallEdge, largeEdge, depth + 1);
}

/**
 * Samples a formula over a closed domain. Invalid or non-finite samples become null
 * so renderers can break the line instead of drawing a spike back to zero.
 */
export function sampleCurve(
  formula: string,
  xMin: number,
  xMax: number,
  samples: number | undefined,
  scope: VarScope,
  variable = "x",
): CurvePoint[] {
  const count = Math.max(2, Math.min(400, Math.trunc(samples ?? 80)));
  const raw: CurvePoint[] = [];
  for (let index = 0; index < count; index++) {
    const x = xMin + (xMax - xMin) * index / (count - 1);
    const y = evaluateNumericSample(formula, { ...scope, [variable]: x });
    raw.push({ x, y: Number.isFinite(y) ? y : null });
  }
  const points: CurvePoint[] = [];
  for (let index = 0; index < raw.length; index++) {
    const current = raw[index];
    if (index > 0) {
      const prev = raw[index - 1];
      if (prev.y !== null && current.y !== null
        && hasPoleBetween(formula, scope, variable, prev.x, prev.y, current.x, current.y)) {
        points.push({ x: (prev.x + current.x) / 2, y: null });
      }
    }
    points.push(current);
  }
  return points;
}

/** Splits a sampled curve into contiguous defined segments. */
export function curveSegments(points: readonly CurvePoint[]): CurvePoint[][] {
  const segments: CurvePoint[][] = [];
  let current: CurvePoint[] = [];
  for (const point of points) {
    if (point.y === null) {
      if (current.length) segments.push(current);
      current = [];
    } else {
      current.push(point);
    }
  }
  if (current.length) segments.push(current);
  return segments;
}

export interface CurveSummaryPoint {
  label: string;
  x: number;
  y: number;
}

/** Picks start, midpoint, end, minimum and maximum for text-only summaries. */
export function curveSummary(points: readonly CurvePoint[]): CurveSummaryPoint[] {
  const valid = points.filter((point): point is CurvePoint & { y: number } => point.y !== null);
  if (!valid.length) return [];
  const middle = valid[Math.floor(valid.length / 2)];
  const min = valid.reduce((best, point) => point.y < best.y ? point : best, valid[0]);
  const max = valid.reduce((best, point) => point.y > best.y ? point : best, valid[0]);
  return [
    { label: "Start", x: valid[0].x, y: valid[0].y },
    { label: "Midpoint", x: middle.x, y: middle.y },
    { label: "End", x: valid[valid.length - 1].x, y: valid[valid.length - 1].y },
    { label: "Minimum", x: min.x, y: min.y },
    { label: "Maximum", x: max.x, y: max.y },
  ];
}
