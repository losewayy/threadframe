import { el } from "../core/dom.js";
import { svgCanvas, svgNode, svgText, vectorColors } from "../core/svg.js";
import type { BlockRenderer } from "../core/types.js";
import { evaluateNumericFormula } from "../formula.js";
import { plotCenter, plotValues } from "../vector.js";

export const renderPlot: BlockRenderer<"plot"> = (block, context) => {
  const wrap = el("div", `iui-plot ${block.mode}`);
  const unit = block.unit ? ` ${block.unit}` : "";
  const canvas = svgCanvas(400, 240, block.title ?? `${block.mode} plot`);
  const tones = ["primary", "accent", "success", "warn"] as const;
  const colors = block.points.map((point, index) => vectorColors[point.tone ?? tones[index % tones.length]]);

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
    wrap.appendChild(legend);
    context.bindings.push({ update: (scope) => {
      const numbers = plotValues(block.points, scope).map((value) => Math.max(0, value));
      const total = numbers.reduce((sum, value) => sum + value, 0);
      let offset = 0;
      rings.forEach((ring, index) => {
        const share = total > 0 ? numbers[index] / total * 100 : 0;
        const gap = share > 0 && share < 100 ? Math.min(1, share / 3) : 0;
        ring.setAttribute("stroke-dasharray", `${Math.max(0, share - gap)} ${100 - Math.max(0, share - gap)}`);
        ring.setAttribute("stroke-dashoffset", String(-offset));
        ring.setAttribute("visibility", share > 0 ? "visible" : "hidden");
        offset += share;
        values[index].textContent = `${numbers[index]}${unit}`;
      });
      totalText.textContent = `${plotCenter(block, scope, total)}${unit}`;
    } });
    return wrap;
  }

  const left = 44, right = 384, top = 18, bottom = 188;
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
    const dot = svgNode("circle", "iui-plot-dot");
    dot.setAttribute("r", "3.5");
    dot.setAttribute("fill", point.tone ? colors[index] : vectorColors.primary);
    const title = svgNode("title");
    dot.appendChild(title);
    canvas.appendChild(dot);
    const x = left + index / Math.max(1, block.points.length - 1) * (right - left);
    const label = svgText(x, bottom + 18, point.label, "iui-plot-x-tick");
    label.setAttribute("text-anchor", index === 0 ? "start" : index === block.points.length - 1 ? "end" : "middle");
    // Keep dense series readable without dropping their points or tooltip values.
    if (index === 0 || index === block.points.length - 1 || index % Math.ceil(block.points.length / 6) === 0) {
      canvas.appendChild(label);
    }
    return { dot, title, x };
  });
  if (block.xLabel) canvas.appendChild(svgText(214, 232, block.xLabel, "iui-plot-axis-label"));
  if (block.yLabel) canvas.appendChild(svgText(left, 10, block.yLabel, "iui-plot-axis-label y"));
  context.bindings.push({ update: (scope) => {
    const values = plotValues(block.points, scope);
    const upper = block.maxFormula ? evaluateNumericFormula(block.maxFormula, scope, block.max ?? 0) : block.max ?? 0;
    const min = Math.min(0, ...values);
    const max = Math.max(1, upper, ...values);
    const span = max - min;
    const y = (value: number) => bottom - (value - min) / span * (bottom - top);
    const path = values.map((value, index) => `${index ? "L" : "M"}${dots[index].x},${y(value)}`).join(" ");
    line.setAttribute("d", path);
    area.setAttribute("d", `${path} L${dots[dots.length - 1].x},${y(0)} L${dots[0].x},${y(0)} Z`);
    dots.forEach(({ dot, title, x }, index) => {
      dot.setAttribute("cx", String(x));
      dot.setAttribute("cy", String(y(values[index])));
      title.textContent = `${block.points[index].label}: ${values[index]}${unit}`;
    });
    references.forEach((label, index) => { label.textContent = String(Math.round((min + index / 4 * span) * 100) / 100); });
  } });
  wrap.appendChild(canvas);
  return wrap;
};
