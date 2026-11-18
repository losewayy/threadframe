import { evaluateNumericFormula, type VarScope } from "../runtime/formula.js";
import { plotCenter, plotValues, svgGeometry } from "../runtime/vector.js";
import { formatNumber, statDisplay, interpolateCode } from "../runtime/display.js";
import { curveSummary, sampleCurve } from "../runtime/curve.js";
import { formatCell, resolveCell } from "../runtime/table.js";
import { walkBlocks, type UiBlock, type UiSpec } from "./uiSpec.js";

function initialScopeForSpec(spec: Partial<UiSpec>): VarScope {
  const scope: VarScope = {};
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
    lines.push(`### ${block.title}`);
  }

  switch (block.kind) {
    case "stats": {
      for (const item of block.items) {
        const display = statDisplay(item, scope);
        lines.push(`- ${item.label}: ${display.value}${item.unit ? ` ${item.unit}` : ""}${display.delta !== undefined ? ` (${display.delta})` : ""}${display.warning ? " [warn]" : ""}`);
      }
      break;
    }
    case "timeline": {
      for (const step of block.steps) {
        lines.push(`- [${step.status}] ${step.title}${step.meta ? ` (${step.meta})` : ""}${step.detail ? `: ${step.detail}` : ""}`);
      }
      break;
    }
    case "code": {
      const code = interpolateCode(block.template ?? block.code ?? "", scope);
      const fence = "`".repeat(Math.max(3, ...[...code.matchAll(/`+/g)].map((match) => match[0].length + 1)));
      lines.push(`${fence}${block.language ?? ""}`, code, fence);
      if (block.caption) lines.push(block.caption);
      break;
    }
    case "plot": {
      if (block.curves?.length) {
        for (const curve of block.curves) {
          const samples = sampleCurve(curve.formula, block.xMin ?? 0, block.xMax ?? 1, block.samples, scope);
          const summary = curveSummary(samples);
          lines.push(`- ${curve.label}: \`${curve.formula}\``);
          if (!summary.length) {
            lines.push(`- ${curve.label}: no finite sample between ${block.xMin} and ${block.xMax}`);
            continue;
          }
          lines.push(`  | Point | x | ${curve.label} |`, "  | --- | --- | --- |");
          for (const point of summary) {
            lines.push(`  | ${point.label} | ${formatNumber(point.x, block.precision)} | ${formatNumber(point.y, block.precision)}${block.unit ? ` ${block.unit}` : ""} |`);
          }
        }
        break;
      }
      const values = plotValues(block.points ?? [], scope).map((value) => block.mode === "donut" ? Math.max(0, value) : value);
      block.points?.forEach((point, index) => lines.push(`- ${point.label}: ${formatNumber(values[index], block.precision)}${block.unit ? ` ${block.unit}` : ""}`));
      if (block.mode === "donut") {
        lines.push(`- ${block.centerLabel ?? "Total"}: ${formatNumber(plotCenter(block, scope, values.reduce((sum, value) => sum + value, 0)), block.precision)}${block.unit ? ` ${block.unit}` : ""}`);
      }
      break;
    }
    case "svg": {
      if (block.caption) lines.push(block.caption);
      lines.push(`Vector canvas: ${block.width} × ${block.height}`);
      for (const element of block.elements) {
        const geometry = svgGeometry(element, scope);
        const summary = Object.entries(geometry.numbers).map(([key, value]) => `${key}=${value}`).join(", ");
        lines.push(`- ${element.type}: ${geometry.text ?? (element.type === "path" ? element.d : "points" in element ? element.points : summary)}`);
      }
      break;
    }
    case "callout": {
      lines.push(`> [${block.tone ?? "info"}] ${block.body}`);
      for (const item of block.items ?? []) lines.push(`> - ${item}`);
      break;
    }
    case "grid": {
      for (const child of block.children) lines.push("", ...formatBlockMarkdown(child, scope));
      break;
    }
    case "tabs": {
      for (const tab of block.tabs) {
        lines.push("", `#### [Tab: ${tab.label}]`);
        for (const child of tab.children) lines.push("", ...formatBlockMarkdown(child, scope));
      }
      break;
    }
    case "accordion": {
      for (const item of block.items) {
        lines.push("", `#### ${item.title}`);
        if (item.summary) lines.push(item.summary);
        for (const child of item.children) lines.push("", ...formatBlockMarkdown(child, scope));
      }
      break;
    }
    case "choices": {
      for (const opt of block.options) {
        lines.push(`- **${opt.label}**${opt.description ? `: ${opt.description}` : ""}`);
      }
      break;
    }
    case "controls": {
      for (const ctrl of block.controls) {
        const unit = ctrl.kind === "slider" && ctrl.unit ? ` ${ctrl.unit}` : "";
        lines.push(`- ${ctrl.label}: \`${ctrl.defaultValue}${unit}\``);
      }
      if (block.metrics?.length) {
        for (const metric of block.metrics) {
          const val = evaluateNumericFormula(metric.formula, scope, 0);
          const formatted = metric.precision !== undefined ? val.toFixed(metric.precision) : String(val);
          lines.push(`- **${metric.label}**: ${formatted}${metric.unit ? ` ${metric.unit}` : ""}`);
        }
      }
      break;
    }
    case "chart": {
      const unit = block.unit ? ` ${block.unit}` : "";
      for (const bar of block.bars) {
        const val = bar.formula ? evaluateNumericFormula(bar.formula, scope, bar.value ?? 0) : (bar.value ?? 0);
        lines.push(`- ${bar.label}: ${val}${bar.unit ? ` ${bar.unit}` : unit}`);
      }
      break;
    }
    case "compare": {
      lines.push(`| Criterion | ${block.columns.join(" | ")} |`);
      lines.push(`| --- | ${block.columns.map(() => "---").join(" | ")} |`);
      for (const row of block.rows) {
        const cells = block.columns.map((_, idx) => {
          const val = row.values[idx] ?? "-";
          return row.winnerIndex === idx ? `**${val}**` : val;
        });
        lines.push(`| ${row.criterion} | ${cells.join(" | ")} |`);
      }
      break;
    }
    case "checklist": {
      for (const item of block.items) {
        const mark = item.checked ? "x" : " ";
        lines.push(`- [${mark}] ${item.label}${item.detail ? ` (${item.detail})` : ""}`);
      }
      break;
    }
    case "architecture": {
      for (const layer of block.layers) {
        const nodes = layer.nodes.map((n) => `${n.label} (${n.role})`).join(", ");
        lines.push(`- **${layer.layer}**: ${nodes}`);
      }
      break;
    }
    case "graph": {
      for (const node of block.nodes) {
        const value = node.valueFormula ? evaluateNumericFormula(node.valueFormula, scope, 0) : undefined;
        const details = [
          node.role,
          value !== undefined ? `${formatNumber(value)}${node.unit ? ` ${node.unit}` : ""}` : undefined,
          node.detail,
        ].filter(Boolean).join("; ");
        lines.push(`- ${node.group ? `[${node.group}] ` : ""}**${node.label}**${details ? `: ${details}` : ""}`);
      }
      for (const edge of block.edges) {
        lines.push(`- ${edge.from} → ${edge.to}${edge.label ? ` (${edge.label})` : ""}${edge.dashed ? " [dashed]" : ""}`);
      }
      break;
    }
    case "table": {
      const cell = (value: string | number) => String(value).replaceAll("|", "\\|").replaceAll("\n", " ");
      lines.push(`| ${block.columns.map((column) => cell(column.label)).join(" | ")} |`);
      lines.push(`| ${block.columns.map(() => "---").join(" | ")} |`);
      for (const row of block.rows) {
        const values = block.columns.map((column) => cell(formatCell(resolveCell(row, column, scope), column.precision)));
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
  if (spec.title) lines.push(`## ${spec.title}`);
  if (spec.subtitle) lines.push(spec.subtitle);

  const scope = initialScopeForSpec(spec);
  for (const block of spec.blocks ?? []) {
    lines.push("", ...formatBlockMarkdown(block, scope));
  }

  lines.push("", "_Interactive view rendered via MCP Apps (`ui://threadframe/view.html`) in supported desktop clients._");
  return lines.join("\n").trim();
}
