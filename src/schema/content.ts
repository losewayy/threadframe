import { z } from "zod";

export const StatItemSchema = z.object({
  label: z.string(),
  value: z.union([z.number(), z.string()]).optional(),
  formula: z.string().optional(),
  unit: z.string().optional(),
  precision: z.number().int().min(0).max(6).optional(),
  delta: z.union([z.number(), z.string()]).optional(),
  deltaFormula: z.string().optional(),
  tone: z.enum(["primary", "accent", "success", "warn"]).optional(),
  warnAbove: z.number().optional(),
});

export const StatsBlockSchema = z.object({
  kind: z.literal("stats"), id: z.string().optional(), title: z.string().optional(),
  columns: z.union([z.literal(2), z.literal(3), z.literal(4)]).optional(),
  items: z.array(StatItemSchema).min(1),
});

export const TimelineStepSchema = z.object({
    id: z.string(), title: z.string(),
    status: z.enum(["done", "active", "pending", "warn"]),
    meta: z.string().optional(), detail: z.string().optional(),
});

export const TimelineBlockSchema = z.object({
  kind: z.literal("timeline"), id: z.string().optional(), title: z.string().optional(),
  selectVar: z.string().regex(/^[A-Za-z_]\w*$/).optional(),
  steps: z.array(TimelineStepSchema).min(1),
});

export const CodeBlockSchema = z.object({
  kind: z.literal("code"), id: z.string().optional(), title: z.string().optional(),
  language: z.string().regex(/^[a-zA-Z0-9_+-]*$/).optional(),
  code: z.string().optional(), template: z.string().optional(),
  activeLine: z.number().int().min(1).optional(),
  activeLineFormula: z.string().optional(),
  caption: z.string().optional(), copyLabel: z.string().optional(),
}).refine((block) => block.code !== undefined || block.template !== undefined, "Expected code or template");

export type StatItem = z.infer<typeof StatItemSchema>;
