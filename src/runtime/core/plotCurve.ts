import { el } from "./dom.js";
import { svgCanvas, svgNode, svgText, vectorColors } from "./svg.js";
import { evaluateNumericFormula } from "../formula.js";
import { curveSegments, sampleCurve } from "../curve.js";
import { formatNumber } from "../display.js";
import type { BlockRenderContext } from "./types.js";
import type { UiBlock } from "../../schema/uiSpec.js";

type CurvePlotBlock = Extract<UiBlock, { kind: "plot" }>;

const width = 400;
const height = 176;
const left = 54;
const right = 384;
const top = 24;
const bottom = 126;
const tones = ["primary", "accent", "success", "warn"] as const;

/** Function-curve view for line plots; kept out of plot.ts to respect the block line budget. */
export function renderCurvePlot(block: CurvePlotBlock, context: BlockRenderContext): HTMLElement {
  const curves = block.curves ?? [];
  const points = block.points ?? [];
  const variable = block.xVariable ?? "x";
  const count = Math.max(2, Math.min(400, Math.trunc(block.samples ?? 80)));
  const unit = block.unit ? ` ${block.unit}` : "";
  const format = (value: number) => formatNumber(value, block.precision);
  const wrap = el("div", "iui-plot line iui-curve-plot");
  const canvas = svgCanvas(width, height, block.title ?? "Function plot");
  canvas.setAttribute("tabindex", "0");
  canvas.setAttribute("aria-label", `${block.title ?? "Function plot"}. Use arrow keys to inspect samples.`);
  const references = Array.from({ length: 5 }, (_, index) => {
    const y = bottom - index / 4 * (bottom - top);
    const line = svgNode("line", "iui-plot-reference");
    line.setAttribute("x1", String(left));
    line.setAttribute("x2", String(right));
    line.setAttribute("y1", String(y));
    line.setAttribute("y2", String(y));
    const label = svgText(left - 8, y + 3, "", "iui-plot-y-tick");
    canvas.append(line, label);
    return label;
  });
  const paths = curves.map((curve, index) => {
    const path = svgNode("path", `iui-plot-curve ${curve.tone ?? tones[index % tones.length]}`);
    if (curve.dashed) path.classList.add("dashed");
    canvas.appendChild(path);
    return path;
  });
  const pointPath = !curves.length && points.length > 1 ? svgNode("path", "iui-plot-curve primary") : null;
  if (pointPath) canvas.appendChild(pointPath);
  const markers = points.map((point) => {
    const dot = svgNode("circle", "iui-plot-dot");
    dot.setAttribute("r", "4.5");
    dot.setAttribute("fill", vectorColors[point.tone ?? "accent"]);
    dot.setAttribute("stroke", "var(--iui-surface)");
    dot.setAttribute("stroke-width", "1.5");
    const tip = svgNode("title");
    dot.appendChild(tip);
    const label = svgText(left, top, point.label, "iui-plot-x-tick");
    label.setAttribute("text-anchor", "middle");
    canvas.append(dot, label);
    return { point, dot, tip, label };
  });
  const xTicks = [0, 0.5, 1].map((_, index) => {
    const x = left + index / 2 * (right - left);
    const label = svgText(x, bottom + 18, "", "iui-plot-x-tick");
    label.setAttribute("text-anchor", index === 0 ? "start" : index === 2 ? "end" : "middle");
    canvas.appendChild(label);
    return label;
  });
  if (block.xLabel) canvas.appendChild(svgText((left + right) / 2, 166, block.xLabel, "iui-plot-axis-label"));
  if (block.yLabel) canvas.appendChild(svgText(left, 12, block.yLabel, "iui-plot-axis-label y"));
  const readout = el("div", "iui-plot-readout", "Hover, focus, or use arrow keys to inspect samples.");
  readout.setAttribute("role", "status");
  wrap.append(canvas, readout);

  let focused = -1;
  let xMin = block.xMin ?? 0;
  let xMax = block.xMax ?? 1;
  let series = curves.map((curve) => ({ curve, samples: sampleCurve(curve.formula, xMin, xMax, count, {}, variable) }));
  let markerCoords = points.map((point) => ({ point, mx: point.x ?? 0, my: point.y ?? point.value ?? 0 }));
  const refresh = () => {
    if (focused < 0) {
      readout.textContent = markerCoords.length && !series.length
        ? markerCoords.map((m) => `${m.point.label} (${format(m.mx)}, ${format(m.my)}${unit})`).join(" | ")
        : "Hover, focus, or use arrow keys to inspect samples.";
      return;
    }
    const index = Math.min(focused, count - 1);
    readout.textContent = series.map(({ curve, samples }) => {
      const value = samples[index]?.y;
      return `${curve.label} ${variable}=${format(samples[index]?.x ?? 0)} y=${value === null || value === undefined ? "undefined" : `${format(value)}${unit}`}`;
    }).join(" | ");
  };
  const indexAt = (event: PointerEvent) => {
    const matrix = canvas.getScreenCTM();
    if (!matrix) return 0;
    const { x } = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    const progress = (x - left) / (right - left);
    return Math.max(0, Math.min(count - 1, Math.round(progress * (count - 1))));
  };
  canvas.addEventListener("pointermove", (event) => {
    focused = indexAt(event);
    refresh();
  });
  canvas.addEventListener("pointerleave", () => { focused = -1; refresh(); });
  canvas.addEventListener("focus", () => { if (focused < 0) focused = 0; refresh(); });
  canvas.addEventListener("blur", () => { focused = -1; refresh(); });
  canvas.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    if (event.key === "Home") focused = 0;
    else if (event.key === "End") focused = count - 1;
    else focused = Math.max(0, Math.min(count - 1, (focused < 0 ? 0 : focused) + (event.key === "ArrowLeft" ? -1 : 1)));
    refresh();
  });

  context.bindings.push({
    update: (scope) => {
      markerCoords = points.map((point, index) => {
        const mx = point.xFormula ? evaluateNumericFormula(point.xFormula, scope, point.x ?? index) : point.x ?? index;
        const my = point.yFormula ? evaluateNumericFormula(point.yFormula, scope, point.y ?? point.value ?? 0)
          : point.formula ? evaluateNumericFormula(point.formula, scope, point.y ?? point.value ?? 0) : point.y ?? point.value ?? 0;
        return { point, mx, my };
      });
      const xs = markerCoords.map((m) => m.mx);
      xMin = block.xMin ?? (xs.length ? Math.min(...xs) : 0);
      xMax = block.xMax ?? (xs.length ? Math.max(...xs) : 1);
      if (xMin >= xMax) xMax = xMin + 1;
      series = curves.map((curve) => ({ curve, samples: sampleCurve(curve.formula, xMin, xMax, count, scope, variable) }));
      const values = [
        ...series.flatMap(({ samples }) => samples.flatMap((point) => point.y === null ? [] : [point.y])),
        ...markerCoords.map((m) => m.my),
      ];
      const upper = block.maxFormula ? evaluateNumericFormula(block.maxFormula, scope, block.max ?? 0) : block.max ?? 0;
      const min = Math.min(0, ...values);
      const max = Math.max(1, upper, ...values);
      const span = max - min || 1;
      const xToPx = (x: number) => left + (x - xMin) / (xMax - xMin || 1) * (right - left);
      const yToPx = (y: number) => bottom - (y - min) / span * (bottom - top);
      series.forEach(({ samples }, index) => {
        const d = curveSegments(samples).map((segment) => segment
          .map((point, pointIndex) => `${pointIndex ? "L" : "M"}${xToPx(point.x)},${yToPx(point.y ?? 0)}`)
          .join(" ")).join(" ");
        paths[index].setAttribute("d", d);
      });
      if (pointPath) {
        pointPath.setAttribute("d", markerCoords.map((m, idx) => `${idx ? "L" : "M"}${xToPx(m.mx)},${yToPx(m.my)}`).join(" "));
      }
      markers.forEach((marker, idx) => {
        const { mx, my } = markerCoords[idx];
        const px = xToPx(mx);
        const py = yToPx(my);
        marker.dot.setAttribute("cx", String(px));
        marker.dot.setAttribute("cy", String(py));
        marker.label.setAttribute("x", String(Math.max(left + 14, Math.min(right - 14, px))));
        marker.label.setAttribute("y", String(Math.max(top + 10, py - 8)));
        marker.tip.textContent = `${marker.point.label}: ${variable}=${format(mx)}, y=${format(my)}${unit}`;
      });
      references.forEach((label, index) => { label.textContent = format(min + index / 4 * span); });
      xTicks.forEach((label, index) => { label.textContent = format([xMin, (xMin + xMax) / 2, xMax][index]); });
      refresh();
    },
  });

  return wrap;
}
