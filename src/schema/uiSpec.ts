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

export const ChartBarSchema = z.object({
  label: z.string(),
  value: z.number().optional(),
  formula: z.string().optional(),
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

export const LeafBlockSchema = z.discriminatedUnion("kind", [
  ChoicesBlockSchema,
  ControlsBlockSchema,
  ChartBlockSchema,
  CompareBlockSchema,
  ChecklistBlockSchema,
  ArchitectureBlockSchema,
  CalloutBlockSchema,
  PlotBlockSchema,
  SvgBlockSchema,
  StatsBlockSchema,
  TimelineBlockSchema,
  CodeBlockSchema,
  GraphBlockSchema,
  TableBlockSchema,
]);

// Containers are expanded explicitly so tool JSON Schemas never need recursive refs.
export const InnerGridBlockSchema = z.object({
  kind: z.literal("grid"),
  id: z.string().optional(),
  title: z.string().optional(),
  columns: z.union([z.literal(1), z.literal(2), z.literal(3)]).default(2),
  children: z.array(LeafBlockSchema).min(1),
});
export const GridBlockSchema = InnerGridBlockSchema;
const ContainerChildSchema = z.discriminatedUnion("kind", [
  ...LeafBlockSchema.options, InnerGridBlockSchema,
]);

export const TabsBlockSchema = z.object({
  kind: z.literal("tabs"),
  id: z.string().optional(),
  title: z.string().optional(),
  defaultTab: z.string().optional(),
  tabs: z.array(z.object({
    id: z.string(),
    label: z.string(),
    badge: z.string().optional(),
    children: z.array(ContainerChildSchema).min(1),
  })).min(1),
});

export const AccordionBlockSchema = z.object({
  kind: z.literal("accordion"),
  id: z.string().optional(),
  title: z.string().optional(),
  items: z.array(z.object({
    id: z.string(),
    title: z.string(),
    summary: z.string().optional(),
    defaultOpen: z.boolean().optional(),
    children: z.array(ContainerChildSchema).min(1),
  })).min(1),
});

export const UiBlockSchema = z.discriminatedUnion("kind", [
  ...LeafBlockSchema.options, GridBlockSchema, TabsBlockSchema, AccordionBlockSchema,
]);

export const UiActionSchema = z.object({
  label: z.string(),
  kind: z.enum(["send_message", "copy_state", "save_state"]).optional(),
  promptTemplate: z.string().optional(),
  statePath: z.string().optional(),
});

export const UiSpecSchema = z.object({
  title: z.string(),
  subtitle: z.string().optional(),
  badge: z.string().optional(),
  blocks: z.array(UiBlockSchema).min(1),
  actions: z.array(UiActionSchema).optional(),
});

export type UiSpec = z.infer<typeof UiSpecSchema>;
export type UiBlock = z.infer<typeof UiBlockSchema>;
export type LeafBlock = z.infer<typeof LeafBlockSchema>;
export type ControlItem = z.infer<typeof ControlItemSchema>;

export function walkBlocks(blocks: readonly UiBlock[], visitor: (block: UiBlock) => void): void {
  for (const block of blocks) {
    visitor(block);
    if (block.kind === "grid") walkBlocks(block.children, visitor);
    else if (block.kind === "tabs") {
      for (const tab of block.tabs) walkBlocks(tab.children, visitor);
    } else if (block.kind === "accordion") {
      for (const item of block.items) walkBlocks(item.children, visitor);
    }
  }
}

/** Collects every declared control so choice assignments can be checked against real variables. */
export function declaredControls(blocks: readonly UiBlock[]): Map<string, ControlItem> {
  const declared = new Map<string, ControlItem>();
  walkBlocks(blocks, (block) => {
    if (block.kind === "controls") for (const control of block.controls) declared.set(control.id, control);
  });
  return declared;
}

/**
 * Checks `choices[].options[].setVars` against declared controls and their domains.
 * Returns readable issues instead of throwing so tool handlers can reject bad specs with context.
 */
export function choiceAssignmentIssues(blocks: readonly UiBlock[]): string[] {
  const declared = declaredControls(blocks);
  const issues: string[] = [];
  walkBlocks(blocks, (block) => {
    if (block.kind !== "choices") return;
    for (const option of block.options) {
      for (const [id, value] of Object.entries(option.setVars ?? {})) {
        const path = `choices "${option.id}" setVars.${id}`;
        const control = declared.get(id);
        if (!control) {
          issues.push(`${path}: no controls block declares this variable`);
        } else if (control.kind === "toggle" && typeof value !== "boolean") {
          issues.push(`${path}: expected a boolean`);
        } else if (control.kind === "select" && (typeof value !== "string" || !control.options.includes(value))) {
          issues.push(`${path}: expected one of ${control.options.join(", ")}`);
        } else if (control.kind === "slider"
          && (typeof value !== "number" || !Number.isFinite(value) || value < control.min || value > control.max)) {
          issues.push(`${path}: expected a number from ${control.min} to ${control.max}`);
        }
      }
    }
  });
  return issues;
}

export interface PartialUiSpecResult {
  title: string;
  subtitle?: string;
  badge?: string;
  blocks: UiBlock[];
  actions: z.infer<typeof UiActionSchema>[];
  pendingBlockCount: number;
  isComplete: boolean;
}

function partialBlockChildren(raw: unknown, depth = 0): { value: unknown; pending: boolean } {
  if (!raw || typeof raw !== "object" || depth > 2) return { value: raw, pending: false };
  const block = raw as Record<string, unknown>;
  const lists: Record<string, Array<[string, z.ZodType]>> = {
    plot: [["points", PlotPointSchema], ["curves", CurveSeriesSchema]],
    svg: [["elements", SvgElementSchema]],
    stats: [["items", StatItemSchema]],
    timeline: [["steps", TimelineStepSchema]],
    graph: [["nodes", GraphNodeSchema], ["edges", GraphEdgeSchema]],
    table: [["columns", TableColumnSchema], ["rows", TableRowSchema]],
  };
  const schemas = typeof block.kind === "string" ? lists[block.kind] : undefined;
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
  const children = (items: unknown) => Array.isArray(items) ? items.map((item) => {
    const parsed = partialBlockChildren(item, depth + 1);
    pending ||= parsed.pending;
    return parsed.value;
  }) : items;
  let value: unknown = raw;
  if (block.kind === "grid") value = { ...block, children: children(block.children) };
  else if (block.kind === "tabs" || block.kind === "accordion") {
    const field = block.kind === "tabs" ? "tabs" : "items";
    if (Array.isArray(block[field])) value = { ...block, [field]: block[field].map((item) =>
      item && typeof item === "object" ? { ...item, children: children(item.children) } : item) };
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
      blocks: full.data.blocks,
      actions: full.data.actions ?? [],
      pendingBlockCount: 0,
      isComplete: true,
    };
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
    blocks: validBlocks,
    actions,
    pendingBlockCount,
    isComplete: false,
  };
}
