import { z } from "zod";
import {
  CurveSeriesSchema, PlotBlockSchema, PlotPointSchema, SvgBlockSchema, SvgElementSchema,
} from "./vector.js";
export { PlotBlockSchema, SvgBlockSchema } from "./vector.js";
import { StatsBlockSchema, TimelineBlockSchema, CodeBlockSchema, StatItemSchema, TimelineStepSchema } from "./content.js";
export { StatsBlockSchema, TimelineBlockSchema, CodeBlockSchema } from "./content.js";
import { GraphBlockSchema, GraphEdgeSchema, GraphNodeSchema } from "./graph.js";
export { GraphBlockSchema } from "./graph.js";
import { TableBlockSchema, TableColumnSchema, TableRowSchema } from "./table.js";
export { TableBlockSchema } from "./table.js";
import { AtomicLeafBlockSchema, BoxFields, IconNameSchema } from "./atoms.js";

/**
 * Declarative UI specification schema for ThreadFrame.
 * Leaf primitives, bounded layout containers, and progressive streaming tolerance.
 */

export const SliderControlSchema = z.object({
  kind: z.literal("slider"),
  id: z.string(),
  label: z.string(),
  min: z.number(),
  max: z.number(),
  step: z.number().positive().optional(),
  defaultValue: z.number(),
  unit: z.string().optional(),
});

export const ToggleControlSchema = z.object({
  kind: z.literal("toggle"),
  id: z.string(),
  label: z.string(),
  defaultValue: z.boolean(),
});

export const SelectControlSchema = z.object({
  kind: z.literal("select"),
  id: z.string(),
  label: z.string(),
  options: z.array(z.string()).min(1),
  defaultValue: z.string(),
});

export const ControlItemSchema = z.discriminatedUnion("kind", [
  SliderControlSchema,
  ToggleControlSchema,
  SelectControlSchema,
]);

export const DerivedMetricSchema = z.object({
  label: z.string(),
  formula: z.string(),
  unit: z.string().optional(),
  precision: z.number().int().min(0).max(4).optional(),
  warnAbove: z.number().optional(),
});

export const ControlsBlockSchema = z.object({
  kind: z.literal("controls"),
  id: z.string().optional(),
  title: z.string().optional(),
  controls: z.array(ControlItemSchema).min(1),
  metrics: z.array(DerivedMetricSchema).optional(),
});

export const ChoiceOptionSchema = z.object({
  id: z.string(),
  label: z.string(),
  icon: IconNameSchema.optional(),
  description: z.string().optional(),
  prompt: z.string().optional(),
  setVars: z.record(z.string(), z.union([z.number(), z.string(), z.boolean()])).optional(),
});

export const ChoicesBlockSchema = z.object({
  kind: z.literal("choices"),
  id: z.string().optional(),
  title: z.string().optional(),
  multi: z.boolean().optional(),
  options: z.array(ChoiceOptionSchema).min(1),
});

export const DerivedVarSchema = z.object({
  id: z.string().regex(/^[A-Za-z_]\w*$/),
  formula: z.string().min(1),
});

export const ChartBarSchema = z.object({
  label: z.string(),
  value: z.number().optional(),
  formula: z.string().optional(),
  activeFormula: z.string().optional(),
  unit: z.string().optional(),
  tone: z.enum(["primary", "accent", "success", "warn"]).optional(),
});

export const ChartBlockSchema = z.object({
  kind: z.literal("chart"),
  id: z.string().optional(),
  title: z.string().optional(),
  mode: z.enum(["bars", "stacked"]).optional(),
  max: z.number().positive().optional(),
  maxFormula: z.string().optional(),
  unit: z.string().optional(),
  bars: z.array(ChartBarSchema).min(1),
});

export const CompareRowSchema = z.object({
  criterion: z.string(),
  values: z.array(z.string()).min(1),
  winnerIndex: z.number().int().min(0).optional(),
});

export const CompareBlockSchema = z.object({
  kind: z.literal("compare"),
  id: z.string().optional(),
  title: z.string().optional(),
  columns: z.array(z.string()).min(2),
  recommendedIndex: z.number().int().min(0).optional(),
  rows: z.array(CompareRowSchema).min(1),
});

export const ChecklistItemSchema = z.object({
  id: z.string(),
  label: z.string(),
  checked: z.boolean().optional(),
  detail: z.string().optional(),
});

export const ChecklistBlockSchema = z.object({
  kind: z.literal("checklist"),
  id: z.string().optional(),
  title: z.string().optional(),
  items: z.array(ChecklistItemSchema).min(1),
});

export const ArchitectureNodeSchema = z.object({
  id: z.string(),
  label: z.string(),
  icon: IconNameSchema.optional(),
  role: z.string(),
  detail: z.string().optional(),
  badge: z.string().optional(),
});

export const ArchitectureLayerSchema = z.object({
  layer: z.string(),
  nodes: z.array(ArchitectureNodeSchema).min(1),
});

export const ArchitectureBlockSchema = z.object({
  kind: z.literal("architecture"),
  id: z.string().optional(),
  title: z.string().optional(),
  selectVar: z.string().regex(/^[A-Za-z_]\w*$/).optional(),
  layers: z.array(ArchitectureLayerSchema).min(1),
});

export const CalloutBlockSchema = z.object({
  kind: z.literal("callout"),
  id: z.string().optional(),
  title: z.string().optional(),
  tone: z.enum(["info", "success", "warn"]).optional(),
  body: z.string(),
  items: z.array(z.string()).optional(),
});

export const UiActionSchema = z.object({
  label: z.string(),
  kind: z.enum(["send_message", "copy_state", "save_state", "set_var", "step_var"]).optional(),
  promptTemplate: z.string().optional(),
  statePath: z.string().optional(),
  var: z.string().optional(),
  value: z.union([z.number(), z.string(), z.boolean()]).optional(),
  delta: z.number().optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  wrap: z.boolean().optional(),
});

export const ActionsBlockSchema = z.object({
  kind: z.literal("actions"),
  id: z.string().optional(),
  title: z.string().optional(),
  buttons: z.array(UiActionSchema).min(1),
});

export const LeafBlockSchema = z.discriminatedUnion("kind", [
  ChoicesBlockSchema,
  ControlsBlockSchema,
  ChartBlockSchema,
  CompareBlockSchema,
  ChecklistBlockSchema,
  ArchitectureBlockSchema,
  CalloutBlockSchema,
  ActionsBlockSchema,
  PlotBlockSchema,
  SvgBlockSchema,
  StatsBlockSchema,
  TimelineBlockSchema,
  CodeBlockSchema,
  GraphBlockSchema,
  TableBlockSchema,
  ...AtomicLeafBlockSchema.options,
]);

// Containers are expanded explicitly so tool JSON Schemas never need recursive refs.
export const InnerBoxBlockSchema = z.strictObject({
  ...BoxFields,
  children: z.array(AtomicLeafBlockSchema).min(1),
});
const LayoutLeafSchema = z.discriminatedUnion("kind", [
  ...LeafBlockSchema.options, InnerBoxBlockSchema,
]);
export const BoxBlockSchema = z.strictObject({
  ...BoxFields,
  children: z.array(LayoutLeafSchema).min(1),
});

export const InnerGridBlockSchema = z.object({
  kind: z.literal("grid"),
  id: z.string().optional(),
  title: z.string().optional(),
  columns: z.union([z.literal(1), z.literal(2), z.literal(3)]).default(2),
  children: z.array(LayoutLeafSchema).min(1),
});
export const GridBlockSchema = InnerGridBlockSchema;
const ContainerChildSchema = z.discriminatedUnion("kind", [
  ...LayoutLeafSchema.options, InnerGridBlockSchema,
]);

export const TabItemSchema = z.object({
  id: z.string(),
  label: z.string(),
  badge: z.string().optional(),
  children: z.array(ContainerChildSchema).min(1),
});
export const TabsBlockSchema = z.object({
  kind: z.literal("tabs"),
  id: z.string().optional(),
  title: z.string().optional(),
  defaultTab: z.string().optional(),
  tabs: z.array(TabItemSchema).min(1),
});

export const AccordionItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  summary: z.string().optional(),
  defaultOpen: z.boolean().optional(),
  children: z.array(ContainerChildSchema).min(1),
});
export const AccordionBlockSchema = z.object({
  kind: z.literal("accordion"),
  id: z.string().optional(),
  title: z.string().optional(),
  items: z.array(AccordionItemSchema).min(1),
});

export const UiBlockSchema = z.discriminatedUnion("kind", [
  ...LeafBlockSchema.options, BoxBlockSchema, GridBlockSchema, TabsBlockSchema, AccordionBlockSchema,
]);

export const LayoutSummarySchema = z.object({
  estimatedPx: z.number().int().nonnegative(),
  overflows: z.boolean(),
  activeTab: z.string().optional(),
  rows: z.number().int().nonnegative().optional(),
  tabs: z.number().int().positive().optional(),
  graphClipped: z.boolean().optional(),
});

export const UiSpecSchema = z.object({
  title: z.string(),
  subtitle: z.string().optional(),
  badge: z.string().optional(),
  vars: z.array(DerivedVarSchema).optional(),
  blocks: z.array(UiBlockSchema).min(1),
  actions: z.array(UiActionSchema).optional(),
  layout: LayoutSummarySchema.optional(),
});

export type LayoutSummary = z.infer<typeof LayoutSummarySchema>;
export type DerivedVar = z.infer<typeof DerivedVarSchema>;
export type UiAction = z.infer<typeof UiActionSchema>;
export type UiSpec = z.infer<typeof UiSpecSchema>;
export type UiBlock = z.infer<typeof UiBlockSchema>;
export type LeafBlock = z.infer<typeof LeafBlockSchema>;
export type ControlItem = z.infer<typeof ControlItemSchema>;

export interface DeclaredSelectVar {
  id: string;
  label: string;
  initial: string;
  values: string[];
}

export function walkBlocks(blocks: readonly UiBlock[], visitor: (block: UiBlock) => void): void {
  for (const block of blocks) {
    visitor(block);
    if (block.kind === "grid" || block.kind === "box") walkBlocks(block.children, visitor);
    else if (block.kind === "tabs") {
      for (const tab of block.tabs) walkBlocks(tab.children, visitor);
    } else if (block.kind === "accordion") {
      for (const item of block.items) walkBlocks(item.children, visitor);
    }
  }
}

/** Collects every declared control so choice and action assignments can be checked against real variables. */
export function declaredControls(blocks: readonly UiBlock[]): Map<string, ControlItem> {
  const declared = new Map<string, ControlItem>();
  walkBlocks(blocks, (block) => {
    if (block.kind === "controls") for (const control of block.controls) declared.set(control.id, control);
  });
  return declared;
}

/** Collects interactive `selectVar` bindings from graphs, architectures, timelines, and tables. */
export function declaredSelectVars(blocks: readonly UiBlock[]): Map<string, DeclaredSelectVar> {
  const declared = new Map<string, DeclaredSelectVar>();
  walkBlocks(blocks, (block) => {
    if (block.kind === "graph" && block.selectVar) {
      const values = block.nodes.map((node) => node.id);
      if (values.length) declared.set(block.selectVar, { id: block.selectVar, label: block.title ?? block.selectVar, initial: values[0], values });
    } else if (block.kind === "architecture" && block.selectVar) {
      const values = block.layers.flatMap((layer) => layer.nodes.map((node) => node.id));
      if (values.length) declared.set(block.selectVar, { id: block.selectVar, label: block.title ?? block.selectVar, initial: values[0], values });
    } else if (block.kind === "timeline" && block.selectVar) {
      const values = block.steps.map((step) => step.id);
      const initial = (block.steps.find((step) => step.status === "active") ?? block.steps[0])?.id;
      if (values.length && initial) declared.set(block.selectVar, { id: block.selectVar, label: block.title ?? block.selectVar, initial, values });
    } else if (block.kind === "table" && block.selectVar) {
      const values = block.rows.map((row, index) => row.id ?? `row_${index + 1}`);
      if (values.length) declared.set(block.selectVar, { id: block.selectVar, label: block.title ?? block.selectVar, initial: values[0], values });
    }
  });
  return declared;
}

function variableValueIssue(
  path: string,
  id: string,
  value: unknown,
  controls: ReadonlyMap<string, ControlItem>,
  selectVars: ReadonlyMap<string, DeclaredSelectVar>,
): string | undefined {
  const control = controls.get(id);
  if (control) {
    if (control.kind === "toggle" && typeof value !== "boolean") return `${path}: expected a boolean`;
    if (control.kind === "select" && (typeof value !== "string" || !control.options.includes(value))) {
      return `${path}: expected one of ${control.options.join(", ")}`;
    }
    if (control.kind === "slider"
      && (typeof value !== "number" || !Number.isFinite(value) || value < control.min || value > control.max)) {
      return `${path}: expected a number from ${control.min} to ${control.max}`;
    }
    return undefined;
  }
  const selected = selectVars.get(id);
  if (selected) {
    if (typeof value !== "string" || !selected.values.includes(value)) {
      return `${path}: expected one of ${selected.values.join(", ")}`;
    }
    return undefined;
  }
  return `${path}: no controls block declares this variable (or selectVar)`;
}

/**
 * Checks `choices[].options[].setVars` against declared controls and their domains.
 * Returns readable issues instead of throwing so tool handlers can reject bad specs with context.
 */
export function choiceAssignmentIssues(blocks: readonly UiBlock[]): string[] {
  const declared = declaredControls(blocks);
  const selectVars = declaredSelectVars(blocks);
  const issues: string[] = [];
  walkBlocks(blocks, (block) => {
    if (block.kind !== "choices") return;
    for (const option of block.options) {
      for (const [id, value] of Object.entries(option.setVars ?? {})) {
        const issue = variableValueIssue(`choices "${option.id}" setVars.${id}`, id, value, declared, selectVars);
        if (issue) issues.push(issue);
      }
    }
  });
  return issues;
}

/** Checks `set_var` and `step_var` actions against editable controls and `selectVar` bindings. */
export function actionAssignmentIssues(
  blocks: readonly UiBlock[],
  actions: readonly UiAction[] = [],
  derivedVars: readonly DerivedVar[] = [],
): string[] {
  const controls = declaredControls(blocks);
  const selectVars = declaredSelectVars(blocks);
  const derivedIds = new Set(derivedVars.map((item) => item.id));
  const collected: UiAction[] = [...actions];
  walkBlocks(blocks, (block) => {
    if (block.kind === "actions") collected.push(...block.buttons);
  });
  const issues: string[] = [];
  for (const action of collected) {
    if (action.kind !== "set_var" && action.kind !== "step_var") continue;
    const where = `button "${action.label}"`;
    if (!action.var) {
      issues.push(`${where}: var is required for ${action.kind}`);
      continue;
    }
    if (derivedIds.has(action.var)) {
      issues.push(`${where}: cannot assign derived <var> "${action.var}"; target an input control or selectVar`);
      continue;
    }
    if (action.kind === "set_var") {
      if (action.value === undefined) {
        issues.push(`${where}: value is required for set_var`);
        continue;
      }
      const issue = variableValueIssue(`${where} (${action.var})`, action.var, action.value, controls, selectVars);
      if (issue) issues.push(issue);
    } else if (!controls.has(action.var) && !selectVars.has(action.var)) {
      issues.push(`${where}: unknown variable "${action.var}"; declare it with a control or selectVar`);
    }
  }
  return issues;
}

export interface PartialUiSpecResult {
  title: string;
  subtitle?: string;
  badge?: string;
  vars?: DerivedVar[];
  blocks: UiBlock[];
  actions: UiAction[];
  pendingBlockCount: number;
  isComplete: boolean;
}

function partialBlockChildren(raw: unknown, depth = 0): { value: unknown; pending: boolean } {
  if (!raw || typeof raw !== "object" || depth > 3) return { value: raw, pending: false };
  const block = raw as Record<string, unknown>;
  const lists: Record<string, Array<[string, z.ZodType]>> = {
    plot: [["points", PlotPointSchema], ["curves", CurveSeriesSchema]],
    svg: [["elements", SvgElementSchema]],
    stats: [["items", StatItemSchema]],
    timeline: [["steps", TimelineStepSchema]],
    graph: [["nodes", GraphNodeSchema], ["edges", GraphEdgeSchema]],
    table: [["columns", TableColumnSchema], ["rows", TableRowSchema]],
  };
  const schemas = typeof block.kind === "string" && Object.hasOwn(lists, block.kind) ? lists[block.kind] : undefined;
  if (schemas) {
    const value = { ...block };
    let pending = false;
    for (const [field, schema] of schemas) {
      const children = block[field];
      if (!Array.isArray(children)) continue;
      const valid = children.filter((child) => schema.safeParse(child).success);
      if (valid.length < children.length) pending = true;
      value[field] = valid;
    }
    return { value, pending };
  }
  let pending = false;
  const children = (items: unknown, schema: z.ZodType) => Array.isArray(items) ? items.flatMap((item) => {
    const parsed = partialBlockChildren(item, depth + 1);
    if (!schema.safeParse(parsed.value).success) {
      pending = true;
      return [];
    }
    pending ||= parsed.pending;
    return [parsed.value];
  }) : items;
  let value: unknown = raw;
  if (block.kind === "grid" || block.kind === "box") {
    const schema = block.kind === "box" && depth > 0 ? AtomicLeafBlockSchema : LayoutLeafSchema;
    value = { ...block, children: children(block.children, schema) };
  }
  else if (block.kind === "tabs" || block.kind === "accordion") {
    const field = block.kind === "tabs" ? "tabs" : "items";
    const schema = block.kind === "tabs" ? TabItemSchema : AccordionItemSchema;
    if (Array.isArray(block[field])) value = { ...block, [field]: block[field].flatMap((item) => {
      const panel = item && typeof item === "object" ? { ...item, children: children(item.children, ContainerChildSchema) } : item;
      if (schema.safeParse(panel).success) return [panel];
      pending = true;
      return [];
    }) };
  }
  return { value, pending };
}

/**
 * Parses a potentially incomplete healed JSON object emitted by `ui/notifications/tool-input-partial`.
 * Fully valid blocks render immediately while trailing half-streamed blocks show as a skeleton count.
 */
export function parsePartialUiSpec(raw: unknown): PartialUiSpecResult {
  if (!raw || typeof raw !== "object") {
    return {
      title: "Building interactive view...",
      blocks: [],
      actions: [],
      pendingBlockCount: 1,
      isComplete: false,
    };
  }

  const record = raw as Record<string, unknown>;
  const full = UiSpecSchema.safeParse(raw);
  if (full.success) {
    return {
      title: full.data.title,
      subtitle: full.data.subtitle,
      badge: full.data.badge,
      ...(full.data.vars?.length ? { vars: full.data.vars } : {}),
      blocks: full.data.blocks,
      actions: full.data.actions ?? [],
      pendingBlockCount: 0,
      isComplete: true,
    };
  }

  const vars: DerivedVar[] = [];
  if (Array.isArray(record.vars)) {
    for (const item of record.vars) {
      const parsed = DerivedVarSchema.safeParse(item);
      if (parsed.success) vars.push(parsed.data);
    }
  }

  const validBlocks: UiBlock[] = [];
  let pendingBlockCount = 0;
  if (Array.isArray(record.blocks)) {
    for (const item of record.blocks) {
      const partial = partialBlockChildren(item);
      const parsed = UiBlockSchema.safeParse(partial.value);
      if (parsed.success) {
        validBlocks.push(parsed.data);
        if (partial.pending) pendingBlockCount++;
      } else {
        pendingBlockCount++;
      }
    }
  } else {
    pendingBlockCount = 1;
  }

  const actions: z.infer<typeof UiActionSchema>[] = [];
  if (Array.isArray(record.actions)) {
    for (const item of record.actions) {
      const parsed = UiActionSchema.safeParse(item);
      if (parsed.success) actions.push(parsed.data);
    }
  }

  return {
    title: typeof record.title === "string" && record.title.trim() ? record.title : "Building interactive view...",
    subtitle: typeof record.subtitle === "string" ? record.subtitle : undefined,
    badge: typeof record.badge === "string" ? record.badge : undefined,
    ...(vars.length ? { vars } : {}),
    blocks: validBlocks,
    actions,
    pendingBlockCount,
    isComplete: false,
  };
}
