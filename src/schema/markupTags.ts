import { z } from "zod";
import {
  AccordionBlockSchema, ArchitectureBlockSchema, ArchitectureLayerSchema, ArchitectureNodeSchema,
  BoxBlockSchema, CalloutBlockSchema, ChartBarSchema, ChartBlockSchema, ChecklistBlockSchema, ChecklistItemSchema,
  ChoiceOptionSchema, ChoicesBlockSchema, CompareBlockSchema, CompareRowSchema, ControlsBlockSchema,
  DerivedMetricSchema, GridBlockSchema, SelectControlSchema, SliderControlSchema, TabsBlockSchema, ToggleControlSchema,
} from "./uiSpec.js";
import { AtomicLeafBlockSchema } from "./atoms.js";
import { CodeBlockSchema, StatItemSchema, StatsBlockSchema, TimelineBlockSchema, TimelineStepSchema } from "./content.js";
import { GraphBlockSchema, GraphEdgeSchema, GraphNodeSchema } from "./graph.js";
import { TableBlockSchema, TableColumnSchema, TableRowSchema } from "./table.js";
import { CurveSeriesSchema, PlotBlockSchema, PlotPointSchema, SvgBlockSchema, SvgElementSchema } from "./vector.js";

export type BlockLevel = "root" | "box" | "grid" | "panel" | "atomic";

export interface ChildRule {
  tag: string;
  field: string;
  single?: true;
  key?: string;
  value?: string;
}

export interface MarkupTag {
  schema: z.ZodObject;
  block?: boolean;
  blocks?: BlockLevel;
  list?: ChildRule[];
  body?: "inline" | "literal" | "code";
  alias?: Record<string, string>;
  fixed?: Record<string, string>;
}

const scalar = z.union([z.string(), z.number(), z.boolean()]);
const valueTag = z.object({ value: z.string() });
const value = (tag: string, field: string): ChildRule => ({ tag, field, value: "value" });
const controlItems = [
  { tag: "slider", field: "controls" }, { tag: "toggle", field: "controls" }, { tag: "select", field: "controls" },
];
const tags = new Map<string, MarkupTag>([
  ["box", { schema: BoxBlockSchema, block: true, blocks: "box" }],
  ["grid", { schema: GridBlockSchema, block: true, blocks: "grid" }],
  ["tabs", { schema: TabsBlockSchema, block: true, list: [{ tag: "tab", field: "tabs" }] }],
  ["tab", { schema: TabsBlockSchema.shape.tabs.element, blocks: "panel" }],
  ["accordion", { schema: AccordionBlockSchema, block: true, list: [{ tag: "section", field: "items" }] }],
  ["section", { schema: AccordionBlockSchema.shape.items.element, blocks: "panel" }],
  ["controls", { schema: ControlsBlockSchema, block: true, list: [...controlItems, { tag: "metric", field: "metrics" }] }],
  ["slider", { schema: SliderControlSchema, alias: { default: "defaultValue" } }],
  ["toggle", { schema: ToggleControlSchema, alias: { default: "defaultValue" } }],
  ["select", { schema: SelectControlSchema, list: [value("option", "options")], alias: { default: "defaultValue" } }],
  ["option", { schema: valueTag }],
  ["metric", { schema: DerivedMetricSchema }],
  ["stats", { schema: StatsBlockSchema, block: true, list: [{ tag: "stat", field: "items" }] }],
  ["stat", { schema: StatItemSchema }],
  ["chart", { schema: ChartBlockSchema, block: true, list: [{ tag: "bar", field: "bars" }] }],
  ["bar", { schema: ChartBarSchema }],
  ["plot", { schema: PlotBlockSchema, block: true, list: [{ tag: "curve", field: "curves" }, { tag: "point", field: "points" }] }],
  ["curve", { schema: CurveSeriesSchema }],
  ["point", { schema: PlotPointSchema }],
  ["graph", { schema: GraphBlockSchema, block: true, list: [{ tag: "node", field: "nodes" }, { tag: "edge", field: "edges" }] }],
  ["node", { schema: GraphNodeSchema }],
  ["edge", { schema: GraphEdgeSchema }],
  ["table", { schema: TableBlockSchema, block: true, list: [
    { tag: "column", field: "columns" }, { tag: "row", field: "rows" }, { tag: "filter", field: "filter", single: true },
  ] }],
  ["column", { schema: TableColumnSchema }],
  ["row", { schema: TableRowSchema, list: [{ tag: "cell", field: "values", key: "column", value: "value" }] }],
  ["cell", { schema: z.object({ column: z.string().min(1), value: z.union([z.string(), z.number()]) }) }],
  ["filter", { schema: TableBlockSchema.shape.filter.unwrap(), list: [value("option", "options")] }],
  ["choices", { schema: ChoicesBlockSchema, block: true, list: [{ tag: "choice", field: "options" }] }],
  ["choice", { schema: ChoiceOptionSchema, list: [{ tag: "set", field: "setVars", key: "var", value: "value" }] }],
  ["set", { schema: z.object({ var: z.string().min(1), value: scalar }) }],
  ["compare", { schema: CompareBlockSchema, block: true, list: [value("option", "columns"), { tag: "criterion", field: "rows" }] }],
  ["criterion", { schema: CompareRowSchema, list: [value("option", "values")] }],
  ["checklist", { schema: ChecklistBlockSchema, block: true, list: [{ tag: "item", field: "items" }] }],
  ["item", { schema: ChecklistItemSchema }],
  ["timeline", { schema: TimelineBlockSchema, block: true, list: [{ tag: "step", field: "steps" }] }],
  ["step", { schema: TimelineStepSchema }],
  ["architecture", { schema: ArchitectureBlockSchema, block: true, list: [{ tag: "layer", field: "layers" }] }],
  ["layer", { schema: ArchitectureLayerSchema, list: [{ tag: "component", field: "nodes" }] }],
  ["component", { schema: ArchitectureNodeSchema }],
  ["callout", { schema: CalloutBlockSchema, block: true, body: "literal" }],
  ["code", { schema: CodeBlockSchema, block: true, body: "code" }],
  ["frame", { schema: z.object({ title: z.string().optional(), subtitle: z.string().optional(), badge: z.string().optional() }) }],
  ["button", { schema: z.object({
    action: z.enum(["send_message", "copy_state"]), label: z.string().min(1), promptTemplate: z.string().optional(),
  }) }],
]);

export const atomicTags = new Set<string>();
for (const schema of AtomicLeafBlockSchema.options) {
  const name = schema.shape.kind.value;
  atomicTags.add(name);
  tags.set(name, { schema, block: true, ...("text" in schema.shape ? { body: "inline" } : {}) });
}

const shapes = SvgElementSchema.options.map((schema): ChildRule => {
  const name = schema.shape.type.value;
  const tag = name === "text" ? "svg-text" : name;
  tags.set(tag, { schema, fixed: { type: name } });
  return { tag, field: "elements" };
});
tags.set("svg", { schema: SvgBlockSchema, block: true, list: shapes });

export const markupTags: ReadonlyMap<string, MarkupTag> = tags;
