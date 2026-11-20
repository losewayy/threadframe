import { el } from "./dom.js";
import { svgCanvas, svgNode, svgText, vectorColors } from "./svg.js";
import { evaluateNumericFormula } from "../formula.js";
import { curveSegments, sampleCurve, type CurvePoint } from "../curve.js";
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
  const clipId = `iui-clip-${Math.random().toString(36).slice(2, 9)}`;
  const defs = svgNode("defs");
  const clip = svgNode("clipPath");
  clip.setAttribute("id", clipId);
  const clipRect = svgNode("rect");
  clipRect.setAttribute("x", String(left));
  clipRect.setAttribute("y", String(top));
  clipRect.setAttribute("width", String(right - left));
  clipRect.setAttribute("height", String(bottom - top));
  clip.appendChild(clipRect);
  defs.appendChild(clip);
  canvas.appendChild(defs);
  const curveGroup = svgNode("g");
  curveGroup.setAttribute("clip-path", `url(#${clipId})`);
  canvas.appendChild(curveGroup);
  const baselineGroup = svgNode("g");
  curveGroup.appendChild(baselineGroup);
  const paths = curves.map((curve, index) => {
    const path = svgNode("path", `iui-plot-curve ${curve.tone ?? tones[index % tones.length]}`);
    if (curve.dashed) path.classList.add("dashed");
    curveGroup.appendChild(path);
    return path;
  });
  const pointPath = block.mode === "line" && !curves.length && points.length > 1
    ? svgNode("path", "iui-plot-curve primary") : null;
  if (pointPath) curveGroup.appendChild(pointPath);
  let lastYMin = block.yMin ?? 0;
  let lastYMax = block.yMax ?? 1;
  let draggingIdx = -1;
  let dragBounds: { xMin: number; xMax: number; yMin: number; yMax: number } | null = null;
  let xMin = block.xMin ?? 0;
  let xMax = block.xMax ?? 1;
  const snapClamp = (id: string, raw: number, fallbackLo: number, fallbackHi: number): number => {
    const bounds = context.state.getSliderBounds?.(id);
    const lo = bounds?.min ?? fallbackLo;
    const hi = bounds?.max ?? fallbackHi;
    const clamped = Math.min(Math.max(lo, hi), Math.max(Math.min(lo, hi), raw));
    if (bounds?.step && bounds.step > 0) {
      return Number((bounds.min + Math.round((clamped - bounds.min) / bounds.step) * bounds.step).toFixed(6));
    }
    return Math.round(clamped * 100) / 100;
  };
  const svgCoords = (event: PointerEvent) => {
    const matrix = canvas.getScreenCTM();
    if (!matrix) return null;
    return new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
  };
  const applyDrag = (idx: number, event: PointerEvent) => {
    const pt = points[idx];
    const bounds = dragBounds;
    const pos = svgCoords(event);
    if (!pt || !bounds || !pos) return;
    let changed = false;
    if (pt.xVar) {
      const rawX = bounds.xMin + (pos.x - left) / (right - left) * (bounds.xMax - bounds.xMin);
      context.state.scope[pt.xVar] = snapClamp(pt.xVar, rawX, bounds.xMin, bounds.xMax);
      changed = true;
    }
    if (pt.yVar) {
      const rawY = bounds.yMin + (bottom - pos.y) / (bottom - top) * (bounds.yMax - bounds.yMin);
      context.state.scope[pt.yVar] = snapClamp(pt.yVar, rawY, bounds.yMin, bounds.yMax);
      changed = true;
    }
    if (changed) context.state.notifyScopeChange();
  };
  const markers = points.map((point, idx) => {
    const draggable = Boolean(point.xVar || point.yVar);
    const dot = svgNode("circle", draggable ? "iui-plot-dot draggable" : "iui-plot-dot");
    dot.setAttribute("r", draggable ? "6" : "4.5");
    dot.setAttribute("fill", vectorColors[point.tone ?? "accent"]);
    dot.setAttribute("stroke", "var(--iui-surface)");
    dot.setAttribute("stroke-width", "1.5");
    if (draggable) {
      dot.setAttribute("tabindex", "0");
      dot.setAttribute("role", "slider");
      dot.setAttribute("aria-label", `${point.label} (drag or use arrow keys)`);
      dot.addEventListener("pointerdown", (rawEvent) => {
        const event = rawEvent as PointerEvent;
        event.stopPropagation();
        draggingIdx = idx;
        dragBounds = { xMin, xMax, yMin: lastYMin, yMax: lastYMax };
        (dot as unknown as { setPointerCapture?: (id: number) => void }).setPointerCapture?.(event.pointerId);
        applyDrag(idx, event);
      });
      dot.addEventListener("pointermove", (rawEvent) => {
        if (draggingIdx === idx) applyDrag(idx, rawEvent as PointerEvent);
      });
      const stopDrag = () => { draggingIdx = -1; dragBounds = null; };
      dot.addEventListener("pointerup", stopDrag);
      dot.addEventListener("pointercancel", stopDrag);
      dot.addEventListener("keydown", (rawEvent) => {
        const event = rawEvent as KeyboardEvent;
        const dx = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
        const dy = event.key === "ArrowUp" ? 1 : event.key === "ArrowDown" ? -1 : 0;
        if (!dx && !dy) return;
        event.preventDefault();
        event.stopPropagation();
        if (dx && point.xVar) {
          const step = context.state.getSliderBounds?.(point.xVar)?.step || (xMax - xMin) / 20;
          context.state.scope[point.xVar] = snapClamp(point.xVar, Number(context.state.scope[point.xVar] ?? 0) + dx * step, xMin, xMax);
        }
        if (dy && point.yVar) {
          const step = context.state.getSliderBounds?.(point.yVar)?.step || (lastYMax - lastYMin) / 20;
          context.state.scope[point.yVar] = snapClamp(point.yVar, Number(context.state.scope[point.yVar] ?? 0) + dy * step, lastYMin, lastYMax);
        }
        context.state.notifyScopeChange();
      });
    }
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
  let baselineSeries: CurvePoint[][] | null = null;
  let baselinePaths: SVGPathElement[] = [];
  let upperBound = block.max ?? 0;
  let focused = -1;
  let series = curves.map((curve) => ({ curve, samples: sampleCurve(curve.formula, xMin, xMax, count, {}, variable) }));
  let markerCoords = points.map((point) => ({ point, mx: point.x ?? 0, my: point.y ?? point.value ?? 0 }));
  if (block.baseline && curves.length) {
    const toolbar = el("div", "iui-plot-toolbar");
    const freezeText = context.state.zh ? "留作对照曲线" : "Freeze baseline";
    const clearText = context.state.zh ? "清除对照" : "Clear baseline";
    const btn = el("button", "iui-action-btn secondary", freezeText);
    btn.type = "button";
    btn.setAttribute("aria-pressed", "false");
    btn.addEventListener("click", () => {
      if (baselineSeries) {
        baselineSeries = null;
        btn.textContent = freezeText;
        btn.setAttribute("aria-pressed", "false");
      } else {
        baselineSeries = series.map(({ samples }) => samples.map((point) => ({ ...point })));
        btn.textContent = clearText;
        btn.setAttribute("aria-pressed", "true");
      }
      drawGeometry();
    });
    toolbar.appendChild(btn);
    wrap.appendChild(toolbar);
  }
  wrap.append(canvas, readout);

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
  const drawGeometry = () => {
    const values = [
      ...series.flatMap(({ samples }) => samples.flatMap((point) => point.y === null ? [] : [point.y])),
      ...(baselineSeries ?? []).flatMap((samples) => samples.flatMap((point) => point.y === null ? [] : [point.y])),
      ...markerCoords.map((m) => m.my),
    ];
    let min = dragBounds ? dragBounds.yMin : (block.yMin ?? Math.min(0, ...values));
    let max = dragBounds ? dragBounds.yMax : (block.yMax ?? Math.max(1, upperBound, ...values));
    if (min >= max) max = min + 1;
    lastYMin = min;
    lastYMax = max;
    const span = max - min || 1;
    const xToPx = (x: number) => left + (x - xMin) / (xMax - xMin || 1) * (right - left);
    const yToPx = (y: number) => bottom - (y - min) / span * (bottom - top);
    const pathD = (samples: CurvePoint[]) => curveSegments(samples).map((segment) => segment
      .map((point, pointIndex) => `${pointIndex ? "L" : "M"}${xToPx(point.x)},${yToPx(point.y ?? 0)}`)
      .join(" ")).join(" ");
    if (!baselineSeries?.length) {
      for (const path of baselinePaths) path.remove();
      baselinePaths = [];
    } else {
      while (baselinePaths.length < baselineSeries.length) {
        const path = svgNode("path", "iui-plot-curve dashed baseline");
        baselineGroup.appendChild(path);
        baselinePaths.push(path);
      }
      baselineSeries.forEach((samples, index) => baselinePaths[index].setAttribute("d", pathD(samples)));
    }
    series.forEach(({ samples }, index) => paths[index].setAttribute("d", pathD(samples)));
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
        const mx = point.xFormula ? evaluateNumericFormula(point.xFormula, scope, point.x ?? index)
          : point.xVar ? Number(scope[point.xVar] ?? point.x ?? index) : point.x ?? index;
        const my = point.yFormula ? evaluateNumericFormula(point.yFormula, scope, point.y ?? point.value ?? 0)
          : point.formula ? evaluateNumericFormula(point.formula, scope, point.y ?? point.value ?? 0)
          : point.yVar ? Number(scope[point.yVar] ?? point.y ?? point.value ?? 0) : point.y ?? point.value ?? 0;
        return { point, mx, my };
      });
      const xs = markerCoords.map((m) => m.mx);
      xMin = dragBounds ? dragBounds.xMin : (block.xMin ?? (xs.length ? Math.min(...xs) : 0));
      xMax = dragBounds ? dragBounds.xMax : (block.xMax ?? (xs.length ? Math.max(...xs) : 1));
      if (xMin >= xMax) xMax = xMin + 1;
      series = curves.map((curve) => ({ curve, samples: sampleCurve(curve.formula, xMin, xMax, count, scope, variable) }));
      upperBound = block.maxFormula ? evaluateNumericFormula(block.maxFormula, scope, block.max ?? 0) : block.max ?? 0;
      drawGeometry();
      refresh();
    },
  });

  return wrap;
}
