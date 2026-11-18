import { z } from "zod";

export const IconNameSchema = z.enum([
  "check", "arrow", "replay", "warning", "info", "chevron",
  "arrow-down", "arrow-right", "arrow-up", "arrow-left",
  "terminal", "monitor", "cpu", "database", "server", "layers",
  "power", "refresh", "branch", "command", "copy", "clock", "link",
]);

export type IconName = z.infer<typeof IconNameSchema>;

const TintSchema = z.enum(["neutral", "primary", "accent", "success", "warn"]);
const SizeSchema = z.enum(["sm", "md", "lg"]);
const SpaceSchema = z.enum(["none", ...SizeSchema.options]);
const atomFields = { id: z.string().optional() };
const inlineFields = { ...atomFields, text: z.string() };

export const TextBlockSchema = z.strictObject({ kind: z.literal("text"), ...inlineFields });
export const TitleBlockSchema = z.strictObject({ kind: z.literal("title"), ...inlineFields });
export const CaptionBlockSchema = z.strictObject({ kind: z.literal("caption"), ...inlineFields });
export const BadgeBlockSchema = z.strictObject({
  kind: z.literal("badge"), ...inlineFields, tint: TintSchema.optional(),
});
export const DividerBlockSchema = z.strictObject({ kind: z.literal("divider"), ...atomFields });
export const IconBlockSchema = z.strictObject({
  kind: z.literal("icon"),
  ...atomFields,
  name: IconNameSchema,
  label: z.string().optional(),
  size: SizeSchema.optional(),
  tint: TintSchema.optional(),
});

export const AtomicLeafBlockSchema = z.discriminatedUnion("kind", [
  TextBlockSchema, TitleBlockSchema, CaptionBlockSchema, BadgeBlockSchema, DividerBlockSchema, IconBlockSchema,
]);

export const BoxFields = {
  kind: z.literal("box"),
  ...atomFields,
  direction: z.enum(["column", "row"]).optional(),
  align: z.enum(["start", "center", "end", "between"]).optional(),
  gap: SpaceSchema.optional(),
  padding: SpaceSchema.optional(),
  radius: SpaceSchema.optional(),
  border: z.boolean().optional(),
  tint: TintSchema.optional(),
};
