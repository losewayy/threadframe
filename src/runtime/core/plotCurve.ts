import { el } from "./dom.js";
import { svgCanvas, svgNode, svgText } from "./svg.js";
import { evaluateNumericFormula } from "../formula.js";
import { curveSegments, sampleCurve } from "../curve.js";
import { formatNumber } from "../display.js";
import type { BlockRenderContext } from "./types.js";
import type { UiBlock } from "../../schema/uiSpec.js";

type CurvePlotBlock = Extract<UiBlock, { kind: "plot" }>;

const left = 44;
const right = 384;
const top = 30;
const bottom = 188;
const tones = ["primary", "accent", "success", "warn"] as const;

/** Function-curve view for line plots; kept out of plot.ts to respect the block line budget. */
export function renderCurvePlot(block: CurvePlotBlock, context: BlockRenderContext): HTMLElement {
  const curves = block.curves ?? [];
  const xMin = block.xMin ?? 0;
  const xMax = block.xMax ?? 1;
  const count = Math.max(2, Math.min(400, Math.trunc(block.samples ?? 80)));
  const unit = block.unit ? ` ${block.unit}` : "";
  const format = (value: number) => formatNumber(value, block.precision);
  const wrap = el("div", "iui-plot line iui-curve-plot");
  const canvas = svgCanvas(400, 240, block.title ?? "Function plot");
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
  const xTicks = [xMin, (xMin + xMax) / 2, xMax].map((value, index) => {
    const x = left + index / 2 * (right - left);
    const label = svgText(x, bottom + 18, format(value), "iui-plot-x-tick");
    label.setAttribute("text-anchor", index === 0 ? "start" : index === 2 ? "end" : "middle");
    canvas.appendChild(label);
    return label;
  });
  if (block.xLabel) canvas.appendChild(svgText(214, 232, block.xLabel, "iui-plot-axis-label"));
  if (block.yLabel) canvas.appendChild(svgText(left, 12, block.yLabel, "iui-plot-axis-label y"));
  const readout = el("div", "iui-plot-readout", "Hover, focus, or use arrow keys to inspect samples.");
  readout.setAttribute("role", "status");
  wrap.append(canvas, readout);

  let focused = -1;
  let series = curves.map((curve) => ({ curve, samples: sampleCurve(curve.formula, xMin, xMax, count, {}) }));
  const refresh = () => {
    if (focused < 0) {
      readout.textContent = "Hover, focus, or use arrow keys to inspect samples.";
      return;
    }
    const index = Math.min(focused, count - 1);
    readout.textContent = series.map(({ curve, samples }) => {
      const value = samples[index]?.y;
      return `${curve.label} x=${format(samples[index]?.x ?? 0)} y=${value === null || value === undefined ? "undefined" : `${format(value)}${unit}`}`;
    }).join(" | ");
  };
  const indexAt = (clientX: number) => {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width) return 0;
    return Math.max(0, Math.min(count - 1, Math.round((clientX - rect.left) / rect.width * (count - 1))));
  };
  canvas.addEventListener("pointermove", (event) => {
    focused = indexAt(event.clientX);
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
      series = curves.map((curve) => ({ curve, samples: sampleCurve(curve.formula, xMin, xMax, count, scope) }));
      const values = series.flatMap(({ samples }) => samples.flatMap((point) => point.y === null ? [] : [point.y]));
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
      references.forEach((label, index) => { label.textContent = format(min + index / 4 * span); });
      xTicks.forEach((label, index) => { label.textContent = format([xMin, (xMin + xMax) / 2, xMax][index]); });
      refresh();
    },
  });

  return wrap;
}