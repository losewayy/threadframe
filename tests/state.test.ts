import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { UiStateStore } from "../src/runtime/core/state.js";
import { renderActions } from "../src/runtime/blocks/actions.js";
import { renderChart } from "../src/runtime/blocks/chart.js";
import { renderChoices } from "../src/runtime/blocks/choices.js";
import { renderCode } from "../src/runtime/blocks/code.js";
import { renderGraph } from "../src/runtime/blocks/graph.js";
import { renderTable } from "../src/runtime/blocks/table.js";
import { renderTimeline } from "../src/runtime/blocks/timeline.js";
import { renderCurvePlot } from "../src/runtime/core/plotCurve.js";
import { resolveSafeFilePath } from "../src/pathSafety.js";
import { readSnapshot, writeSnapshot } from "../src/snapshot.js";
import { UiSpecSchema } from "../src/schema/uiSpec.js";

const spec = () => UiSpecSchema.parse({
  title: "State contract",
  blocks: [
    { kind: "controls", controls: [
      { kind: "slider", id: "workers", label: "GPU count", min: 0, max: 10, defaultValue: 2 },
      { kind: "slider", id: "latency", label: "Latency", min: 0, max: 200, defaultValue: 100, unit: "ms" },
    ] },
    { kind: "choices", options: [{ id: "fast", label: "Fast profile" }] },
    { kind: "checklist", items: [
      { id: "budget", label: "Check budget", checked: true },
      { id: "host", label: "Verify host" },
    ] },
  ],
});

const snapshotFixture = {
  title: "Session",
  savedAt: "2026-11-19T00:00:00.000Z",
  variables: [{ id: "workers", label: "GPU count", value: 4, changed: true }],
  choices: ["Fast profile"],
  checklist: { done: 1, total: 2, items: [{ label: "Check budget", checked: true }, { label: "Verify host", checked: false }] },
};

test("intent summaries separate changed values from defaults and use labels", () => {
  const state = new UiStateStore();
  state.initDefaults(spec().blocks);
  state.specTitle = "State contract";
  assert.match(state.summarize(), /Defaults: GPU count: 2, Latency: 100 ms/);
  assert.match(state.summarize(), /Checklist: 1\/2 done/);
  state.scope.workers = 4;
  const changed = state.summarize();
  assert.match(changed, /Changed: GPU count: 4/);
  assert.match(changed, /Defaults: Latency: 100 ms/);
  state.selectedChoiceIds.add("fast");
  assert.match(state.summarize(), /Selected: Fast profile/);
});

test("save_state snapshots labeled state and falls back to messaging when saving fails", async () => {
  const saved: Array<{ snapshot: unknown; statePath: string }> = [];
  const sent: string[] = [];
  const statuses: string[] = [];
  const state = new UiStateStore({
    saveState: async (snapshot, statePath) => { saved.push({ snapshot, statePath }); },
    sendMessage: (text) => { sent.push(text); },
  }, (text) => statuses.push(text), async () => true);
  state.initDefaults(spec().blocks);
  state.specTitle = "State contract";
  state.scope.workers = 4;
  state.selectedChoiceIds.add("fast");
  await state.dispatchAction({
    label: "Apply", promptTemplate: "Use: {{state_summary}}", kind: "save_state", statePath: "session/state.json",
  });
  assert.equal(saved.length, 1);
  assert.equal(saved[0].statePath, "session/state.json");
  const snapshot = saved[0].snapshot as {
    title: string; variables: Array<{ label: string; value: unknown; changed: boolean }>;
    choices: string[]; checklist: { done: number; total: number };
  };
  assert.equal(snapshot.title, "State contract");
  assert.deepEqual(snapshot.variables.find((variable) => variable.label === "GPU count"), { id: "workers", label: "GPU count", value: 4, changed: true });
  assert.equal(snapshot.variables.find((variable) => variable.label === "Latency")?.changed, false);
  assert.deepEqual(snapshot.choices, ["Fast profile"]);
  assert.equal(snapshot.checklist.done, 1);
  assert.match(statuses.at(-1)!, /Saved snapshot/);

  const fallbackSent: string[] = [];
  const failing = new UiStateStore({
    saveState: async () => { throw new Error("denied"); },
    sendMessage: (text) => { fallbackSent.push(text); },
  }, (text) => statuses.push(text), async () => true);
  failing.initDefaults(spec().blocks);
  failing.scope.workers = 4;
  await failing.dispatchAction({ label: "Apply", promptTemplate: "Use: {{state_summary}}", kind: "save_state", statePath: "session/state.json" });
  assert.equal(fallbackSent.length, 1);
  assert.match(fallbackSent[0], /Changed: GPU count: 4/);
});

test("snapshot files round-trip through the local path guard", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "threadframe-snapshot-"));
  try {
    const file = path.join(directory, "state.json");
    await writeSnapshot(file, snapshotFixture);
    assert.deepEqual(await readSnapshot(file), snapshotFixture);
    await assert.rejects(writeSnapshot(path.join(directory, "state.html"), snapshotFixture));
    await assert.rejects(readSnapshot(path.join(directory, "missing.json")));
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("state paths reject device names, ADS, UNC paths, and wrong suffixes", () => {
  for (const target of [
    "bad.html", "NUL.json", "CON/state.json", "state.json:stream", "\\\\server\\share\\state.json", "dir./state.json", "",
  ]) {
    assert.throws(() => resolveSafeFilePath(target, ".json"), Error, target);
  }
  const good = path.join(os.tmpdir(), "ok.json");
  assert.equal(resolveSafeFilePath(good, ".json"), path.resolve(good));
});

test("choices defer option prompts until Apply when a submit action exists", async () => {
  const previousDocument = (globalThis as { document?: unknown }).document;
  const makeNode = (tag = "div") => {
    const listeners = new Map<string, Array<() => void>>();
    const classes = new Set<string>();
    const node = {
      tagName: tag,
      className: "",
      textContent: "",
      type: "",
      children: [] as unknown[],
      attributes: new Map<string, string>(),
      classList: {
        add: (name: string) => { classes.add(name); },
        toggle: (name: string, force?: boolean) => { if (force) classes.add(name); else classes.delete(name); },
      },
      setAttribute: (k: string, v: string) => { node.attributes.set(k, v); },
      appendChild: (child: unknown) => { node.children.push(child); return child; },
      addEventListener: (event: string, fn: () => void) => { listeners.set(event, [...(listeners.get(event) ?? []), fn]); },
      click: () => { for (const fn of listeners.get("click") ?? []) fn(); },
    };
    return node;
  };
  (globalThis as { document?: unknown }).document = {
    createElement: (tag: string) => makeNode(tag),
    createElementNS: (_ns: string, tag: string) => makeNode(tag),
    createTextNode: (text: string) => ({ textContent: text }),
  };

  try {
    const block = {
      kind: "choices" as const,
      options: [
        { id: "auto", label: "Auto fill", prompt: "Apply auto fill" },
        { id: "keep", label: "Keep as is", prompt: "Keep current config" },
      ],
    };

    const deferredSent: string[] = [];
    const statuses: string[] = [];
    const deferredState = new UiStateStore({ sendMessage: (text) => { deferredSent.push(text); } }, (text) => statuses.push(text));
    deferredState.hasSubmitAction = true;
    deferredState.initDefaults([block]);
    const grid = renderChoices(block, deferredState.createContext(() => makeNode() as unknown as HTMLElement)) as unknown as {
      children: Array<{ click: () => void }>;
    };
    grid.children[0].click();
    grid.children[1].click();
    assert.deepEqual(deferredSent, []);
    assert.equal(statuses.at(-1), "Selected: Keep as is");
    await deferredState.dispatchAction({ label: "Apply decision", kind: "send_message", promptTemplate: "Decision: {{state_summary}}" });
    assert.deepEqual(deferredSent, ["Decision: Selected: Keep as is (Keep current config)"]);

    const immediateSent: string[] = [];
    const immediateState = new UiStateStore({ sendMessage: (text) => { immediateSent.push(text); } });
    immediateState.hasSubmitAction = false;
    immediateState.initDefaults([block]);
    const quickGrid = renderChoices(block, immediateState.createContext(() => makeNode() as unknown as HTMLElement)) as unknown as {
      children: Array<{ click: () => void }>;
    };
    quickGrid.children[0].click();
    assert.deepEqual(immediateSent, ["Apply auto fill"]);

    const secondGroup = {
      kind: "choices" as const,
      options: [{ id: "gpu", label: "GPU" }, { id: "cpu", label: "CPU" }],
    };
    const multiState = new UiStateStore();
    multiState.hasSubmitAction = true;
    multiState.initDefaults([block, secondGroup]);
    const g1 = renderChoices(block, multiState.createContext(() => makeNode() as unknown as HTMLElement)) as unknown as {
      children: Array<{ click: () => void }>;
    };
    const g2 = renderChoices(secondGroup, multiState.createContext(() => makeNode() as unknown as HTMLElement)) as unknown as {
      children: Array<{ click: () => void }>;
    };
    g1.children[0].click();
    g2.children[1].click();
    assert.deepEqual([...multiState.selectedChoiceIds], ["auto", "cpu"]);
  } finally {
    (globalThis as { document?: unknown }).document = previousDocument;
  }
});

test("derived vars, selectVar, code active lines, step_var/set_var, and baseline curves work together", async () => {
  const previousDocument = (globalThis as { document?: unknown }).document;
  const previousButton = (globalThis as { HTMLButtonElement?: unknown }).HTMLButtonElement;
  class MockButton {}
  type MockNode = {
    tagName: string;
    className: string;
    textContent: string;
    type: string;
    hidden: boolean;
    tabIndex: number;
    parent: MockNode | null;
    children: MockNode[];
    attributes: Map<string, string>;
    style: Record<string, string> & { setProperty: (k: string, v: string) => void };
    classList: {
      add: (name: string) => void;
      toggle: (name: string, force?: boolean) => void;
      contains: (name: string) => boolean;
    };
    setAttribute: (k: string, v: string) => void;
    getAttribute: (k: string) => string | null;
    removeAttribute: (k: string) => void;
    append: (...nodes: MockNode[]) => void;
    appendChild: (child: MockNode) => MockNode;
    replaceChildren: (...nodes: MockNode[]) => void;
    remove: () => void;
    addEventListener: (event: string, fn: (event?: unknown) => void) => void;
    click: () => void;
    querySelectorAll: (selector: string) => MockNode[];
  };
  const makeNode = (tag = "div"): MockNode => {
    const listeners = new Map<string, Array<(event?: unknown) => void>>();
    const classes = new Set<string>();
    const syncClass = (node: MockNode) => {
      for (const name of node.className.split(/\s+/).filter(Boolean)) classes.add(name);
    };
    const base = tag === "button" ? new MockButton() : {};
    const node: MockNode = Object.assign(base, {
      tagName: tag,
      className: "",
      textContent: "",
      type: "",
      hidden: false,
      tabIndex: 0,
      parent: null,
      children: [],
      attributes: new Map<string, string>(),
      style: Object.assign(Object.create(null), {
        setProperty: (k: string, v: string) => { node.style[k] = v; },
      }),
      classList: {
        add: (name: string) => { syncClass(node); classes.add(name); },
        toggle: (name: string, force?: boolean) => {
          syncClass(node);
          if (force === undefined ? !classes.has(name) : force) classes.add(name);
          else classes.delete(name);
        },
        contains: (name: string) => { syncClass(node); return classes.has(name); },
      },
      setAttribute: (k: string, v: string) => {
        node.attributes.set(k, v);
        if (k === "class") node.className = v;
      },
      getAttribute: (k: string) => node.attributes.get(k) ?? null,
      removeAttribute: (k: string) => { node.attributes.delete(k); },
      append: (...nodes: MockNode[]) => {
        for (const child of nodes) { child.parent = node; node.children.push(child); }
      },
      appendChild: (child: MockNode) => { child.parent = node; node.children.push(child); return child; },
      replaceChildren: (...nodes: MockNode[]) => {
        for (const child of nodes) child.parent = node;
        node.children = [...nodes];
      },
      remove: () => {
        if (node.parent) node.parent.children = node.parent.children.filter((child) => child !== node);
      },
      addEventListener: (event: string, fn: (event?: unknown) => void) => {
        listeners.set(event, [...(listeners.get(event) ?? []), fn]);
      },
      click: () => { for (const fn of listeners.get("click") ?? []) fn({}); },
      querySelectorAll: () => [],
    }) as MockNode;
    return node;
  };
  (globalThis as { HTMLButtonElement?: unknown }).HTMLButtonElement = MockButton;
  const walk = (root: MockNode, pred: (n: MockNode) => boolean, out: MockNode[] = []): MockNode[] => {
    if (pred(root)) out.push(root);
    for (const child of root.children) if (child && Array.isArray(child.children)) walk(child, pred, out);
    return out;
  };
  (globalThis as { document?: unknown }).document = {
    createElement: (tag: string) => makeNode(tag),
    createElementNS: (_ns: string, tag: string) => makeNode(tag),
    createTextNode: (text: string) => Object.assign(makeNode("#text"), { textContent: text }),
  };

  try {
    const linkedSpec = UiSpecSchema.parse({
      title: "Step & select demo",
      vars: [
        { id: "line", formula: "stage == 'compile' ? 2 : stage == 'emit' ? 3 : 1" },
        { id: "doubled", formula: "step * 2" },
      ],
      blocks: [
        { kind: "controls", controls: [{ kind: "slider", id: "step", label: "Step", min: 1, max: 3, defaultValue: 1 }] },
        { kind: "timeline", selectVar: "stage", steps: [
          { id: "parse", title: "Parse", status: "active" },
          { id: "compile", title: "Compile", status: "pending", detail: "Lower IR" },
          { id: "emit", title: "Emit", status: "pending" },
        ] },
        { kind: "graph", selectVar: "node", nodes: [
          { id: "n1", label: "Frontend" },
          { id: "n2", label: "Backend" },
        ], edges: [{ from: "n1", to: "n2", activeFormula: "node == 'n2'" }] },
        { kind: "table", selectVar: "rowPick", columns: [{ key: "name", label: "Name" }], rows: [
          { id: "first", values: { name: "Alpha" } },
          { id: "second", values: { name: "Beta" } },
        ] },
        { kind: "chart", bars: [{ label: "Value", formula: "doubled", activeFormula: "node == 'n2'" }] },
        { kind: "code", code: "a()\nb()\nc()", activeLineFormula: "line" },
        { kind: "actions", buttons: [
          { kind: "step_var", label: "Next step", var: "step", delta: 1 },
          { kind: "step_var", label: "Wrap stage", var: "stage", delta: 1, wrap: true },
          { kind: "set_var", label: "Reset", var: "step", value: 1 },
        ] },
        { kind: "plot", mode: "line", xMin: 0, xMax: 4, baseline: true, curves: [{ label: "Y", formula: "x * step" }] },
      ],
    });

    const copied: string[] = [];
    const state = new UiStateStore({}, () => {}, async (text) => { copied.push(text); return true; });
    state.initDefaults(linkedSpec.blocks);
    state.setDerivedVars(linkedSpec.vars);
    const context = state.createContext(() => makeNode() as unknown as HTMLElement);
    const timelineEl = renderTimeline(linkedSpec.blocks[1] as Extract<typeof linkedSpec.blocks[number], { kind: "timeline" }>, context) as unknown as MockNode;
    const graphEl = renderGraph(linkedSpec.blocks[2] as Extract<typeof linkedSpec.blocks[number], { kind: "graph" }>, context) as unknown as MockNode;
    const tableEl = renderTable(linkedSpec.blocks[3] as Extract<typeof linkedSpec.blocks[number], { kind: "table" }>, context) as unknown as MockNode;
    const chartEl = renderChart(linkedSpec.blocks[4] as Extract<typeof linkedSpec.blocks[number], { kind: "chart" }>, context) as unknown as MockNode;
    const codeEl = renderCode(linkedSpec.blocks[5] as Extract<typeof linkedSpec.blocks[number], { kind: "code" }>, context) as unknown as MockNode;
    const actionsEl = renderActions(linkedSpec.blocks[6] as Extract<typeof linkedSpec.blocks[number], { kind: "actions" }>, context) as unknown as MockNode;
    const plotEl = renderCurvePlot(linkedSpec.blocks[7] as Extract<typeof linkedSpec.blocks[number], { kind: "plot" }>, context) as unknown as MockNode;
    state.activateBindings([context]);
    state.notifyScopeChange();

    assert.equal(state.scope.line, 1);
    assert.equal(state.scope.doubled, 2);
    assert.equal(state.summarize(), "Defaults: Step: 1, stage: parse, node: n1, rowPick: first");

    const codeLines = walk(codeEl, (n) => n.classList.contains("iui-code-line"));
    assert.equal(codeLines.length, 3);
    assert.equal(codeLines[0].classList.contains("active"), true);
    assert.equal(codeLines[0].getAttribute("aria-current"), "step");
    const copyBtn = walk(codeEl, (n) => n.tagName === "button")[0];
    copyBtn.click();
    await Promise.resolve();
    assert.equal(copied[0], "a()\nb()\nc()");

    // Clicking timeline step updates scope.stage -> derived scope.line -> active code line
    const stepButtons = walk(timelineEl, (n) => n.tagName === "button");
    assert.equal(stepButtons.length, 3);
    stepButtons[1].click();
    assert.equal(state.scope.stage, "compile");
    assert.equal(state.scope.line, 2);
    assert.equal(codeLines[1].classList.contains("active"), true);

    // Clicking graph node updates scope.node -> chart bar activeFormula
    const graphNodes = walk(graphEl, (n) => n.classList.contains("iui-graph-node"));
    graphNodes[1].click();
    assert.equal(state.scope.node, "n2");
    const barRow = walk(chartEl, (n) => n.classList.contains("iui-bar-row"))[0];
    assert.equal(barRow.classList.contains("active"), true);

    // Clicking table row updates scope.rowPick
    const tableRows = walk(tableEl, (n) => n.tagName === "tr" && n.classList.contains("selectable"));
    assert.equal(tableRows.length, 2);
    tableRows[1].click();
    assert.equal(state.scope.rowPick, "second");

    // Local step_var and set_var actions mutate scope, wrap strings, and reverse-sync timeline
    const actionBtns = walk(actionsEl, (n) => n.tagName === "button");
    actionBtns[0].click(); // Next step -> step = 2, doubled = 4
    assert.equal(state.scope.step, 2);
    assert.equal(state.scope.doubled, 4);
    actionBtns[1].click(); // Wrap stage compile -> emit
    assert.equal(state.scope.stage, "emit");
    assert.equal(stepButtons[2].getAttribute("aria-pressed"), "true");
    actionBtns[1].click(); // Wrap stage emit -> parse
    assert.equal(state.scope.stage, "parse");
    actionBtns[2].click(); // Reset step -> 1
    assert.equal(state.scope.step, 1);

    // Plot baseline freeze & clear
    const baselineBtn = walk(plotEl, (n) => n.tagName === "button")[0];
    assert.equal(walk(plotEl, (n) => n.classList.contains("baseline")).length, 0);
    baselineBtn.click();
    assert.equal(walk(plotEl, (n) => n.classList.contains("baseline")).length, 1);
    baselineBtn.click();
    assert.equal(walk(plotEl, (n) => n.classList.contains("baseline")).length, 0);
  } finally {
    (globalThis as { document?: unknown }).document = previousDocument;
    (globalThis as { HTMLButtonElement?: unknown }).HTMLButtonElement = previousButton;
  }
});
