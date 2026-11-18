import { evaluateNumericSample, type VarScope } from "./formula.js";

export interface CurvePoint {
  x: number;
  y: number | null;
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
): CurvePoint[] {
  const count = Math.max(2, Math.min(400, Math.trunc(samples ?? 80)));
  const points: CurvePoint[] = [];
  for (let index = 0; index < count; index++) {
    const x = xMin + (xMax - xMin) * index / (count - 1);
    const y = evaluateNumericSample(formula, { ...scope, x });
    points.push({ x, y: Number.isFinite(y) ? y : null });
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
