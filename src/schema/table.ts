import { z } from "zod";

const Tone = z.enum(["primary", "accent", "success", "warn"]);

export const TableColumnSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  align: z.enum(["start", "center", "end"]).optional(),
  precision: z.number().int().min(0).max(6).optional(),
  sortable: z.boolean().optional(),
  formula: z.string().optional(),
});

export const TableRowSchema = z.object({
  id: z.string().optional(),
  values: z.record(z.string(), z.union([z.string(), z.number()])),
  tone: Tone.optional(),
});

export const TableBlockSchema = z.object({
  kind: z.literal("table"),
  id: z.string().optional(),
  title: z.string().optional(),
  columns: z.array(TableColumnSchema).min(1),
  rows: z.array(TableRowSchema).min(1),
  filter: z.object({
    placeholder: z.string().optional(),
    key: z.string().optional(),
    options: z.array(z.string()).optional(),
  }).optional(),
  caption: z.string().optional(),
});

export type TableColumn = z.infer<typeof TableColumnSchema>;
export type TableRow = z.infer<typeof TableRowSchema>;
export type TableBlock = z.infer<typeof TableBlockSchema>;
