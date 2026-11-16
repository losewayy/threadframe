import { z } from "zod";

export const PlotPointSchema = z.strictObject({
  label: z.string(),
  value: z.number().optional(),
  formula: z.string().optional(),
  tone: z.enum(["primary", "accent", "success", "warn"]).optional(),
});

export const PlotBlockSchema = z.object({
  kind: z.literal("plot"),
  id: z.string().optional(),
  title: z.string().optional(),
  mode: z.enum(["line", "donut", "bar"]),
  precision: z.number().int().min(0).max(6).optional(),
  points: z.array(PlotPointSchema).min(1),
  xLabel: z.string().optional(),
  yLabel: z.string().optional(),
  unit: z.string().optional(),
  max: z.number().positive().optional(),
  maxFormula: z.string().optional(),
  centerLabel: z.string().optional(),
  centerFormula: z.string().optional(),
});

const color = z.enum(["primary", "accent", "success", "warn", "muted", "text"]);
const paint = {
  fill: color.optional(),
  stroke: color.optional(),
  strokeWidth: z.number().nonnegative().optional(),
  opacity: z.number().min(0).max(1).optional(),
};
const position = {
  x: z.number().optional(), y: z.number().optional(),
  xFormula: z.string().optional(), yFormula: z.string().optional(),
};

export const SvgElementSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("rect"), ...paint, ...position,
    width: z.number().nonnegative().optional(), height: z.number().nonnegative().optional(),
    widthFormula: z.string().optional(), heightFormula: z.string().optional(),
    rx: z.number().nonnegative().optional(),
  }),
  z.strictObject({
    type: z.literal("circle"), ...paint,
    cx: z.number().optional(), cy: z.number().optional(), r: z.number().nonnegative().optional(),
    cxFormula: z.string().optional(), cyFormula: z.string().optional(), rFormula: z.string().optional(),
  }),
  z.strictObject({
    type: z.literal("line"), ...paint,
    x1: z.number().optional(), y1: z.number().optional(), x2: z.number().optional(), y2: z.number().optional(),
    x1Formula: z.string().optional(), y1Formula: z.string().optional(),
    x2Formula: z.string().optional(), y2Formula: z.string().optional(),
  }),
  z.strictObject({
    type: z.literal("path"), ...paint,
    d: z.string().min(1).regex(/^[MmZzLlHhVvCcSsQqTtAaEe0-9+.,\s-]+$/),
  }),
  ...(["polyline", "polygon"] as const).map((type) => z.strictObject({
    type: z.literal(type), ...paint,
    points: z.string().min(1).regex(/^\s*-?(?:\d+(?:\.\d*)?|\.\d+)(?:[\s,]+-?(?:\d+(?:\.\d*)?|\.\d+))+\s*$/)
      .refine((value) => value.trim().split(/[\s,]+/).length % 2 === 0, "Expected coordinate pairs"),
  })),
  z.strictObject({
    type: z.literal("text"), ...paint, ...position,
    text: z.string().optional(), textFormula: z.string().optional(),
    fontSize: z.number().positive().optional(),
    textAnchor: z.enum(["start", "middle", "end"]).optional(),
  }),
]);

export const SvgBlockSchema = z.strictObject({
  kind: z.literal("svg"),
  id: z.string().optional(),
  title: z.string().optional(),
  width: z.number().positive(),
  height: z.number().positive(),
  caption: z.string().optional(),
  elements: z.array(SvgElementSchema).min(1),
});

export type PlotPoint = z.infer<typeof PlotPointSchema>;
export type PlotBlock = z.infer<typeof PlotBlockSchema>;
export type SvgElement = z.infer<typeof SvgElementSchema>;
export type SvgTone = z.infer<typeof color>;
