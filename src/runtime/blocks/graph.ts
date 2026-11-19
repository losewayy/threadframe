import { el, icon } from "../core/dom.js";
import { svgCanvas, svgNode, svgText } from "../core/svg.js";
import type { BlockRenderer } from "../core/types.js";
import { evaluateFormula, evaluateNumericOrNull, type VarScope } from "../formula.js";
import { formatNumber } from "../display.js";
import { fitGraphLabel, layoutGraph } from "../graphLayout.js";

function active(expr: string, scope: VarScope): boolean {
  const value = evaluateFormula(expr, scope);
  if (value === null) return false;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0 && Number.isFinite(value);
  return value.length > 0 && value !== "false" && value !== "0";
}

export const renderGraph: BlockRenderer<"graph"> = (block, context) => {
  const { state, bindings } = context;
  const key = state.containerKey(block);
  const layout = layoutGraph(block.nodes, block.edges, block.direction);
  const wrap = el("div", "iui-graph-block");
  const viewport = el("div", "iui-graph-viewport");
  const canvas = svgCanvas(layout.width, layout.height, block.title ?? "Node graph");
  canvas.setAttribute("role", "group");
  canvas.classList.add("iui-graph");
  canvas.style.setProperty("--iui-graph-width", `${layout.width}px`);
  const byId = new Map(block.nodes.map((node) => [node.id, node]));
  const edgeViews = layout.edges.map((route) => {
    const edge = block.edges.find((candidate) => candidate.from === route.from && candidate.to === route.to);
    const path = svgNode("path", `iui-graph-edge${edge?.dashed ? " dashed" : ""}`);
    path.setAttribute("d", route.d);
    path.setAttribute("fill", "none");
    const arrow = svgNode("polygon", "iui-graph-arrow");
    arrow.setAttribute("points", route.arrow);
    canvas.append(path, arrow);
    let label: SVGTextElement | undefined;
    if (route.label) {
      label = svgText(route.labelX, route.labelY, route.label, "iui-graph-edge-label");
      label.setAttribute("text-anchor", "middle");
      canvas.appendChild(label);
    }
    return { edge, path, arrow, label };
  });
  const detail = el("div", "iui-graph-detail");
  detail.setAttribute("role", "status");
  const nodeViews = layout.nodes.map((box) => {
    const node = byId.get(box.id)!;
    const subtitle = [node.group, node.role].filter(Boolean).join(" · ");
    const group = svgNode("g", `iui-graph-node ${node.tone ?? "primary"}`);
    group.setAttribute("tabindex", "0");
    group.setAttribute("role", "button");
    group.setAttribute("aria-label", `${node.label}${subtitle ? `, ${subtitle}` : ""}`);
    const boxRect = svgNode("rect", "iui-graph-box");
    boxRect.setAttribute("x", String(box.x));
    boxRect.setAttribute("y", String(box.y));
    boxRect.setAttribute("width", String(box.width));
    boxRect.setAttribute("height", String(box.height));
    boxRect.setAttribute("rx", "12");
    group.appendChild(boxRect);
    const labelY = box.y + (subtitle || node.valueFormula ? 24 : 28);
    const iconWidth = node.icon ? 22 : 0;
    if (node.icon) {
      const pictogram = icon(node.icon);
      pictogram.classList.add("iui-graph-icon");
      pictogram.setAttribute("x", String(box.x + 12));
      pictogram.setAttribute("y", String(labelY - 13));
      pictogram.setAttribute("width", "16");
      pictogram.setAttribute("height", "16");
      group.appendChild(pictogram);
    }
    group.appendChild(svgText(box.x + 12 + iconWidth, labelY, fitGraphLabel(node.label, box.width - 24 - iconWidth), "iui-graph-label"));
    if (subtitle) group.appendChild(svgText(box.x + 12, box.y + 42, fitGraphLabel(subtitle, box.width - 24), "iui-graph-role"));
    const value = node.valueFormula
      ? svgText(box.x + 12, box.y + (subtitle ? 60 : 42), "", "iui-graph-value")
      : undefined;
    if (value) group.appendChild(value);
    group.addEventListener("click", () => selectNode(node.id));
    group.addEventListener("keydown", (event) => {
      const key = (event as KeyboardEvent).key;
      if (key !== "Enter" && key !== " ") return;
      event.preventDefault();
      selectNode(node.id);
    });
    canvas.appendChild(group);
    return { node, group, value, valueWidth: box.width - 24 };
  });
  const selectNode = (id: string) => {
    state.nodeSelections.set(key, id);
    for (const view of nodeViews) {
      const selected = view.node.id === id;
      view.group.classList.toggle("selected", selected);
      view.group.setAttribute("aria-pressed", String(selected));
      if (selected) {
        const description = view.node.detail ?? view.node.role;
        detail.hidden = !description;
        detail.textContent = description ? `${view.node.label}: ${description}` : "";
      }
    }
  };
  const initial = nodeViews.find((view) => view.node.id === state.nodeSelections.get(key)) ?? nodeViews[0];
  if (initial) selectNode(initial.node.id);
  // Draw labels last so later edge paths never strike through them.
  for (const view of edgeViews) if (view.label) canvas.appendChild(view.label);
  viewport.appendChild(canvas);
  wrap.appendChild(viewport);
  if (block.caption) wrap.appendChild(el("p", "iui-vector-caption", block.caption));
  wrap.appendChild(detail);
  bindings.push({
    update: (scope) => {
      for (const { node, value, valueWidth } of nodeViews) {
        if (value && node.valueFormula) {
          const num = evaluateNumericOrNull(node.valueFormula, scope);
          const result = num === null ? "—" : `${formatNumber(num)}${node.unit ? ` ${node.unit}` : ""}`;
          value.textContent = fitGraphLabel(result, valueWidth);
        }
      }
      for (const view of edgeViews) {
        const on = view.edge?.activeFormula ? active(view.edge.activeFormula, scope) : false;
        view.path.classList.toggle("active", on);
        view.arrow.classList.toggle("active", on);
        view.label?.classList.toggle("active", on);
      }
    },
  });
  return wrap;
};
