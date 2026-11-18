import { z } from "zod";

const GraphTone = z.enum(["primary", "accent", "success", "warn"]);

export const GraphNodeSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  group: z.string().optional(),
  role: z.string().optional(),
  detail: z.string().optional(),
  tone: GraphTone.optional(),
  valueFormula: z.string().optional(),
  unit: z.string().optional(),
});

export const GraphEdgeSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  label: z.string().optional(),
  activeFormula: z.string().optional(),
  dashed: z.boolean().optional(),
});

export const GraphBlockSchema = z.object({
  kind: z.literal("graph"),
  id: z.string().optional(),
  title: z.string().optional(),
  direction: z.enum(["LR", "TB"]).default("LR"),
  nodes: z.array(GraphNodeSchema).min(1),
  edges: z.array(GraphEdgeSchema).default([]),
  caption: z.string().optional(),
});

export type GraphNode = z.infer<typeof GraphNodeSchema>;
export type GraphEdge = z.infer<typeof GraphEdgeSchema>;
export type GraphBlock = z.infer<typeof GraphBlockSchema>;
