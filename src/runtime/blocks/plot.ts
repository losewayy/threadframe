import { el } from "../core/dom.js";
import { svgCanvas, svgNode, svgText, vectorColors } from "../core/svg.js";
import type { BlockRenderer } from "../core/types.js";
import { evaluateNumericFormula } from "../formula.js";
import { plotCenter, plotValues } from "../vector.js";
import { formatNumber } from "../display.js";

export const renderPlot: BlockRenderer<"plot"> = (block, context) => {
  const wrap = el("div", `iui-plot ${block.mode}`);
  const unit = block.unit ? ` ${block.unit}` : "";
  const canvas = svgCanvas(400, 240, block.title ?? `${block.mode} plot`);
  const tones = ["primary", "accent", "success", "warn"] as const;
  const colors = block.points.map((point, index) => vectorColors[point.tone ?? tones[index % tones.length]]);
  const format = (value: number) => formatNumber(value, block.precision);
  const readout = el("div", "iui-plot-readout", "Hover or focus a value to inspect it.");
  readout.setAttribute("role", "status");
  const targets: SVGElement[] = [];
  let numbers: number[] = [];
  let focused = -1;
  const refresh = () => {
    targets.forEach((node, index) => node.setAttribute("aria-label", `${block.points[index].label}: ${format(numbers[index])}${unit}`));
    readout.textContent = focused < 0 ? "Hover or focus a value to inspect it."
      : `${block.points[focused].label}: ${format(numbers[focused])}${unit}`;
  };
  const interactive = (node: SVGElement, index: number) => {
    targets[index] = node;
    node.setAttribute("tabindex", "0");
    node.setAttribute("role", "img");
    const show = () => { focused = index; refresh(); };
    const hide = () => { if (document.activeElement !== node) { focused = -1; refresh(); } };
    node.addEventListener("mouseenter", show);
    node.addEventListener("focus", show);
    node.addEventListener("mouseleave", hide);
    node.addEventListener("blur", () => { focused = -1; refresh(); });
  };

  if (block.mode === "donut") {
    const track = svgNode("circle", "iui-donut-track");
    track.setAttribute("cx", "200");
    track.setAttribute("cy", "110");
    track.setAttribute("r", "74");
    canvas.appendChild(track);
    const rings = block.points.map((_, index) => {
      const ring = svgNode("circle", "iui-donut-segment");
      ring.setAttribute("cx", "200");
      ring.setAttribute("cy", "110");
      ring.setAttribute("r", "74");
      ring.setAttribute("pathLength", "100");
      ring.setAttribute("stroke", colors[index]);
      ring.setAttribute("transform", "rotate(-90 200 110)");
      canvas.appendChild(ring);
      interactive(ring, index);
      return ring;
    });
    const totalText = svgText(200, 110, "", "iui-donut-total");
    const totalLabel = svgText(200, 132, block.centerLabel ?? "Total", "iui-donut-label");
    canvas.append(totalText, totalLabel);
    wrap.appendChild(canvas);
    const legend = el("div", "iui-legend");
    const values = block.points.map((point, index) => {
      const item = el("span", "iui-legend-item");
      const swatch = el("span", "iui-swatch");
      swatch.style.background = colors[index];
      const value = el("strong");
      item.append(swatch, el("span", undefined, point.label), value);
      legend.appendChild(item);
      return value;
    });
    wrap.append(legend, readout);
    context.bindings.push({ update: (scope) => {
      numbers = plotValues(block.points, scope).map((value) => Math.max(0, value));
      const total = numbers.reduce((sum, value) => sum + value, 0);
      const limit = block.maxFormula ? evaluateNumericFormula(block.maxFormula, scope, block.max ?? total) : block.max ?? total;
      const capacity = Math.max(total, limit, 0.0001);
      let offset = 0;
      rings.forEach((ring, index) => {
        const share = numbers[index] / capacity * 100;
        const gap = share > 0 && share < 100 ? Math.min(1, share / 3) : 0;
        ring.setAttribute("stroke-dasharray", `${Math.max(0, share - gap)} ${100 - Math.max(0, share - gap)}`);
        ring.setAttribute("stroke-dashoffset", String(-offset));
        ring.setAttribute("visibility", share > 0 ? "visible" : "hidden");
        offset += share;
        values[index].textContent = `${format(numbers[index])}${unit}`;
      });
      totalText.textContent = `${format(plotCenter(block, scope, total))}${unit}`;
      refresh();
    } });
    return wrap;
  }

  const left = 44, right = 384, top = 30, bottom = 188;
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
  const area = svgNode("path", "iui-plot-area");
  const line = svgNode("path", "iui-plot-line");
  canvas.append(area, line);
  const dots = block.points.map((point, index) => {
    const dot = svgNode(block.mode === "bar" ? "rect" : "circle", block.mode === "bar" ? "iui-plot-bar" : "iui-plot-dot");
    if (block.mode === "bar") dot.setAttribute("rx", "3");
    else dot.setAttribute("r", "3.5");
    dot.setAttribute("fill", block.mode === "bar" || point.tone ? colors[index] : vectorColors.primary);
    const title = svgNode("title");
    dot.appendChild(title);
    canvas.appendChild(dot);
    interactive(dot, index);
    const x = block.mode === "bar" ? left + (index + 0.5) / block.points.length * (right - left)
      : left + index / Math.max(1, block.points.length - 1) * (right - left);
    const label = svgText(x, bottom + 18, point.label, "iui-plot-x-tick");
    label.setAttribute("text-anchor", index === 0 ? "start" : index === block.points.length - 1 ? "end" : "middle");
    // Keep dense series readable without dropping their points or tooltip values.
    if (index === 0 || index === block.points.length - 1 || index % Math.ceil(block.points.length / 6) === 0) {
      canvas.appendChild(label);
    }
    return { dot, title, x };
  });
  if (block.xLabel) canvas.appendChild(svgText(214, 232, block.xLabel, "iui-plot-axis-label"));
  if (block.yLabel) canvas.appendChild(svgText(left, 12, block.yLabel, "iui-plot-axis-label y"));
  context.bindings.push({ update: (scope) => {
    const values = plotValues(block.points, scope);
    numbers = values;
    const upper = block.maxFormula ? evaluateNumericFormula(block.maxFormula, scope, block.max ?? 0) : block.max ?? 0;
    const min = Math.min(0, ...values);
    const max = Math.max(1, upper, ...values);
    const span = max - min;
    const y = (value: number) => bottom - (value - min) / span * (bottom - top);
    const path = values.map((value, index) => `${index ? "L" : "M"}${dots[index].x},${y(value)}`).join(" ");
    if (block.mode === "line") {
      line.setAttribute("d", path);
      area.setAttribute("d", `${path} L${dots[dots.length - 1].x},${y(0)} L${dots[0].x},${y(0)} Z`);
    }
    dots.forEach(({ dot, title, x }, index) => {
      if (block.mode === "bar") {
        const width = (right - left) / dots.length * 0.6;
        dot.setAttribute("x", String(x - width / 2));
        dot.setAttribute("y", String(Math.min(y(0), y(values[index]))));
        dot.setAttribute("width", String(width));
        dot.setAttribute("height", String(Math.abs(y(0) - y(values[index]))));
      } else {
        dot.setAttribute("cx", String(x));
        dot.setAttribute("cy", String(y(values[index])));
      }
      title.textContent = `${block.points[index].label}: ${format(values[index])}${unit}`;
    });
    references.forEach((label, index) => { label.textContent = format(min + index / 4 * span); });
    refresh();
  } });
  wrap.append(canvas, readout);
  return wrap;
};
