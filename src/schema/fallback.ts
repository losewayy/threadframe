import { evaluateNumericFormula, type VarScope } from "../runtime/formula.js";
import { plotCenter, plotValues, svgGeometry } from "../runtime/vector.js";
import { formatNumber, statDisplay, interpolateCode } from "../runtime/display.js";
import { curveSummary, sampleCurve } from "../runtime/curve.js";
import { formatCell, resolveCell } from "../runtime/table.js";
import type { IconName } from "./atoms.js";
import { escapeMarkdownText, inlineTextMarkdown, markdownCodeSpan } from "./inlineText.js";
import { walkBlocks, type UiBlock, type UiSpec } from "./uiSpec.js";

const inline = (text: string) => escapeMarkdownText(text.replace(/\r\n?|\n/g, " "));
const unit = (text?: string) => text ? ` ${inline(text)}` : "";
const iconGlyphs: Partial<Record<IconName, string>> = {
  arrow: "↓", "arrow-down": "↓", "arrow-up": "↑", "arrow-left": "←", "arrow-right": "→",
  check: "✓", warning: "⚠", info: "ℹ",
};

function initialScopeForSpec(spec: Partial<UiSpec>): VarScope {
  const scope: VarScope = Object.create(null);
  walkBlocks(spec.blocks ?? [], (block) => {
    if (block.kind === "controls") {
      for (const ctrl of block.controls) {
        scope[ctrl.id] = ctrl.defaultValue;
      }
    }
  });
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
      if (block.caption) lines.push(escapeMarkdownText(block.caption));
      break;
    }
    case "plot": {
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
        for (const point of block.points ?? []) {
          const px = point.xFormula ? evaluateNumericFormula(point.xFormula, scope, point.x ?? 0) : point.x ?? 0;
          const py = point.yFormula ? evaluateNumericFormula(point.yFormula, scope, 0)
            : point.formula ? evaluateNumericFormula(point.formula, scope, point.y ?? point.value ?? 0) : point.y ?? point.value ?? 0;
          lines.push(`- **${inline(point.label)}**: ${variable}=${formatNumber(px, block.precision)}, y=${formatNumber(py, block.precision)}${unit(block.unit)}`);
        }
        break;
      }
      if (block.mode === "line" && block.points?.some((point) => point.x !== undefined || point.xFormula !== undefined)) {
        const variable = inline(block.xVariable ?? "x");
        for (const point of block.points) {
          const px = point.xFormula ? evaluateNumericFormula(point.xFormula, scope, point.x ?? 0) : point.x ?? 0;
          const py = point.yFormula ? evaluateNumericFormula(point.yFormula, scope, 0)
            : point.formula ? evaluateNumericFormula(point.formula, scope, point.y ?? point.value ?? 0) : point.y ?? point.value ?? 0;
          lines.push(`- **${inline(point.label)}**: ${variable}=${formatNumber(px, block.precision)}, y=${formatNumber(py, block.precision)}${unit(block.unit)}`);
        }
        break;
      }
      const values = plotValues(block.points ?? [], scope).map((value) => block.mode === "donut" ? Math.max(0, value) : value);
      block.points?.forEach((point, index) => lines.push(`- ${inline(point.label)}: ${formatNumber(values[index], block.precision)}${unit(block.unit)}`));
      if (block.mode === "donut") {
        const total = values.reduce((sum, value) => sum + value, 0);
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
          const val = evaluateNumericFormula(metric.formula, scope, 0);
          const formatted = metric.precision !== undefined ? val.toFixed(metric.precision) : String(val);
          lines.push(`- **${inline(metric.label)}**: ${formatted}${unit(metric.unit)}`);
        }
      }
      break;
    }
    case "chart": {
      for (const bar of block.bars) {
        const val = bar.formula ? evaluateNumericFormula(bar.formula, scope, bar.value ?? 0) : (bar.value ?? 0);
        lines.push(`- ${inline(bar.label)}: ${formatNumber(val)}${unit(bar.unit || block.unit)}`);
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
        const value = node.valueFormula ? evaluateNumericFormula(node.valueFormula, scope, 0) : undefined;
        const details = [
          node.role && inline(node.role),
          value !== undefined ? `${formatNumber(value)}${unit(node.unit)}` : undefined,
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
