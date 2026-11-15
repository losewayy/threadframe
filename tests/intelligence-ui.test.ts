import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";
import { PRESETS } from "../src/presets.js";
import { UiStateStore } from "../src/runtime/core/state.js";
import { evaluateFormula, evaluateNumericFormula } from "../src/runtime/formula.js";
import { renderFallbackMarkdown } from "../src/schema/fallback.js";
import { parsePartialUiSpec, UiSpecSchema, walkBlocks } from "../src/schema/uiSpec.js";

test("formula evaluator computes arithmetic, ternary, and built-in math safely", () => {
  const scope = { quant: "Q4_K", ctx_k: 16, batch: 2, flash_attn: true };
  assert.equal(evaluateFormula("2 + 3 * 4", {}), 14);
  assert.equal(evaluateFormula("round((quant == 'FP16' ? 15.2 : 4.6) + 0.8, 1)", scope), 5.4);
  assert.equal(
    evaluateNumericFormula("clamp(round(ctx_k * batch * 0.045, 1), 0, 10)", scope),
    1.4,
  );
  assert.equal(evaluateFormula("flash_attn ? 8 : 0", scope), 8);
});

test("tool JSON Schema is finite and contains no recursive references", () => {
  const schema = z.toJSONSchema(UiSpecSchema);
  const inspect = (value: unknown): void => {
    if (typeof value !== "object" || value === null) return;
    assert.ok(!Object.hasOwn(value, "$ref"), "bounded containers should be expanded inline");
    for (const child of Object.values(value)) inspect(child);
  };
  inspect(schema);
  assert.equal(schema.type, "object");
});

const note = { kind: "callout", body: "A planning note", tone: "info", items: ["Check the budget"] } as const;
const nestedSpec = () => UiSpecSchema.parse({
  title: "Nested planning",
  blocks: [
    {
      kind: "tabs", defaultTab: "budget", tabs: [
        { id: "budget", label: "Budget", children: [{ kind: "grid", children: [
          { kind: "chart", bars: [{ label: "Computed budget", formula: "nested_x * 2" }] },
          { kind: "controls", controls: [
            { kind: "slider", id: "nested_x", label: "Nested value", min: 0, max: 10, defaultValue: 4 },
          ], metrics: [{ label: "Derived", formula: "nested_x * 2" }] },
        ] }] },
        { id: "notes", label: "Notes", children: [note] },
      ],
    },
    { kind: "accordion", items: [{ id: "details", title: "Details", summary: "Review", defaultOpen: true,
      children: [{ kind: "grid", columns: 1, children: [
        { kind: "checklist", items: [{ id: "nested_check", label: "Recorded", checked: true }] },
        { kind: "architecture", layers: [{ layer: "Runtime", nodes: [{ id: "nested_node", label: "Worker", role: "Compute" }] }] },
      ] }],
    }] },
  ],
});

test("bounded composition accepts only leaves inside grids and at most one grid inside tabs or accordions", () => {
  const leaf = { kind: "callout", body: "Note" };
  const valid = nestedSpec();
  const first = valid.blocks[0];
  assert.equal(first.kind, "tabs");
  if (first.kind !== "tabs") return;
  const grid = first.tabs[0].children[0];
  assert.equal(grid.kind, "grid");
  if (grid.kind === "grid") assert.equal(grid.columns, 2);
  for (const columns of [1, 2, 3]) {
    assert.equal(UiSpecSchema.safeParse({ title: "Grid", blocks: [{ kind: "grid", columns, children: [leaf] }] }).success, true);
  }
  for (const block of [
    { kind: "grid", children: [] },
    { kind: "grid", columns: 4, children: [leaf] },
    { kind: "grid", children: [{ kind: "grid", children: [leaf] }] },
    { kind: "tabs", tabs: [] },
    { kind: "tabs", tabs: [{ id: "a", label: "A", children: [] }] },
    { kind: "tabs", tabs: [{ id: "a", label: "A", children: [{ kind: "tabs", tabs: [{ id: "b", label: "B", children: [leaf] }] }] }] },
    { kind: "accordion", items: [{ id: "a", title: "A", children: [] }] },
  ]) {
    assert.equal(UiSpecSchema.safeParse({ title: "Invalid nesting", blocks: [block] }).success, false);
  }
});

test("shared traversal visits hidden panels and nested leaves in document order", () => {
  const kinds: string[] = [];
  walkBlocks(nestedSpec().blocks, (block) => kinds.push(block.kind));
  assert.deepEqual(kinds, ["tabs", "grid", "chart", "controls", "callout", "accordion", "grid", "checklist", "architecture"]);
});

test("Markdown fallback initializes nested controls before computing sibling chart and metric formulas", () => {
  const markdown = renderFallbackMarkdown(nestedSpec());
  assert.match(markdown, /\b8\b/);
  for (const text of ["Computed budget", "Derived", "Budget", "Notes", "A planning note", "Check the budget", "Details", "Recorded", "Worker"]) {
    assert.ok(markdown.includes(text), `Nested content missing: ${text}`);
  }
});

test("partial streams preserve valid blocks while top-level or nested trailing blocks are incomplete", () => {
  const unfinishedControl = { kind: "controls", controls: [{ kind: "slider", id: "half" }] };
  const unfinishedTabs = {
    kind: "tabs", tabs: [{ id: "budget", label: "Budget", children: [
      { kind: "grid", children: [unfinishedControl] },
    ] }],
  };
  for (const unfinished of [unfinishedControl, unfinishedTabs]) {
    const parsed = parsePartialUiSpec({ title: "Streaming panel", blocks: [note, unfinished] });
    assert.equal(parsed.title, "Streaming panel");
    assert.deepEqual(parsed.blocks.map((block) => block.kind), ["callout"]);
    assert.equal(parsed.pendingBlockCount, 1);
    assert.equal(parsed.isComplete, false);
  }
  const complete = nestedSpec();
  const finished = parsePartialUiSpec({ ...complete, blocks: [note, ...complete.blocks] });
  assert.equal(finished.blocks.length, complete.blocks.length + 1);
  assert.equal(finished.pendingBlockCount, 0);
  assert.equal(finished.isComplete, true);
});

test("nested state defaults and container selections survive new streaming objects", () => {
  const state = new UiStateStore();
  const spec = nestedSpec();
  state.initDefaults(spec.blocks);
  assert.equal(state.scope.nested_x, 4);
  assert.equal(state.checklistState.get("nested_check"), true);
  assert.equal(state.selectedNodeId, "nested_node");
  const tabKey = state.containerKey(spec.blocks[0]);
  const accordionKey = state.containerKey(spec.blocks[1]);
  const itemKey = JSON.stringify([accordionKey, "details"]);
  assert.equal(state.tabSelections.get(tabKey), "budget");
  assert.equal(state.accordionOpen.get(itemKey), true);
  state.tabSelections.set(tabKey, "notes");
  state.accordionOpen.set(itemKey, false);
  state.scope.nested_x = 7;
  const next = nestedSpec();
  state.initDefaults(next.blocks);
  assert.equal(state.containerKey(next.blocks[0]), tabKey);
  assert.equal(state.tabSelections.get(tabKey), "notes");
  assert.equal(state.accordionOpen.get(itemKey), false);
  assert.equal(state.scope.nested_x, 7);
  const sibling = nestedSpec().blocks[0];
  state.initDefaults([next.blocks[0], sibling]);
  assert.notEqual(state.containerKey(sibling), tabKey);
});

test("formula evaluator returns null / fallback cleanly on malformed partial strings", () => {
  assert.equal(evaluateFormula("2 + (3 *", {}), null);
  assert.equal(evaluateFormula("'unterminated", {}), null);
  assert.equal(evaluateNumericFormula("unknownFn(1)", {}, 42), 42);
});

test("all built-in presets conform to UiSpecSchema and render non-empty Markdown fallback", () => {
  assert.ok(PRESETS["composable-workbench"]);
  for (const [key, spec] of Object.entries(PRESETS)) {
    const validated = UiSpecSchema.parse(spec);
    assert.ok(validated.blocks.length >= 1, `${key} should have at least one block`);

    const md = renderFallbackMarkdown(validated);
    assert.ok(md.includes(validated.title), `${key} markdown missing title`);
    assert.ok(!md.includes("NaN"), `${key} markdown contains NaN`);
    assert.ok(!md.includes("undefined"), `${key} markdown contains undefined`);
  }
});
