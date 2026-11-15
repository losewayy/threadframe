import { evaluateNumericFormula, type VarScope } from "../runtime/formula.js";
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

  lines.push("", "_Interactive view rendered via MCP Apps (`ui://intelligence-ui/view.html`) in supported desktop clients._");
  return lines.join("\n").trim();
}
