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
  example?: string;
}

const examples: Record<string, string> = {
  box: '<box tint="accent" padding="md"><text>Summary</text></box>',
  grid: '<grid columns={2}><box><text>Left</text></box><box><text>Right</text></box></grid>',
  tabs: '<tabs><tab label="Main"><text>Body</text></tab></tabs>',
  tab: '<tab label="Overview"><text>Content</text></tab>',
  accordion: '<accordion><section label="Details"><text>More</text></section></accordion>',
  section: '<section label="Details"><text>More</text></section>',
  slider: '<slider id="n" label="Count" min={1} max={10} default={3}/>',
  toggle: '<toggle id="flag" label="Enable" default={true}/>',
  select: '<select id="mode" label="Mode"><option value="fast"/><option value="safe"/></select>',
  metric: '<metric label="Total" formula={n * 2}/>',
  stat: '<stat label="Latency" value="12 ms" tone="primary"/>',
  bar: '<bar label="GPU" formula={n * 10}/>',
  plot: '<plot mode="line" xVariable="x" xMin={0} xMax={10}><curve label="Y" formula={x * 2}/><point label="Now" x={4} y={8}/></plot>',
  curve: '<curve label="Throughput" formula={x * 2}/>',
  point: '<point label="Current" x={4} y={8}/>',
  graph: '<graph><node id="a" label="Client"/><node id="b" label="API"/><edge from="a" to="b"/></graph>',
  node: '<node id="api" label="API" role="Service"/>',
  edge: '<edge from="a" to="b" label="HTTP"/>',
  table: '<table><filter key="name" placeholder="Filter..."/><column key="name" label="Name" sortable/><row><cell key="name" value="Item"/></row></table>',
  column: '<column key="name" label="Name" sortable/>',
  row: '<row><cell key="name" value="Item"/></row>',
  cell: '<cell key="name" value="Item"/>',
  filter: '<filter key="name" placeholder="Search..."/>',
  choices: '<choices><choice id="opt_a" label="Option A"/></choices>',
  choice: '<choice id="opt_a" label="Option A" summary="Recommended"/>',
  set: '<set var="mode" value="fast"/>',
  compare: '<compare><option value="A"/><option value="B"/><criterion label="Cost"><option value="Low"/><option value="High"/></criterion></compare>',
  criterion: '<criterion label="Latency"><option value="12 ms"/><option value="40 ms"/></criterion>',
  checklist: '<checklist><item label="Verify build" done={true}/></checklist>',
  item: '<item label="Run tests" done={false}/>',
  timeline: '<timeline><step label="Build" status="done"/></timeline>',
  step: '<step label="Verify" status="active" detail="Run tests"/>',
  architecture: '<architecture><layer label="UI"><component label="Card"/></layer></architecture>',
  layer: '<layer label="Runtime"><component label="Compiler"/></layer>',
  component: '<component label="Compiler" role="Validator"/>',
  callout: '<callout title="Note" tone="accent">Details here</callout>',
  code: '<code language="ts">const x = 1;</code>',
  button: '<button action="send_message" label="Apply" promptTemplate="Apply choice"/>',
  text: '<text>Use **bold** and {var}.</text>',
  title: '<title>Heading</title>',
  caption: '<caption>Secondary note</caption>',
  badge: '<badge label="Ready" tone="success"/>',
  icon: '<icon name="arrow-down"/>',
};

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
  ["cell", { schema: z.object({ column: z.string().min(1), value: z.union([z.string(), z.number()]) }), alias: { key: "column" } }],
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

for (const [name, tag] of tags) {
  if (!tag.example && examples[name]) tag.example = examples[name];
}

const controlDefaulted = new Set(["min", "max", "defaultValue"]);

/** Summarizes valid attributes, required fields, and a minimal example for an element tag. */
export function tagUsageHint(name: string, tag: MarkupTag): string {
  const hidden = new Set([
    "kind",
    ...(tag.fixed ? Object.keys(tag.fixed) : []),
    ...(tag.blocks ? ["children"] : []),
    ...(tag.list?.map((rule) => rule.field) ?? []),
    ...(tag.body ? [tag.body === "inline" ? "text" : tag.body === "literal" ? "body" : "code"] : []),
  ]);
  const toAttr = new Map<string, string>();
  for (const [alias, target] of Object.entries(tag.alias ?? {})) toAttr.set(target, alias);
  const attrs: string[] = [];
  for (const [field, schema] of Object.entries(tag.schema.shape)) {
    if (hidden.has(field)) continue;
    const attr = toAttr.get(field) ?? field;
    const required = !schema.isOptional() && !(controlDefaulted.has(field) && ["slider", "toggle", "select"].includes(name));
    attrs.push(required ? `${attr} (required)` : attr);
  }
  const attrNote = attrs.length
    ? `Valid attributes for <${name}>: ${attrs.join(", ")}.`
    : tag.body
      ? `<${name}> wraps text content.`
      : `Supported children for <${name}>: ${(tag.list ?? []).map((rule) => `<${rule.tag}>`).join(", ") || "blocks"}.`;
  return tag.example ? `${attrNote} Example: ${tag.example}` : attrNote;
}

export const markupTags: ReadonlyMap<string, MarkupTag> = tags;
