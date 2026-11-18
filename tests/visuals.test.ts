import assert from "node:assert/strict";
import test from "node:test";
import { DiagramInputSchema, compileDiagram } from "../src/compile.js";
import { RECIPES } from "../src/examples.js";
import { curveSegments, curveSummary, sampleCurve } from "../src/runtime/curve.js";
import { evaluateNumericFormula, evaluateNumericSample } from "../src/runtime/formula.js";
import { layoutGraph } from "../src/runtime/graphLayout.js";
import {
  filterTableRows, formatCell, resolveCell, sortTableRows, statusValues,
} from "../src/runtime/table.js";
import { renderFallbackMarkdown } from "../src/schema/fallback.js";
import { UiSpecSchema, parsePartialUiSpec } from "../src/schema/uiSpec.js";

function assertDisjoint(boxes: Array<{ x: number; y: number; width: number; height: number }>, width: number, height: number) {
  for (const box of boxes) {
    assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= width && box.y + box.height <= height);
  }
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i];
      const b = boxes[j];
      const overlap = a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
      assert.equal(overlap, false, `boxes ${i} and ${j} overlap`);
    }
  }
}

test("graph layout is deterministic, bounded, non-overlapping, and survives cycles", () => {
  const nodes = [
    { id: "a", label: "Alpha", role: "Source" },
    { id: "b", label: "Beta", group: "core" },
    { id: "c", label: "Gamma", role: "Sink" },
    { id: "d", label: "Delta" },
  ];
  const edges = [
    { from: "a", to: "b" }, { from: "a", to: "c" }, { from: "b", to: "d" },
    { from: "d", to: "c" }, { from: "c", to: "a", label: "back" },
    { from: "ghost", to: "a" },
  ];
  for (const direction of ["LR", "TB"] as const) {
    const layout = layoutGraph(nodes, edges, direction);
    assert.equal(layout.nodes.length, 4);
    assert.equal(layout.edges.length, 5);
    assert.ok(layout.width > 0 && layout.height > 0);
    assertDisjoint(layout.nodes, layout.width, layout.height);
    for (const edge of layout.edges) {
      assert.match(edge.d, /^M/);
      assert.ok(edge.arrow.split(/\s+/).length === 3);
    }
    assert.deepEqual(layoutGraph(nodes, edges, direction), layout);
  }
});

test("curve sampling breaks on undefined points and recomputes with scope variables", () => {
  assert.equal(Number.isFinite(evaluateNumericSample("1 / x", { x: 0 })), false);
  assert.equal(evaluateNumericFormula("1 / x", { x: 0 }, 9), 0);
  const halves = sampleCurve("1 / x", -1, 1, 5, {});
  assert.equal(halves.length, 5);
  assert.equal(halves[2].y, null);
  const segments = curveSegments(halves);
  assert.equal(segments.length, 2);
  assert.ok(segments.every((segment) => segment.every((point) => point.y !== null)));
  const scaled = sampleCurve("x * gain", 0, 10, 3, { gain: 2 });
  assert.deepEqual(scaled.map((point) => point.y), [0, 10, 20]);
  const renamed = sampleCurve("t * gain", 0, 2, 3, { gain: 2 }, "t");
  assert.deepEqual(renamed.map((point) => point.y), [0, 2, 4]);
  const summary = curveSummary(scaled);
  assert.deepEqual(summary.map((point) => point.label), ["Start", "Midpoint", "End", "Minimum", "Maximum"]);
});

test("table sorting, filtering, status pills, and derived cells use real row values", () => {
  const rows = [
    { values: { name: "Beta", latency: 20, status: "ok" } },
    { values: { name: "Alpha", latency: 5, status: "warn" } },
    { values: { name: "Gamma", latency: 12, status: "ok" } },
  ];
  const columns = [
    { key: "name", label: "Name", sortable: true },
    { key: "latency", label: "Latency", precision: 1, sortable: true },
    { key: "double", label: "Double", formula: "latency * 2" },
  ];
  assert.deepEqual(sortTableRows(rows, columns, { key: "latency", direction: "asc" }).map((row) => row.values.latency), [5, 12, 20]);
  assert.deepEqual(sortTableRows(rows, columns, { key: "name", direction: "desc" }).map((row) => row.values.name), ["Gamma", "Beta", "Alpha"]);
  assert.deepEqual(filterTableRows(rows, "alp").map((row) => row.values.name), ["Alpha"]);
  assert.equal(filterTableRows(rows, "", "status", "ok").length, 2);
  assert.deepEqual(statusValues(rows, "status"), ["ok", "warn"]);
  assert.equal(resolveCell(rows[0], columns[2], {}), 40);
  assert.equal(formatCell(resolveCell(rows[0], columns[2], {}), 0), "40");
});

test("diagram compiler validates edges and variables and accepts label references", () => {
  const compiled = compileDiagram(DiagramInputSchema.parse(RECIPES.diagram));
  assert.ok(compiled.ok);
  const spec = UiSpecSchema.parse(compiled.spec);
  const graph = spec.blocks.find((block) => block.kind === "graph");
  assert.ok(graph?.kind === "graph");
  assert.equal(graph.nodes.length, RECIPES.diagram.nodes.length);
  assert.equal(graph.edges.length, RECIPES.diagram.edges!.length);

  const byLabel = compileDiagram(DiagramInputSchema.parse({
    title: "Trip", nodes: [{ label: "API" }, { label: "DB" }], edges: [{ from: "API", to: "DB" }],
  }));
  assert.ok(byLabel.ok);
  const byLabelGraph = byLabel.spec.blocks.find((block) => block.kind === "graph");
  assert.ok(byLabelGraph?.kind === "graph");
  assert.deepEqual(byLabelGraph.edges.map((edge) => [edge.from, edge.to]), [["api", "db"]]);

  const failures: Array<[Record<string, unknown>, RegExp]> = [
    [{ nodes: [{ id: "a", label: "A" }], edges: [{ from: "a", to: "missing" }] }, /unknown target/],
    [{ nodes: [{ id: "a", label: "A", valueFormula: "ghost" }] }, /unknown variable "ghost"/],
    [{ nodes: [{ id: "a", label: "A" }], edges: [{ from: "a", to: "a", activeFormula: "nope" }] }, /unknown variable "nope"/],
  ];
  for (const [overrides, message] of failures) {
    const failed = compileDiagram(DiagramInputSchema.parse({ title: "Bad", ...overrides }));
    assert.equal(failed.ok, false);
    assert.match(failed.ok ? "" : failed.issues.join("\n"), message);
  }
});

test("graph, table, and curve blocks degrade to Markdown and tolerate partial streams", () => {
  const spec = UiSpecSchema.parse({
    title: "Visual contracts",
    blocks: [
      { kind: "controls", controls: [{ kind: "slider", id: "gain", label: "Gain", min: 0, max: 10, defaultValue: 2 }] },
      { kind: "plot", mode: "line", xMin: 0, xMax: 4, curves: [{ label: "Linear", formula: "x * gain" }] },
      { kind: "graph", nodes: [{ id: "a", label: "Alpha", role: "Source" }, { id: "b", label: "Beta" }], edges: [{ from: "a", to: "b", label: "call" }] },
      { kind: "table", columns: [
        { key: "name", label: "Name" },
        { key: "score", label: "Score", formula: "gain * 10" },
      ], rows: [{ values: { name: "Alpha" } }, { values: { name: "Beta" } }], filter: { key: "name" } },
    ],
  });
  const markdown = renderFallbackMarkdown(spec);
  for (const text of ["Linear", "Alpha", "Beta", "call", "Name", "Score", "20"]) assert.ok(markdown.includes(text), `missing ${text}`);

  const graphStream = parsePartialUiSpec({ title: "Graph", blocks: [
    { kind: "graph", nodes: [{ id: "a", label: "A" }], edges: [{ from: "a", to: "b" }, {}] },
  ] });
  assert.deepEqual(graphStream.blocks.map((block) => block.kind), ["graph"]);
  assert.equal(graphStream.pendingBlockCount, 1);
  const streamedGraph = graphStream.blocks[0];
  assert.ok(streamedGraph.kind === "graph");
  assert.equal(streamedGraph.edges.length, 1);

  const tableStream = parsePartialUiSpec({ title: "Table", blocks: [
    { kind: "table", columns: [{ key: "a", label: "A" }], rows: [{ values: { a: 1 } }, {}] },
  ] });
  assert.deepEqual(tableStream.blocks.map((block) => block.kind), ["table"]);
  assert.equal(tableStream.pendingBlockCount, 1);
  const streamedTable = tableStream.blocks[0];
  assert.ok(streamedTable.kind === "table");
  assert.equal(streamedTable.rows.length, 1);

  const curveStream = parsePartialUiSpec({ title: "Curves", blocks: [
    { kind: "plot", mode: "line", xMin: 0, xMax: 1, curves: [{ label: "ok", formula: "x" }, {}] },
  ] });
  assert.deepEqual(curveStream.blocks.map((block) => block.kind), ["plot"]);
  assert.equal(curveStream.pendingBlockCount, 1);
  const unfinished = parsePartialUiSpec({ title: "Incomplete", blocks: [
    { kind: "plot", mode: "line", curves: [{ label: "curve", formula: "x" }] },
  ] });
  assert.deepEqual(unfinished.blocks, []);
  assert.equal(unfinished.pendingBlockCount, 1);
});
