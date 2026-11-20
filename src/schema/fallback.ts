import { evaluateFormula, evaluateNumericFormula, evaluateNumericOrNull, type VarScope } from "../runtime/formula.js";
import { plotCenter, plotValues, svgGeometry } from "../runtime/vector.js";
import { formatNumber, statDisplay, interpolateCode } from "../runtime/display.js";
import { curveSummary, sampleCurve } from "../runtime/curve.js";
import { formatCell, resolveCell } from "../runtime/table.js";
import type { IconName } from "./atoms.js";
import { escapeMarkdownText, inlineTextMarkdown, markdownCodeSpan } from "./inlineText.js";
import { declaredPlotVars, declaredSelectVars, walkBlocks, type LayoutSummary, type UiBlock, type UiSpec } from "./uiSpec.js";

const inline = (text: string) => escapeMarkdownText(text.replace(/\r\n?|\n/g, " "));
const unit = (text?: string) => text ? ` ${inline(text)}` : "";
const iconGlyphs: Partial<Record<IconName, string>> = {
  arrow: "↓", "arrow-down": "↓", "arrow-up": "↑", "arrow-left": "←", "arrow-right": "→",
  check: "✓", warning: "⚠", info: "ℹ",
};

function initialScopeForSpec(spec: Partial<UiSpec>): VarScope {
  const scope: VarScope = Object.create(null);
  const blocks = spec.blocks ?? [];
  walkBlocks(blocks, (block) => {
    if (block.kind === "controls") {
      for (const ctrl of block.controls) {
        scope[ctrl.id] = ctrl.defaultValue;
      }
    }
  });
  for (const [id, selected] of declaredSelectVars(blocks)) {
    if (!(id in scope)) scope[id] = selected.initial;
  }
  for (const [id, plotted] of declaredPlotVars(blocks)) {
    if (!(id in scope)) scope[id] = plotted.initial;
  }
  for (const item of spec.vars ?? []) {
    const val = evaluateFormula(item.formula, scope);
    if (val !== null && !(typeof val === "number" && !Number.isFinite(val))) {
      scope[item.id] = val;
    }
  }
  return scope;
}

function formatBlockMarkdown(block: UiBlock, scope: VarScope): string[] {
  const lines: string[] = [];
  if ("title" in block && block.title) {
    lines.push(`### ${inline(block.title)}`);
  }

  switch (block.kind) {
    case "title":
      lines.push(`### ${inlineTextMarkdown(block.text.replace(/\r\n?|\n/g, " "), scope)}`);
      break;
    case "text":
    case "caption":
      lines.push(inlineTextMarkdown(block.text, scope));
      break;
    case "badge":
      lines.push(`[${inlineTextMarkdown(block.text.replace(/\r\n?|\n/g, " "), scope)}]`);
      break;
    case "divider":
      lines.push("---");
      break;
    case "icon":
      lines.push(block.label ? inline(block.label) : iconGlyphs[block.name] ?? `[${block.name}]`);
      break;
    case "stats": {
      for (const item of block.items) {
        const display = statDisplay(item, scope);
        lines.push(`- ${inline(item.label)}: ${inline(display.value)}${unit(item.unit)}${display.delta !== undefined ? ` (${inline(display.delta)})` : ""}${display.warning ? " [warn]" : ""}`);
      }
      break;
    }
    case "timeline": {
      for (const step of block.steps) {
        lines.push(`- [${step.status}] ${inline(step.title)}${step.meta ? ` (${inline(step.meta)})` : ""}${step.detail ? `: ${inline(step.detail)}` : ""}`);
      }
      break;
    }
    case "code": {
      const code = interpolateCode(block.template ?? block.code ?? "", scope);
      let fenceLength = 3;
      for (const [run] of code.matchAll(/`+/g)) fenceLength = Math.max(fenceLength, run.length + 1);
      const fence = "`".repeat(fenceLength);
      lines.push(`${fence}${block.language ?? ""}`, code, fence);
      const evaluated = block.activeLineFormula ? evaluateNumericOrNull(block.activeLineFormula, scope) : null;
      const activeLine = evaluated !== null ? Math.trunc(evaluated) : block.activeLine;
      if (activeLine && activeLine > 0) lines.push(`_Active line: ${activeLine}_`);
      if (block.caption) lines.push(escapeMarkdownText(block.caption));
      break;
    }
    case "actions": {
      lines.push(`- Actions: ${block.buttons.map((button) => `[${inline(button.label)}]`).join(" ")}`);
      break;
    }
    case "bits": {
      const total = block.fields.reduce((sum, field) => sum + field.bits, 0);
      let cursor = block.lsbFirst ? 0 : total - 1;
      for (const field of block.fields) {
        const start = cursor;
        const end = block.lsbFirst ? cursor + field.bits - 1 : cursor - field.bits + 1;
        cursor = block.lsbFirst ? end + 1 : end - 1;
        const range = field.bits === 1 ? `${start}` : `${start}:${end}`;
        const raw = field.formula ? evaluateFormula(field.formula, scope) : field.value;
        const val = raw === null || raw === undefined ? "" : ` = ${typeof raw === "number" ? formatNumber(raw) : inline(String(raw))}`;
        lines.push(`- [${range}] **${inline(field.label)}** (${field.bits}b)${val}${field.detail ? `: ${inline(field.detail)}` : ""}`);
      }
      if (block.caption) lines.push(escapeMarkdownText(block.caption));
      break;
    }
    case "plot": {
      const formatPoint = (point: NonNullable<typeof block.points>[number], variable: string) => {
        const px = point.xFormula ? evaluateNumericFormula(point.xFormula, scope, point.x ?? 0)
          : point.xVar ? Number(scope[point.xVar] ?? point.x ?? 0) : point.x ?? 0;
        const py = point.yFormula ? evaluateNumericFormula(point.yFormula, scope, 0)
          : point.formula ? evaluateNumericFormula(point.formula, scope, point.y ?? point.value ?? 0)
          : point.yVar ? Number(scope[point.yVar] ?? point.y ?? point.value ?? 0) : point.y ?? point.value ?? 0;
        return `- **${inline(point.label)}**: ${variable}=${formatNumber(px, block.precision)}, y=${formatNumber(py, block.precision)}${unit(block.unit)}`;
      };
      if (block.curves?.length) {
        const variable = inline(block.xVariable ?? "x");
        for (const curve of block.curves) {
          const label = inline(curve.label);
          const samples = sampleCurve(curve.formula, block.xMin ?? 0, block.xMax ?? 1, block.samples, scope, block.xVariable);
          const summary = curveSummary(samples);
          lines.push(`- ${label}: ${markdownCodeSpan(curve.formula)}`);
          if (!summary.length) {
            lines.push(`- ${label}: no finite sample between ${block.xMin} and ${block.xMax}`);
            continue;
          }
          lines.push(`  | Point | ${variable} | ${label} |`, "  | --- | --- | --- |");
          for (const point of summary) {
            lines.push(`  | ${point.label} | ${formatNumber(point.x, block.precision)} | ${formatNumber(point.y, block.precision)}${unit(block.unit)} |`);
          }
        }
        for (const point of block.points ?? []) lines.push(formatPoint(point, variable));
        break;
      }
      if (block.mode === "scatter"
        || (block.mode === "line" && block.points?.some((point) => point.x !== undefined || point.xFormula !== undefined || point.xVar !== undefined))) {
        const variable = inline(block.xVariable ?? "x");
        for (const point of block.points ?? []) lines.push(formatPoint(point, variable));
        break;
      }
      const circular = block.mode === "donut" || block.mode === "pie";
      const values = plotValues(block.points ?? [], scope).map((value) => circular ? Math.max(0, value) : value);
      const total = values.reduce((sum, value) => sum + value, 0);
      block.points?.forEach((point, index) => {
        const pct = block.mode === "pie" && total > 0 ? ` (${(values[index] / total * 100).toFixed(1)}%)` : "";
        lines.push(`- ${inline(point.label)}: ${formatNumber(values[index], block.precision)}${unit(block.unit)}${pct}`);
      });
      if (block.mode === "donut") {
        const center = formatNumber(plotCenter(block, scope, total), block.precision);
        lines.push(`- ${inline(block.centerLabel ?? "Total")}: ${center}${unit(block.unit)}`);
      }
      break;
    }
    case "svg": {
      if (block.caption) lines.push(escapeMarkdownText(block.caption));
      lines.push(`Vector canvas: ${block.width} × ${block.height}`);
      for (const element of block.elements) {
        const geometry = svgGeometry(element, scope);
        const summary = Object.entries(geometry.numbers).map(([key, value]) => `${key}=${value}`).join(", ");
        const text = geometry.text ?? (element.type === "path" ? element.d : "points" in element ? element.points : summary);
        lines.push(`- ${element.type}: ${inline(text)}`);
      }
      break;
    }
    case "callout": {
      lines.push(`> [${block.tone ?? "info"}] ${escapeMarkdownText(block.body)}`);
      for (const item of block.items ?? []) lines.push(`> - ${inline(item)}`);
      break;
    }
    case "grid":
    case "box": {
      for (const child of block.children) lines.push("", ...formatBlockMarkdown(child, scope));
      break;
    }
    case "tabs": {
      for (const tab of block.tabs) {
        lines.push("", `#### [Tab: ${inline(tab.label)}]`);
        for (const child of tab.children) lines.push("", ...formatBlockMarkdown(child, scope));
      }
      break;
    }
    case "accordion": {
      for (const item of block.items) {
        lines.push("", `#### ${inline(item.title)}`);
        if (item.summary) lines.push(escapeMarkdownText(item.summary));
        for (const child of item.children) lines.push("", ...formatBlockMarkdown(child, scope));
      }
      break;
    }
    case "choices": {
      for (const opt of block.options) {
        lines.push(`- **${inline(opt.label)}**${opt.description ? `: ${inline(opt.description)}` : ""}`);
      }
      break;
    }
    case "controls": {
      for (const ctrl of block.controls) {
        const suffix = ctrl.kind === "slider" && ctrl.unit ? ` ${ctrl.unit}` : "";
        lines.push(`- ${inline(ctrl.label)}: ${markdownCodeSpan(`${ctrl.defaultValue}${suffix}`)}`);
      }
      if (block.metrics?.length) {
        for (const metric of block.metrics) {
          const val = evaluateNumericOrNull(metric.formula, scope);
          const formatted = val === null ? "—" : (metric.precision !== undefined ? val.toFixed(metric.precision) : String(val));
          lines.push(`- **${inline(metric.label)}**: ${formatted}${val === null ? "" : unit(metric.unit)}`);
        }
      }
      break;
    }
    case "chart": {
      for (const bar of block.bars) {
        const val = bar.formula ? evaluateNumericOrNull(bar.formula, scope) : (bar.value ?? 0);
        lines.push(`- ${inline(bar.label)}: ${val === null ? "—" : `${formatNumber(val)}${unit(bar.unit || block.unit)}`}`);
      }
      break;
    }
    case "compare": {
      lines.push(`| Criterion | ${block.columns.map(inline).join(" | ")} |`);
      lines.push(`| --- | ${block.columns.map(() => "---").join(" | ")} |`);
      for (const row of block.rows) {
        const cells = block.columns.map((_, idx) => {
          const val = row.values[idx] === undefined ? "-" : inline(row.values[idx]);
          return row.winnerIndex === idx ? `**${val}**` : val;
        });
        lines.push(`| ${inline(row.criterion)} | ${cells.join(" | ")} |`);
      }
      break;
    }
    case "checklist": {
      for (const item of block.items) {
        const mark = item.checked ? "x" : " ";
        lines.push(`- [${mark}] ${inline(item.label)}${item.detail ? ` (${inline(item.detail)})` : ""}`);
      }
      break;
    }
    case "architecture": {
      for (const layer of block.layers) {
        const nodes = layer.nodes.map((n) => `${inline(n.label)} (${inline(n.role)})`).join(", ");
        lines.push(`- **${inline(layer.layer)}**: ${nodes}`);
      }
      break;
    }
    case "graph": {
      for (const node of block.nodes) {
        const value = node.valueFormula ? evaluateNumericOrNull(node.valueFormula, scope) : undefined;
        const details = [
          node.role && inline(node.role),
          value !== undefined ? (value === null ? "—" : `${formatNumber(value)}${unit(node.unit)}`) : undefined,
          node.detail && inline(node.detail),
        ].filter(Boolean).join("; ");
        lines.push(`- ${node.group ? `[${inline(node.group)}] ` : ""}**${inline(node.label)}**${details ? `: ${details}` : ""}`);
      }
      for (const edge of block.edges) {
        lines.push(`- ${inline(edge.from)} → ${inline(edge.to)}${edge.label ? ` (${inline(edge.label)})` : ""}${edge.dashed ? " [dashed]" : ""}`);
      }
      break;
    }
    case "table": {
      lines.push(`| ${block.columns.map((column) => inline(column.label)).join(" | ")} |`);
      lines.push(`| ${block.columns.map(() => "---").join(" | ")} |`);
      for (const row of block.rows) {
        const values = block.columns.map((column) => inline(formatCell(resolveCell(row, column, scope), column.precision)));
        lines.push(`| ${values.join(" | ")} |`);
      }
      break;
    }
  }

  return lines;
}

/**
 * Generates clean Markdown text from any UiSpec so non-UI MCP hosts
 * (CLIs, TUIs, text-only agents) receive full structured information.
 */
export function renderFallbackMarkdown(spec: Partial<UiSpec>): string {
  const lines: string[] = [];
  if (spec.title) lines.push(`## ${inline(spec.title)}`);
  if (spec.subtitle) lines.push(escapeMarkdownText(spec.subtitle));

  const scope = initialScopeForSpec(spec);
  for (const block of spec.blocks ?? []) {
    lines.push("", ...formatBlockMarkdown(block, scope));
  }

  lines.push("", "_Interactive view rendered via MCP Apps (`ui://threadframe/view.html`) in supported desktop clients._");
  return lines.join("\n").trim();
}

interface LayoutMetrics {
  height: number;
  maxTableRows: number;
  tabCount: number;
  activeTab?: string;
  clippedGraph: boolean;
}

function measureBlocks(blocks: UiBlock[], out: LayoutMetrics): number {
  let total = 0;
  for (let i = 0; i < blocks.length; i++) {
    if (i > 0) total += 16;
    const block = blocks[i];
    switch (block.kind) {
      case "title": total += 34; break;
      case "caption": total += 24; break;
      case "divider": total += 18; break;
      case "badge":
      case "icon": total += 28; break;
      case "text": total += Math.max(28, Math.ceil(block.text.length / 72) * 24); break;
      case "controls": total += block.controls.length * 52 + (block.metrics?.length ? 56 : 0); break;
      case "stats": total += Math.ceil(block.items.length / 3) * 70; break;
      case "chart": total += block.bars.length * 36 + 32; break;
      case "plot": total += 250 + (block.baseline ? 32 : 0); break;
      case "actions": total += 44; break;
      case "bits": total += 108; break;
      case "svg": total += Math.min(block.height, 360) + 28; break;
      case "graph":
        if (block.nodes.length > 6) out.clippedGraph = true;
        total += Math.min(256, block.nodes.length * 46) + (block.title ? 28 : 0);
        break;
      case "table":
        out.maxTableRows = Math.max(out.maxTableRows, block.rows.length);
        total += (block.filter ? 44 : 0) + 38 + block.rows.length * 38 + (block.caption ? 24 : 0);
        break;
      case "choices": total += block.options.length * 60 + 16; break;
      case "compare": total += 40 + block.rows.length * 40; break;
      case "checklist": total += 36 + block.items.length * 42; break;
      case "timeline": total += block.steps.length * 58; break;
      case "architecture": total += block.layers.length * 82; break;
      case "callout": total += 64 + (block.items?.length ?? 0) * 22; break;
      case "code": total += 40 + (block.code ?? block.template ?? "").split("\n").length * 20; break;
      case "box": total += measureBlocks(block.children, out) + 28; break;
      case "grid": {
        const cols = Array.from({ length: block.columns }, () => 0);
        block.children.forEach((child, idx) => { cols[idx % block.columns] += measureBlocks([child], out); });
        total += Math.max(...cols);
        break;
      }
      case "tabs": {
        out.tabCount = Math.max(out.tabCount, block.tabs.length);
        const active = block.tabs.find((tab) => tab.id === block.defaultTab) ?? block.tabs[0];
        if (!out.activeTab && active) out.activeTab = active.label;
        total += 42 + (active ? measureBlocks(active.children, out) : 0);
        break;
      }
      case "accordion": {
        let openHeight = 0;
        for (const item of block.items) {
          if (item.defaultOpen) openHeight += measureBlocks(item.children, out) + 12;
        }
        total += block.items.length * 46 + openHeight;
        break;
      }
    }
  }
  return total;
}

/** Computes structured layout dimensions and overflow signals for callers. */
export function measureLayout(spec: UiSpec): LayoutSummary {
  const metrics: LayoutMetrics = { height: 0, maxTableRows: 0, tabCount: 0, clippedGraph: false };
  const chrome = (spec.subtitle ? 72 : 52) + (spec.actions?.length ? 46 : 0) + 42;
  const estimatedPx = Math.round((chrome + measureBlocks(spec.blocks, metrics)) / 10) * 10;
  return {
    estimatedPx,
    overflows: estimatedPx > 480 || metrics.clippedGraph,
    ...(metrics.activeTab ? { activeTab: metrics.activeTab } : {}),
    ...(metrics.maxTableRows > 0 ? { rows: metrics.maxTableRows } : {}),
    ...(metrics.tabCount > 1 ? { tabs: metrics.tabCount } : {}),
    ...(metrics.clippedGraph ? { graphClipped: true } : {}),
  };
}

/** Formats layout metrics into a single-line textual hint for fallback hosts. */
export function formatLayoutSummary(spec: UiSpec, layout = measureLayout(spec)): string {
  const notes: string[] = [];
  if (layout.tabs) notes.push(`${layout.tabs} tabs`);
  if (layout.rows) notes.push(`table ${layout.rows} rows`);
  if (layout.graphClipped) notes.push("graph viewport caps at 256px height");
  const detail = notes.length ? `${notes.join(", ")}; ` : "";
  if (!layout.overflows) {
    return `Layout: ~${layout.estimatedPx}px estimated (${detail}fits ~450px chat comfort height).`;
  }
  return `Layout: ~${layout.estimatedPx}px estimated (${detail}exceeds ~450px comfort height and will likely scroll—consider <tabs>, <accordion>, or fewer rows).`;
}
