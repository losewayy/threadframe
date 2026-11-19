import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import type { ClientCapabilities, JSONRPCRequest } from "@modelcontextprotocol/server";
import { RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import { z } from "zod";
import { createServer, UI_RESOURCE_URI } from "../server.js";
import { detectClientAdapter } from "../src/clientAdapter.js";
import { injectStandaloneHtml } from "../src/export.js";
import { SVG_EXAMPLES } from "../src/examples.js";
import { PRESETS } from "../src/presets.js";
import { UiStateStore } from "../src/runtime/core/state.js";
import { interpolateCode } from "../src/runtime/display.js";
import { evaluateFormula, evaluateNumericFormula } from "../src/runtime/formula.js";
import { renderFallbackMarkdown } from "../src/schema/fallback.js";
import { parsePartialUiSpec, UiSpecSchema, choiceAssignmentIssues, walkBlocks } from "../src/schema/uiSpec.js";
import { VERSION } from "../src/version.js";

test("formula evaluator computes arithmetic, ternary, and built-in math safely", () => {
  const scope = { quant: "Q4_K", ctx_k: 16, batch: 2, flash_attn: true };
  assert.equal(evaluateFormula("2 + 3 * 4", {}), 14);
  assert.equal(evaluateFormula("round((quant == 'FP16' ? 15.2 : 4.6) + 0.8, 1)", scope), 5.4);
  assert.equal(
    evaluateNumericFormula("clamp(round(ctx_k * batch * 0.045, 1), 0, 10)", scope),
    1.4,
  );
  assert.equal(evaluateFormula("flash_attn ? 8 : 0", scope), 8);
  assert.equal(evaluateFormula("round(vram, 1) + ' GB'", { vram: 2.56 }), "2.6 GB");
  assert.equal(evaluateFormula("'load=' + 4 + true", {}), "load=4true");
  assert.equal(evaluateFormula("true + 4", {}), 5);
  assert.equal(evaluateFormula("4 + true + ' units'", {}), "5 units");
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
  const unfinishedCanvas = { kind: "svg", width: 120, height: 90, elements: [
    { type: "rect", width: 20, height: 10 }, { type: "circ" },
  ] };
  const unfinishedPlot = { kind: "tabs", tabs: [{ id: "vector", label: "Vector", children: [
    { kind: "grid", children: [{ kind: "plot", mode: "line", points: [{ label: "Ready", value: 2 }, {}] }] },
  ] }] };
  for (const [unfinished, visible] of [
    [unfinishedControl, ["callout"]], [unfinishedTabs, ["callout"]],
    [unfinishedCanvas, ["callout", "svg"]], [unfinishedPlot, ["callout", "tabs"]],
    [{ kind: "stats", items: [{ label: "Ready", value: 2 }, {}] }, ["callout", "stats"]],
    [{ kind: "timeline", steps: [{ id: "a", title: "Ready", status: "done" }, { id: "b" }] }, ["callout", "timeline"]],
    [{ kind: "code" }, ["callout"]],
  ] as const) {
    const parsed = parsePartialUiSpec({ title: "Streaming panel", blocks: [note, unfinished] });
    assert.equal(parsed.title, "Streaming panel");
    assert.deepEqual(parsed.blocks.map((block) => block.kind), visible);
    assert.equal(parsed.pendingBlockCount, 1);
    assert.equal(parsed.isComplete, false);
    walkBlocks(parsed.blocks, (block) => {
      if (block.kind === "plot") assert.equal(block.points?.length, 1);
      if (block.kind === "svg") assert.equal(block.elements.length, 1);
      if (block.kind === "stats") assert.equal(block.items.length, 1);
      if (block.kind === "timeline") assert.equal(block.steps.length, 1);
    });
  }
  const complete = nestedSpec();
  const finished = parsePartialUiSpec({ ...complete, blocks: [note, ...complete.blocks] });
  assert.equal(finished.blocks.length, complete.blocks.length + 1);
  assert.equal(finished.pendingBlockCount, 0);
  assert.equal(finished.isComplete, true);
});

function vectorSpec() {
  return UiSpecSchema.parse({
    title: "Vector experiment",
    blocks: [
      { kind: "controls", controls: [{ kind: "slider", id: "gain", label: "Gain", min: 0, max: 20, defaultValue: 13 }] },
      { kind: "plot", mode: "line", title: "Measured response", xLabel: "Time", yLabel: "Output",
        points: [{ label: "Input", value: 3, formula: "gain * 3" }, { label: "Baseline", value: 5 }] },
      { kind: "plot", mode: "donut", centerLabel: "Metric", centerFormula: "gain * 4",
        points: [{ label: "Allocated", formula: "gain" }, { label: "Remaining", value: 7 }] },
      { kind: "svg", title: "Capacity drawing", width: 120, height: 90, caption: "Adjusted geometry",
        elements: [
          { type: "rect", width: 4, widthFormula: "gain * 2", height: 8, fill: "primary" },
          { type: "circle", cx: 70, cy: 30, rFormula: "gain / 2", fill: "accent" },
          { type: "line", x1: 0, y1: 0, x2Formula: "gain + 1", y2: 30, stroke: "muted" },
          { type: "path", d: "M0 0 L10 10", stroke: "success" },
          { type: "text", x: 10, y: 80, text: "Waiting", textFormula: "gain * 4" },
        ],
      },
    ],
  });
}

test("vector schemas accept supported plots and primitives but reject unsafe attributes and canvas bounds", () => {
  const valid = vectorSpec();
  assert.equal(valid.blocks.length, 4);
  assert.ok(UiSpecSchema.safeParse({ title: "Bars", blocks: [
    { kind: "plot", mode: "bar", precision: 2, points: [{ label: "Measured", formula: "gain * 2" }] },
    { kind: "svg", width: 100, height: 80, elements: [
      { type: "polyline", points: "0,0 10,20 30,10", stroke: "primary" },
      { type: "polygon", points: "0 0 20 0 10 20", fill: "success" },
    ] },
  ] }).success);
  for (const element of [
    { type: "script", text: "alert(1)" }, { type: "foreignObject" },
    { type: "rect", width: 10, onclick: "alert(1)" },
    { type: "text", text: "link", href: "https://example.com" },
    { type: "circle", r: 4, fill: "url(https://example.com/image)" },
    { type: "polyline", points: "0,0 javascript:alert(1)" },
    { type: "polygon", points: "0,0 10" },
  ]) {
    assert.equal(UiSpecSchema.safeParse({ title: "Unsafe vector", blocks: [
      { kind: "svg", width: 100, height: 80, elements: [element] },
    ] }).success, false);
  }
  for (const [width, height] of [[0, 80], [-1, 80], [100, 0], [100, -1]]) {
    assert.equal(UiSpecSchema.safeParse({ title: "Invalid canvas", blocks: [
      { kind: "svg", width, height, elements: [{ type: "rect", width: 10, height: 10 }] },
    ] }).success, false);
  }
  assert.equal(UiSpecSchema.safeParse({ title: "Invalid plot", blocks: [
    { kind: "plot", mode: "unsupported", points: [{ label: "A", value: 1 }] },
  ] }).success, false);
});

test("vector fallback resolves control formulas and degrades unfinished expressions without losing summaries", () => {
  const spec = vectorSpec();
  const markdown = renderFallbackMarkdown(spec);
  for (const text of ["Measured response", "Input", "Metric", "Capacity drawing", "Adjusted geometry", "rect", "circle", "line", "path", "text"]) {
    assert.ok(markdown.includes(text), `Vector summary missing: ${text}`);
  }
  for (const result of [26, 39, 52]) assert.match(markdown, new RegExp(`\\b${result}\\b`));
  walkBlocks(spec.blocks, (block) => {
    if (block.kind === "plot" && block.points?.length) block.points[0].formula = "gain * (";
    if (block.kind === "svg") {
      for (const element of block.elements) {
        if (element.type === "rect") element.widthFormula = "gain * (";
        if (element.type === "text") element.textFormula = "'unfinished";
      }
    }
  });
  const fallback = renderFallbackMarkdown(spec);
  assert.ok(fallback.includes("Waiting"));
  assert.match(fallback, /\b3\b/);
  assert.match(fallback, /\b4\b/);
  assert.ok(!fallback.includes("NaN") && !fallback.includes("undefined"));
});

test("choice presets only assign declared, in-range control variables", () => {
  const controls = [
    { kind: "slider", id: "gain", label: "Gain", min: 0, max: 10, defaultValue: 2 },
    { kind: "select", id: "format", label: "Format", options: ["Q4_K", "FP16"], defaultValue: "Q4_K" },
    { kind: "toggle", id: "flash", label: "Flash", defaultValue: false },
  ];
  const spec = (setVars?: Record<string, number | string | boolean>, withControls = true) => UiSpecSchema.parse({
    title: "Preset assignment",
    blocks: [
      ...(withControls ? [{ kind: "controls", controls }] : []),
      { kind: "choices", options: [{ id: "profile", label: "Profile", setVars }] },
    ],
  });
  assert.deepEqual(choiceAssignmentIssues(spec({ gain: 6, format: "FP16", flash: true }).blocks), []);
  const cases: Array<[Record<string, number | string | boolean>, RegExp]> = [
    [{ ghost: 1 }, /ghost.*no controls block declares/],
    [{ format: "Q6_K" }, /expected one of Q4_K, FP16/],
    [{ gain: 11 }, /expected a number from 0 to 10/],
    [{ gain: "6" }, /expected a number from 0 to 10/],
    [{ flash: 1 }, /expected a boolean/],
  ];
  for (const [setVars, message] of cases) {
    const issues = choiceAssignmentIssues(spec(setVars).blocks);
    assert.equal(issues.length, 1);
    assert.match(issues[0], message);
  }
  assert.match(choiceAssignmentIssues(spec({ gain: 6 }, false).blocks)[0], /no controls block declares/);
});

test("nested state defaults and container selections survive new streaming objects", () => {
  const state = new UiStateStore();
  const spec = nestedSpec();
  state.initDefaults(spec.blocks);
  assert.equal(state.scope.nested_x, 4);
  assert.equal(state.checklistState.get("nested_check"), true);
  assert.deepEqual([...state.nodeSelections.values()], ["nested_node"]);
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

  const stacks = UiSpecSchema.parse({ title: "Two stacks", blocks: [
    { kind: "architecture", id: "first", layers: [{ layer: "One", nodes: [
      { id: "a1", label: "A1", role: "Compute" }, { id: "a2", label: "A2", role: "Compute" },
    ] }] },
    { kind: "architecture", id: "second", layers: [{ layer: "Two", nodes: [{ id: "b1", label: "B1", role: "Compute" }] }] },
  ] });
  const architectureState = new UiStateStore();
  architectureState.initDefaults(stacks.blocks);
  const [firstKey, secondKey] = stacks.blocks.map((block) => architectureState.containerKey(block));
  assert.equal(architectureState.nodeSelections.get(firstKey), "a1");
  assert.equal(architectureState.nodeSelections.get(secondKey), "b1");
  architectureState.nodeSelections.set(firstKey, "a2");
  assert.equal(architectureState.nodeSelections.get(secondKey), "b1");
});

test("formula evaluator returns null / fallback cleanly on malformed partial strings", () => {
  assert.equal(evaluateFormula("2 + (3 *", {}), null);
  assert.equal(evaluateFormula("'unterminated", {}), null);
  assert.equal(evaluateNumericFormula("unknownFn(1)", {}, 42), 42);
  assert.equal(evaluateFormula("4 + 'partial", {}), null);
});

test("actions route copy_state to the clipboard and send_message to the host with an offline fallback", async () => {
  const sent: string[] = [], copied: string[] = [], statuses: string[] = [];
  const clipboard = async (text: string) => { copied.push(text); return true; };
  const state = new UiStateStore({ sendMessage: (text) => { sent.push(text); } },
    (text) => statuses.push(text), clipboard);
  state.scope.workers = 4;
  await state.dispatchAction({ label: "Copy", promptTemplate: "Plan: {{state_summary}}", kind: "copy_state" });
  assert.deepEqual(copied, ["Plan: Changed: workers: 4"]);
  assert.equal(sent.length, 0);
  await state.dispatchAction({ label: "Send", promptTemplate: "Plan: {{state_summary}}", kind: "send_message" });
  assert.deepEqual(sent, ["Plan: Changed: workers: 4"]);
  assert.equal(copied.length, 1);
  const offline = new UiStateStore({}, (text) => statuses.push(text), clipboard);
  await offline.dispatchAction({ label: "Apply", promptTemplate: "Offline plan", kind: "send_message" });
  assert.equal(copied.at(-1), "Offline plan");
  const unavailable = new UiStateStore({}, (text) => statuses.push(text), async () => false);
  await unavailable.dispatchAction({ label: "Copy", promptTemplate: "Manual plan", kind: "copy_state" });
  assert.match(statuses.at(-1)!, /Copy unavailable/);
  assert.ok(statuses.at(-1)!.includes("Manual plan"));
});

test("content blocks validate boundaries and resolve scalar values and code without unsafe placeholders", () => {
  const spec = UiSpecSchema.parse({ title: "Content contract", blocks: [
    { kind: "controls", controls: [{ kind: "slider", id: "jobs", label: "Jobs", min: 1, max: 10, defaultValue: 3 }] },
    { kind: "stats", items: [{ label: "Capacity", formula: "jobs * 2", unit: "slots", deltaFormula: "jobs - 1", warnAbove: 4 }] },
    { kind: "code", language: "bash", template: "serve --jobs {{jobs}} --optional {{missing}}", caption: "Review before use" },
    { kind: "timeline", steps: [{ id: "check", title: "Check capacity", status: "active", detail: "Measure the workload" }] },
  ] });
  const markdown = renderFallbackMarkdown(spec);
  for (const word of ["Capacity", "slots", "warn", "serve --jobs 3", "{{missing}}", "Check capacity", "Measure the workload"]) assert.ok(markdown.includes(word));
  assert.match(markdown, /\b6\b/);
  assert.ok(!markdown.includes("undefined") && !markdown.includes("NaN"));
  const state = new UiStateStore();
  state.initDefaults(spec.blocks);
  const code = spec.blocks.find((block) => block.kind === "code");
  assert.ok(code?.kind === "code");
  state.scope.jobs = 7;
  assert.ok(interpolateCode(code.template!, state.scope).includes("--jobs 7"));
  assert.ok(interpolateCode("{{constructor}}", state.scope).includes("{{constructor}}"));
  for (const block of [
    { kind: "stats", columns: 5, items: [{ label: "Value", value: 1 }] },
    { kind: "timeline", steps: [{ id: "bad", title: "Bad", status: "unknown" }] },
    { kind: "code" }, { kind: "code", code: "text", language: "bash\nscript" },
  ]) assert.equal(UiSpecSchema.safeParse({ title: "Invalid content", blocks: [block] }).success, false);
});

test("timeline selection survives appended steps and new streaming objects", () => {
  const original = UiSpecSchema.parse({ title: "Progress", blocks: [{ kind: "timeline", id: "progress", steps: [
    { id: "a", title: "Prepare", status: "done", detail: "Prepared" },
    { id: "b", title: "Measure", status: "active", detail: "Measuring" },
  ] }] });
  const state = new UiStateStore();
  state.initDefaults(original.blocks);
  const key = state.containerKey(original.blocks[0]);
  assert.equal(state.timelineSelections.get(key), "b");
  state.timelineSelections.set(key, "a");
  const appended = UiSpecSchema.parse({ title: "Progress", blocks: [{ kind: "timeline", id: "progress", steps: [
    { id: "a", title: "Prepare", status: "done", detail: "Prepared" },
    { id: "b", title: "Measure", status: "done", detail: "Measured" },
    { id: "c", title: "Launch", status: "pending" },
  ] }] });
  state.initDefaults(appended.blocks);
  assert.equal(state.timelineSelections.get(key), "a");
});

test("all built-in presets conform to UiSpecSchema and render non-empty Markdown fallback", () => {
  assert.ok(PRESETS["composable-workbench"]);
  assert.ok(PRESETS["svg-visual-lab"]);
  assert.ok(PRESETS["agent-launch-kit"]);
  for (const [key, spec] of Object.entries(PRESETS)) {
    const validated = UiSpecSchema.parse(spec);
    assert.ok(validated.blocks.length >= 1, `${key} should have at least one block`);
    assert.deepEqual(choiceAssignmentIssues(validated.blocks), [], `${key} assigns undeclared variables`);

    const md = renderFallbackMarkdown(validated);
    assert.ok(md.includes(validated.title), `${key} markdown missing title`);
    assert.ok(!md.includes("NaN"), `${key} markdown contains NaN`);
    assert.ok(!md.includes("undefined"), `${key} markdown contains undefined`);
  }
  for (const spec of Object.values(SVG_EXAMPLES)) {
    assert.ok(renderFallbackMarkdown(UiSpecSchema.parse(spec)).includes(spec.title));
  }
});

test("runtime version stays in sync with the published package version", async () => {
  const manifest = JSON.parse(await fs.readFile(new URL("../package.json", import.meta.url), "utf8")) as { version: string };
  assert.equal(VERSION, manifest.version);
});

const appsCapabilities: ClientCapabilities = { extensions: { "io.modelcontextprotocol/ui": { mimeTypes: [RESOURCE_MIME_TYPE] } } };

test("client adaptation prefers advertised UI support and falls back by host identity", () => {
  assert.equal(detectClientAdapter({ name: "Antigravity" }, appsCapabilities, "antigravity"), "mcp-apps");
  for (const name of ["Antigravity", "jetski", "Cascade"]) assert.equal(detectClientAdapter({ name }, {}), "antigravity");
  assert.equal(detectClientAdapter({ name: "CLI" }, {}, "antigravity"), "antigravity");
  assert.equal(detectClientAdapter({ name: "CLI" }, {}), "markdown");
  assert.equal(detectClientAdapter(undefined, undefined), "markdown");
});

test("standalone injection preserves literal code and opts into embed without script breakout", () => {
  const spec = UiSpecSchema.parse({ title: "Literal code", blocks: [{ kind: "code", code: '</ScRiPt><script>alert(1)</script><!-- $& $\u0060' }] });
  const bundle = '<main id="app-root"></main>';
  for (const embed of [false, true]) {
    const html = injectStandaloneHtml(bundle, spec, { embed });
    assert.equal((html.match(/<script>/g) ?? []).length, 1);
    const payload = html.split("window.__THREADFRAME_SPEC__ = ")[1].split(";")[0];
    assert.deepEqual(JSON.parse(payload), spec);
    assert.equal(html.includes("__THREADFRAME_EMBED__ = true"), embed);
  }
});

async function connectTestClient(name: string, capabilities: ClientCapabilities, localStdio = false) {
  const server = createServer({ localStdio });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await clientTransport.start();
  let id = 0;
  const request = (method: string, params: JSONRPCRequest["params"]) => new Promise<Record<string, unknown>>((resolve, reject) => {
    const requestId = ++id;
    const timer = setTimeout(() => reject(new Error(`Timed out: ${method}`)), 5000);
    clientTransport.onmessage = (message) => {
      if (!("id" in message) || message.id !== requestId) return;
      clearTimeout(timer);
      if ("result" in message) resolve(message.result);
      else if ("error" in message) reject(new Error(JSON.stringify(message.error)));
    };
    void clientTransport.send({ jsonrpc: "2.0", id: requestId, method, params }).catch((error) => { clearTimeout(timer); reject(error); });
  });
  let instructions: unknown;
  try {
    const init = await request("initialize", { protocolVersion: "2025-11-25", capabilities, clientInfo: { name, version: "1.0.0" } });
    instructions = init.instructions;
    await clientTransport.send({ jsonrpc: "2.0", method: "notifications/initialized" });
  } catch (error) { await server.close(); throw error; }
  return { instructions, request, close: () => server.close() };
}

test("state snapshot tools stay local and are disabled over HTTP", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "threadframe-state-"));
  const snapshot = {
    title: "Session",
    savedAt: "2026-11-19T00:00:00.000Z",
    variables: [{ id: "workers", label: "GPU count", value: 4, changed: true }],
    choices: ["Fast profile"],
    checklist: { done: 1, total: 2, items: [{ label: "Check budget", checked: true }, { label: "Verify host", checked: false }] },
  };
  const resultSchema = z.object({ content: z.array(z.object({ type: z.literal("text"), text: z.string() })), isError: z.boolean().optional() });
  try {
    const local = await connectTestClient("Local", appsCapabilities, true);
    try {
      const file = path.join(directory, "state.json");
      const saved = resultSchema.parse(await local.request("tools/call", { name: "save_threadframe_state", arguments: { statePath: file, snapshot } }));
      assert.equal(saved.isError, undefined);
      const read = resultSchema.parse(await local.request("tools/call", { name: "read_threadframe_state", arguments: { statePath: file } }));
      assert.match(read.content[0].text, /"title": "Session"/);
      const missing = resultSchema.parse(await local.request("tools/call", { name: "read_threadframe_state", arguments: { statePath: path.join(directory, "missing.json") } }));
      assert.equal(missing.isError, true);
    } finally {
      await local.close();
    }
    const http = await connectTestClient("HTTP", {}, false);
    try {
      const saved = resultSchema.parse(await http.request("tools/call", {
        name: "save_threadframe_state", arguments: { statePath: path.join(directory, "http.json"), snapshot },
      }));
      assert.equal(saved.isError, true);
      assert.match(saved.content[0].text, /local --stdio/);
      const read = resultSchema.parse(await http.request("tools/call", {
        name: "read_threadframe_state", arguments: { statePath: path.join(directory, "state.json") },
      }));
      assert.equal(read.isError, true);
      assert.match(read.content[0].text, /local --stdio/);
    } finally {
      await http.close();
    }
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("real MCP sessions preserve native results and restrict embed writes to explicit local exports", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "threadframe-"));
  const resultSchema = z.object({ content: z.array(z.object({ type: z.literal("text"), text: z.string() })), isError: z.boolean().optional(), structuredContent: UiSpecSchema.optional() });
  const shortcuts = [
    { name: "present_calculator", arguments: { title: "Shortcut calculator", inputs: [{ kind: "slider", label: "A", min: 0, max: 10 }], metrics: [{ label: "Double", formula: "a * 2" }] } },
    { name: "present_decision", arguments: { title: "Shortcut decision", options: [{ label: "One" }, { label: "Two" }] } },
    { name: "present_diagram", arguments: { title: "Shortcut diagram", nodes: [{ id: "a", label: "A" }, { id: "b", label: "B" }], edges: [{ from: "a", to: "b" }] } },
    { name: "render_markup", arguments: { title: "Markup scale", markup: '<slider id="gain" label="Gain" min={1} max={8} default={2}/><text>Total {gain * 2}</text>' } },
  ];
  const markup = shortcuts[3];
  try {
    for (const scenario of [
      { name: "Native", capabilities: appsCapabilities, local: true, written: false },
      { name: "Antigravity", capabilities: {}, local: true, written: true },
      { name: "Terminal", capabilities: {}, local: true, written: true },
      { name: "HTTP", capabilities: {}, local: false, written: false },
    ]) {
      const client = await connectTestClient(scenario.name, scenario.capabilities, scenario.local);
      try {
        assert.equal(typeof client.instructions, "string");
        for (const name of ["present_calculator", "present_decision", "present_diagram", "render_markup"]) {
          assert.ok((client.instructions as string).includes(name), `instructions should mention ${name}`);
        }
        const embedPath = path.join(directory, `${scenario.name} space.html`);
        const result = resultSchema.parse(await client.request("tools/call", { name: markup.name, arguments: { ...markup.arguments, embedPath } }));
        if (scenario.name === "Native") {
          assert.equal(result.structuredContent?.title, "Markup scale");
          assert.match(result.content[0].text, /Total 4/);
          assert.match(result.content[0].text, /Layout: ~\d+px estimated/);
          const listing = await client.request("tools/list", {});
          const tools = z.array(z.object({
            name: z.string(), inputSchema: z.record(z.string(), z.unknown()),
            _meta: z.object({ ui: z.object({ resourceUri: z.string().optional(), visibility: z.array(z.string()).optional() }).optional() }).optional(),
          })).parse(listing.tools);
          for (const name of [...shortcuts.map((entry) => entry.name), "save_threadframe_state", "read_threadframe_state"]) {
            assert.ok(tools.some((tool) => tool.name === name), `${name} should be registered`);
          }
          for (const retired of ["render_threadframe", "inspect_preset_frame"]) {
            assert.ok(!tools.some((tool) => tool.name === retired), `${retired} should stay retired from MCP tool list`);
          }
          assert.deepEqual(tools.find((tool) => tool.name === "save_threadframe_state")?._meta?.ui?.visibility, ["app"]);
          for (const tool of tools) assert.ok(!JSON.stringify(tool.inputSchema).includes('"$ref"'), `${tool.name} schema has $ref`);
          for (const { name } of shortcuts) {
            const shortcutTool = tools.find((tool) => tool.name === name)!;
            assert.ok(JSON.stringify(shortcutTool.inputSchema).includes('"embedPath"'), `${name} should accept embedPath`);
          }
          assert.equal(tools.find((tool) => tool.name === markup.name)?._meta?.ui?.resourceUri, UI_RESOURCE_URI);
          const uiResource = await client.request("resources/read", { uri: UI_RESOURCE_URI });
          const bundle = z.array(z.object({ uri: z.string(), mimeType: z.string(), text: z.string() })).parse(uiResource.contents)[0];
          assert.equal(bundle.mimeType, RESOURCE_MIME_TYPE);
          assert.ok(bundle.text.includes('<main id="app-root"></main>'));
          const examples = await client.request("resources/read", { uri: "threadframe://examples/svg" });
          const resources = z.array(z.object({ text: z.string() })).parse(examples.contents);
          for (const example of Object.values(JSON.parse(resources[0].text))) UiSpecSchema.parse(example);
          const recipeResult = await client.request("resources/read", { uri: "threadframe://examples/recipes" });
          const recipes = JSON.parse(z.array(z.object({ text: z.string() })).parse(recipeResult.contents)[0].text);
          const shortcut = resultSchema.parse(await client.request("tools/call", { name: "present_calculator", arguments: recipes.calculator }));
          assert.ok(shortcut.structuredContent);
          const diagram = resultSchema.parse(await client.request("tools/call", { name: "present_diagram", arguments: recipes.diagram }));
          assert.ok(diagram.structuredContent?.blocks.some((block) => block.kind === "graph"));
          const markupRecipe = await client.request("resources/read", { uri: "threadframe://examples/markup" });
          const markupRecipes = JSON.parse(z.array(z.object({ text: z.string() })).parse(markupRecipe.contents)[0].text);
          const nativeFlow = resultSchema.parse(await client.request("tools/call", { name: markup.name, arguments: markupRecipes.flow }));
          assert.equal(nativeFlow.structuredContent?.blocks[0].kind, "box");
          const markupStatePath = path.join(directory, "markup state.json");
          const nativeMarkup = resultSchema.parse(await client.request("tools/call", {
            name: markup.name, arguments: { ...markup.arguments, embedPath, statePath: markupStatePath },
          }));
          const card = nativeMarkup.structuredContent;
          const saveAction = card?.actions?.find((action) => action.kind === "save_state");
          assert.ok(card && saveAction);
          assert.equal(saveAction.statePath, markupStatePath);
          assert.match(nativeMarkup.content[0].text, /Total 4/);
          await assert.rejects(fs.access(markupStatePath));
          const store = new UiStateStore({
            saveState: async (snapshot, statePath) => {
              const saved = resultSchema.parse(await client.request("tools/call", {
                name: "save_threadframe_state", arguments: { snapshot, statePath },
              }));
              assert.equal(saved.isError, undefined);
            },
          });
          store.specTitle = card.title;
          store.initDefaults(card.blocks);
          store.scope.gain = 5;
          await store.dispatchAction(saveAction);
          const read = resultSchema.parse(await client.request("tools/call", {
            name: "read_threadframe_state", arguments: { statePath: markupStatePath },
          }));
          assert.deepEqual(JSON.parse(read.content[0].text).variables, [{ id: "gain", label: "Gain", value: 5, changed: true }]);
          const nativeStatePath = path.join(directory, "native-state.json");
          const withState = resultSchema.parse(await client.request("tools/call", {
            name: "present_calculator", arguments: { ...shortcuts[0].arguments, statePath: nativeStatePath },
          }));
          assert.equal(withState.isError, undefined);
          assert.equal(withState.structuredContent?.actions?.[0]?.kind, "save_state");
          const badState = resultSchema.parse(await client.request("tools/call", {
            name: "present_calculator", arguments: { ...shortcuts[0].arguments, statePath: path.join(directory, "NUL.json") },
          }));
          assert.equal(badState.isError, true);
          assert.match(badState.content[0].text, /Invalid statePath/);
          const rejectedShortcut = resultSchema.parse(await client.request("tools/call", {
            name: "present_calculator",
            arguments: { title: "Bad tuning", inputs: [{ kind: "slider", label: "A", min: 0, max: 1 }], metrics: [{ label: "M", formula: "ghost" }] },
          }));
          assert.equal(rejectedShortcut.isError, true);
          assert.ok(rejectedShortcut.content[0].text.includes("unknown variable"));
          const rejected = resultSchema.parse(await client.request("tools/call", {
            name: markup.name,
            arguments: { title: "Undeclared variable", markup: '<choices><choice id="bad" label="Bad"><set var="ghost" value={1}/></choice></choices>' },
          }));
          assert.equal(rejected.isError, true);
          assert.ok(rejected.content[0].text.includes("setVars.ghost"));
        } else if (scenario.local) {
          assert.equal(result.isError, undefined);
          assert.ok(result.content[0].text.includes("file:///"));
          const html = await fs.readFile(embedPath, "utf8");
          assert.doesNotMatch(html, /<script\b[^>]*\bsrc\s*=/i);
          assert.ok(html.includes("window.__THREADFRAME_EMBED__ = true"));
          assert.ok(html.includes("Markup scale"));
        } else {
          assert.equal(result.isError, true);
          assert.ok(result.content[0].text.includes("local --stdio"));
        }
        if (!scenario.written) await assert.rejects(fs.access(embedPath));
        if (scenario.name === "HTTP") {
          const httpState = resultSchema.parse(await client.request("tools/call", {
            name: "present_calculator", arguments: { ...shortcuts[0].arguments, statePath: path.join(directory, "http-state.json") },
          }));
          assert.equal(httpState.isError, true);
          assert.match(httpState.content[0].text, /MCP Apps clients over local --stdio/);
          const denied = resultSchema.parse(await client.request("tools/call", { name: markup.name, arguments: { ...markup.arguments, embedPath } }));
          assert.equal(denied.isError, true);
          assert.match(denied.content[0].text, /local --stdio/);
          const textOnly = resultSchema.parse(await client.request("tools/call", markup));
          assert.match(textOnly.content[0].text, /Total 4/);
        }
        if (scenario.name === "Antigravity") {
          for (const shortcut of shortcuts) {
            const file = path.join(directory, `${shortcut.name}.html`);
            const written = resultSchema.parse(await client.request("tools/call", {
              name: shortcut.name, arguments: { ...shortcut.arguments, embedPath: file },
            }));
            assert.equal(written.isError, undefined, shortcut.name);
            assert.ok(written.content[0].text.includes("file:///"), shortcut.name);
            assert.ok((await fs.readFile(file, "utf8")).includes("__THREADFRAME_SPEC__"), shortcut.name);
          }
          const stateRejected = resultSchema.parse(await client.request("tools/call", {
            name: "present_calculator", arguments: { ...shortcuts[0].arguments, embedPath: path.join(directory, "state-rejected.html"), statePath: path.join(directory, "state.json") },
          }));
          assert.equal(stateRejected.isError, true);
          assert.match(stateRejected.content[0].text, /MCP Apps clients over local --stdio/);
          const rejectedFile = path.join(directory, "markup-rejected.html");
          const markupRejected = resultSchema.parse(await client.request("tools/call", {
            name: markup.name, arguments: { ...markup.arguments, embedPath: rejectedFile, statePath: path.join(directory, "state.json") },
          }));
          assert.equal(markupRejected.isError, true);
          assert.match(markupRejected.content[0].text, /MCP Apps clients over local --stdio/);
          await assert.rejects(fs.access(rejectedFile));
          const directSave = resultSchema.parse(await client.request("tools/call", {
            name: "save_threadframe_state",
            arguments: {
              statePath: path.join(directory, "direct-state.json"),
              snapshot: {
                title: "Direct", savedAt: "2026-11-19T00:00:00.000Z", variables: [], choices: [],
                checklist: { done: 0, total: 0, items: [] },
              },
            },
          }));
          assert.equal(directSave.isError, true);
          assert.match(directSave.content[0].text, /MCP Apps clients over local --stdio/);
          for (const target of ["bad.json", "NUL.html", "CON/file.html", "device.html:stream", "\\\\.\\device.html"]) {
            const rejected = resultSchema.parse(await client.request("tools/call", { name: markup.name, arguments: { ...markup.arguments, embedPath: target.startsWith("\\\\") ? target : path.join(directory, target) } }));
            assert.equal(rejected.isError, true, target);
          }
          const noFile = resultSchema.parse(await client.request("tools/call", { name: markup.name, arguments: markup.arguments }));
          assert.ok(noFile.content[0].text.includes("embedPath"));
        }
      } finally { await client.close(); }
    }
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});
