import { z } from "zod";
import { evaluateFormula, formulaIdentifiers, type VarScope } from "./runtime/formula.js";
import type { ControlItem, LeafBlock, UiBlock, UiSpec } from "./schema/uiSpec.js";

/**
 * Compilers for the high-level MCP tools. They expand compact business input into a
 * standard UiSpec so every downstream stage (Zod validation, rendering, --embed and
 * Markdown fallback) stays single-sourced.
 */

const IdSchema = z.string().regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/);
const ToneSchema = z.enum(["primary", "accent", "success", "warn"]);

const MetricSchema = z.object({
  label: z.string().min(1),
  formula: z.string().min(1),
  unit: z.string().optional(),
  precision: z.number().int().min(0).max(4).optional(),
  warnAbove: z.number().optional(),
});

const BarSchema = z.object({
  label: z.string().min(1),
  formula: z.string().optional(),
  value: z.number().optional(),
  unit: z.string().optional(),
  tone: ToneSchema.optional(),
});

const InputSchema = z.object({
  id: IdSchema.optional(),
  kind: z.enum(["slider", "toggle", "select"]),
  label: z.string().min(1),
  min: z.number().optional(),
  max: z.number().optional(),
  step: z.number().positive().optional(),
  unit: z.string().optional(),
  defaultValue: z.union([z.number(), z.boolean(), z.string()]).optional(),
  options: z.array(z.string().min(1)).min(1).optional(),
});

export const CalculatorInputSchema = z.object({
  title: z.string().min(1),
  subtitle: z.string().optional(),
  badge: z.string().optional(),
  inputs: z.array(InputSchema).min(1),
  metrics: z.array(MetricSchema).optional(),
  bars: z.array(BarSchema).optional(),
  template: z.string().optional(),
  templateLanguage: z.string().regex(/^[a-zA-Z0-9_+-]*$/).optional(),
  caption: z.string().optional(),
  statePath: z.string().optional(),
});

export const DecisionInputSchema = z.object({
  title: z.string().min(1),
  subtitle: z.string().optional(),
  question: z.string().optional(),
  badge: z.string().optional(),
  options: z.array(z.object({
    id: IdSchema.optional(),
    label: z.string().min(1),
    description: z.string().optional(),
    recommended: z.boolean().optional(),
    prompt: z.string().optional(),
  })).min(2).max(4),
  criteria: z.array(z.object({
    label: z.string().min(1),
    values: z.array(z.string()).min(2).max(4),
    winner: z.number().int().min(0).max(3).optional(),
  })).optional(),
  statePath: z.string().optional(),
});

export const DiagramInputSchema = z.object({
  title: z.string().min(1),
  subtitle: z.string().optional(),
  badge: z.string().optional(),
  direction: z.enum(["LR", "TB"]).optional(),
  nodes: z.array(z.object({
    id: IdSchema.optional(),
    label: z.string().min(1),
    group: z.string().optional(),
    role: z.string().optional(),
    detail: z.string().optional(),
    tone: ToneSchema.optional(),
    valueFormula: z.string().optional(),
    unit: z.string().optional(),
  })).min(1),
  edges: z.array(z.object({
    from: z.string().min(1),
    to: z.string().min(1),
    label: z.string().optional(),
    activeFormula: z.string().optional(),
    dashed: z.boolean().optional(),
  })).optional(),
  inputs: z.array(InputSchema).optional(),
  caption: z.string().optional(),
  statePath: z.string().optional(),
});

export type CalculatorInput = z.infer<typeof CalculatorInputSchema>;
export type DecisionInput = z.infer<typeof DecisionInputSchema>;
export type DiagramInput = z.infer<typeof DiagramInputSchema>;

export interface CompileSuccess {
  ok: true;
  spec: UiSpec;
}

export interface CompileFailure {
  ok: false;
  issues: string[];
}

export type CompileResult = CompileSuccess | CompileFailure;

function slugify(label: string, fallback: string): string {
  const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  const base = slug || fallback;
  return /^[0-9]/.test(base) ? `v_${base}` : base;
}

function resolveId(
  raw: string | undefined,
  label: string,
  index: number,
  used: Set<string>,
  issues: string[],
  what: string,
): string {
  if (raw) {
    if (used.has(raw)) issues.push(`${what} "${raw}": duplicate id; give each entry a different id`);
    used.add(raw);
    return raw;
  }
  const base = slugify(label, `v${index + 1}`);
  let id = base;
  let suffix = 2;
  while (used.has(id)) id = `${base}_${suffix++}`;
  used.add(id);
  return id;
}

function templateVariables(template: string): string[] {
  return [...template.matchAll(/{{\s*([a-zA-Z_]\w*)\s*}}/g)].map((match) => match[1]);
}

function shortcutActions(options: {
  statePath?: string;
  saveLabel: string;
  sendLabel: string;
  copyLabel: string;
  sendTemplate: string;
  copyTemplate: string;
}): NonNullable<UiSpec["actions"]> {
  const copy = { label: options.copyLabel, kind: "copy_state" as const, promptTemplate: options.copyTemplate };
  if (options.statePath) {
    return [
      { label: options.saveLabel, kind: "save_state", statePath: options.statePath, promptTemplate: options.sendTemplate },
      copy,
    ];
  }
  return [{ label: options.sendLabel, kind: "send_message", promptTemplate: options.sendTemplate }, copy];
}

function validateFormula(
  expr: string,
  known: ReadonlySet<string>,
  where: string,
  issues: string[],
): void {
  if (!expr.trim()) {
    issues.push(`${where}: formula is required`);
    return;
  }
  for (const name of formulaIdentifiers(expr)) {
    if (!known.has(name)) issues.push(`${where}: unknown variable "${name}"; declare it in inputs or fix the name`);
  }
  const scope: VarScope = {};
  for (const name of known) scope[name] = 0;
  if (evaluateFormula(expr, scope) === null) {
    issues.push(`${where}: formula is not valid; use numbers, variables, and min/max/round/clamp/if`);
  }
}

function compileControls(
  inputs: CalculatorInput["inputs"],
  issues: string[],
): { controls: ControlItem[]; defaults: Record<string, string | number | boolean> } {
  const used = new Set<string>();
  const controls: ControlItem[] = [];
  const defaults: Record<string, string | number | boolean> = {};

  inputs.forEach((input, index) => {
    const id = resolveId(input.id, input.label, index, used, issues, "input");
    if (input.kind === "slider") {
      const min = input.min ?? 0;
      const max = input.max ?? 100;
      if (!(max > min)) issues.push(`input "${input.label}": max must be greater than min`);
      const raw = input.defaultValue ?? min;
      if (typeof raw !== "number" || !Number.isFinite(raw)) {
        issues.push(`input "${input.label}": slider defaultValue must be a number`);
      } else if (raw < min || raw > max) {
        issues.push(`input "${input.label}": defaultValue ${raw} must be between ${min} and ${max}`);
      }
      const defaultValue = typeof raw === "number" && Number.isFinite(raw)
        ? Math.min(max, Math.max(min, raw)) : min;
      controls.push({
        kind: "slider", id, label: input.label, min, max,
        step: input.step ?? 1, defaultValue, ...(input.unit ? { unit: input.unit } : {}),
      });
      defaults[id] = defaultValue;
    } else if (input.kind === "toggle") {
      if (input.defaultValue !== undefined && typeof input.defaultValue !== "boolean") {
        issues.push(`input "${input.label}": toggle defaultValue must be true or false`);
      }
      const defaultValue = typeof input.defaultValue === "boolean" ? input.defaultValue : false;
      controls.push({ kind: "toggle", id, label: input.label, defaultValue });
      defaults[id] = defaultValue;
    } else {
      const options = input.options ?? [];
      if (!options.length) issues.push(`input "${input.label}": select needs at least one option`);
      const raw = input.defaultValue ?? options[0] ?? "";
      if (typeof raw !== "string" || !options.includes(raw)) {
        issues.push(`input "${input.label}": defaultValue must be one of ${options.join(", ") || "(no options)"}`);
      }
      const defaultValue = typeof raw === "string" && options.includes(raw) ? raw : options[0] ?? "";
      if (options.length) controls.push({ kind: "select", id, label: input.label, options, defaultValue });
      defaults[id] = defaultValue;
    }
  });

  return { controls, defaults };
}

export function compileCalculator(input: CalculatorInput): CompileResult {
  const issues: string[] = [];
  const { controls, defaults } = compileControls(input.inputs, issues);
  const known = new Set(Object.keys(defaults));
  const metrics = input.metrics ?? [];
  const bars = input.bars ?? [];
  if (!metrics.length && !bars.length) issues.push("provide at least one metric or bar to display");
  metrics.forEach((metric) => validateFormula(metric.formula, known, `metric "${metric.label}"`, issues));
  bars.forEach((bar) => {
    if (bar.formula) validateFormula(bar.formula, known, `bar "${bar.label}"`, issues);
    else if (bar.value === undefined) issues.push(`bar "${bar.label}": give either a formula or a value`);
  });
  if (input.template) {
    for (const name of templateVariables(input.template)) {
      if (!known.has(name)) issues.push(`template: unknown variable "${name}"; declare it in inputs`);
    }
  }
  if (issues.length) return { ok: false, issues };

  const metricsInline = metrics.length <= 3;
  const controlsBlock: LeafBlock = {
    kind: "controls",
    controls,
    ...(metricsInline && metrics.length ? { metrics } : {}),
  };
  const statsBlock: LeafBlock | undefined = !metricsInline
    ? { kind: "stats", columns: metrics.length > 3 ? 3 : 2, items: metrics.map((metric) => ({ ...metric })) }
    : undefined;
  const chartBlock: LeafBlock | undefined = bars.length
    ? { kind: "chart", mode: "bars", bars: bars.map((bar) => ({ ...bar })) }
    : undefined;
  const codeBlock: LeafBlock | undefined = input.template
    ? {
        kind: "code", title: "Configuration preview", language: input.templateLanguage ?? "text",
        template: input.template, ...(input.caption ? { caption: input.caption } : {}),
      }
    : undefined;

  const secondary: LeafBlock[] = [];
  if (statsBlock) secondary.push(statsBlock);
  if (chartBlock) secondary.push(chartBlock);
  if (codeBlock) secondary.push(codeBlock);
  const dense = input.inputs.length + metrics.length + bars.length + (input.template ? 2 : 0) > 7;
  let blocks: UiBlock[];
  if (dense && secondary.length) {
    const tuneChildren = [controlsBlock, ...(statsBlock ? [statsBlock] : [])];
    const outputChildren = secondary.filter((block) => block !== statsBlock);
    blocks = [{
      kind: "tabs", id: "calculator-views", defaultTab: "tune",
      tabs: [
        { id: "tune", label: "Tune", children: tuneChildren },
        { id: "output", label: "Output", children: outputChildren.length ? outputChildren : [controlsBlock] },
      ],
    }];
  } else {
    blocks = [controlsBlock, ...secondary];
  }

  return {
    ok: true,
    spec: {
      title: input.title,
      ...(input.subtitle ? { subtitle: input.subtitle } : {}),
      badge: input.badge ?? "Interactive calculator",
      blocks,
      actions: shortcutActions({
        statePath: input.statePath,
        saveLabel: "Apply & remember",
        sendLabel: "Apply settings",
        copyLabel: "Copy settings",
        sendTemplate: "Use these configuration values: {{state_summary}}",
        copyTemplate: "Configuration: {{state_summary}}",
      }),
    },
  };
}

export function compileDecision(input: DecisionInput): CompileResult {
  const issues: string[] = [];
  const used = new Set<string>();
  const options = input.options.map((option, index) => ({
    ...option,
    id: resolveId(option.id, option.label, index, used, issues, "option"),
  }));
  const recommended = options.flatMap((option, index) => option.recommended ? [index] : []);
  if (recommended.length > 1) issues.push("mark at most one option as recommended");

  const criteria = input.criteria ?? [];
  criteria.forEach((criterion) => {
    if (criterion.values.length !== options.length) {
      issues.push(`criterion "${criterion.label}": give exactly ${options.length} values, one per option`);
    }
    if (criterion.winner !== undefined && criterion.winner >= options.length) {
      issues.push(`criterion "${criterion.label}": winner must be a 0-based option index below ${options.length}`);
    }
  });
  if (issues.length) return { ok: false, issues };

  const blocks: UiBlock[] = [];
  if (criteria.length) {
    blocks.push({
      kind: "compare",
      columns: options.map((option) => option.label),
      ...(recommended.length ? { recommendedIndex: recommended[0] } : {}),
      rows: criteria.map((criterion) => ({
        criterion: criterion.label,
        values: criterion.values,
        ...(criterion.winner !== undefined ? { winnerIndex: criterion.winner } : {}),
      })),
    });
  } else if (recommended.length) {
    blocks.push({ kind: "callout", tone: "success", body: `Recommended: ${options[recommended[0]].label}` });
  }
  blocks.push({
    kind: "choices",
    title: input.question ?? "Pick a direction",
    options: options.map((option) => ({
      id: option.id, label: option.label,
      ...(option.description ? { description: option.description } : {}),
      ...(option.prompt ? { prompt: option.prompt } : {}),
    })),
  });

  return {
    ok: true,
    spec: {
      title: input.title,
      ...(input.subtitle ? { subtitle: input.subtitle } : input.question ? { subtitle: input.question } : {}),
      badge: input.badge ?? "Decision matrix",
      blocks,
      actions: shortcutActions({
        statePath: input.statePath,
        saveLabel: "Record decision",
        sendLabel: "Apply decision",
        copyLabel: "Copy decision",
        sendTemplate: "Decision: {{state_summary}}",
        copyTemplate: "Decision: {{state_summary}}",
      }),
    },
  };
}

export function compileDiagram(input: DiagramInput): CompileResult {
  const issues: string[] = [];
  const { controls, defaults } = input.inputs?.length
    ? compileControls(input.inputs, issues)
    : { controls: [] as ControlItem[], defaults: {} };
  const known = new Set(Object.keys(defaults));
  const used = new Set<string>();
  const nodes = input.nodes.map((node, index) => ({
    ...node,
    id: resolveId(node.id, node.label, index, used, issues, "node"),
  }));
  const nodeIds = new Set(nodes.map((node) => node.id));
  const aliases = new Map<string, string>();
  input.nodes.forEach((node, index) => {
    aliases.set(nodes[index].id, nodes[index].id);
    aliases.set(node.label, nodes[index].id);
    if (node.id) aliases.set(node.id, nodes[index].id);
  });
  nodes.forEach((node) => {
    if (node.valueFormula) validateFormula(node.valueFormula, known, `node "${node.label}" valueFormula`, issues);
  });
  const edges = (input.edges ?? []).map((edge) => {
    const from = aliases.get(edge.from);
    const to = aliases.get(edge.to);
    if (!from) issues.push(`edge "${edge.from} → ${edge.to}": unknown source; use one of ${[...nodeIds].join(", ")}`);
    if (!to) issues.push(`edge "${edge.from} → ${edge.to}": unknown target; use one of ${[...nodeIds].join(", ")}`);
    if (edge.activeFormula) validateFormula(edge.activeFormula, known, `edge "${edge.from} → ${edge.to}" activeFormula`, issues);
    return { ...edge, from: from ?? edge.from, to: to ?? edge.to };
  });
  if (issues.length) return { ok: false, issues };

  const blocks: UiBlock[] = [];
  if (controls.length) blocks.push({ kind: "controls", controls });
  blocks.push({
    kind: "graph",
    direction: input.direction ?? "LR",
    nodes,
    edges: edges.map(({ activeFormula, dashed, label, from, to }) => ({
      from, to, ...(label ? { label } : {}), ...(activeFormula ? { activeFormula } : {}), ...(dashed ? { dashed } : {}),
    })),
    ...(input.caption ? { caption: input.caption } : {}),
  });

  return {
    ok: true,
    spec: {
      title: input.title,
      ...(input.subtitle ? { subtitle: input.subtitle } : {}),
      badge: input.badge ?? "Auto-laid diagram",
      blocks,
      actions: shortcutActions({
        statePath: input.statePath,
        saveLabel: "Remember diagram",
        sendLabel: "Send to chat",
        copyLabel: "Copy summary",
        sendTemplate: "Continue from this diagram: {{state_summary}}",
        copyTemplate: "Diagram: {{state_summary}}",
      }),
    },
  };
}
