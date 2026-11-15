import { z } from "zod";

/**
 * Declarative UI specification schema for Intelligence UI.
 * Covers the six primary inline interactive primitives plus progressive streaming tolerance.
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

export const UiBlockSchema = z.discriminatedUnion("kind", [
  ChoicesBlockSchema,
  ControlsBlockSchema,
  ChartBlockSchema,
  CompareBlockSchema,
  ChecklistBlockSchema,
  ArchitectureBlockSchema,
]);

export const UiActionSchema = z.object({
  label: z.string(),
  kind: z.enum(["send_message", "copy_state"]).optional(),
  promptTemplate: z.string().optional(),
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
export type ControlItem = z.infer<typeof ControlItemSchema>;

export interface PartialUiSpecResult {
  title: string;
  subtitle?: string;
  badge?: string;
  blocks: UiBlock[];
  actions: z.infer<typeof UiActionSchema>[];
  pendingBlockCount: number;
  isComplete: boolean;
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
      const parsed = UiBlockSchema.safeParse(item);
      if (parsed.success) {
        validBlocks.push(parsed.data);
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
