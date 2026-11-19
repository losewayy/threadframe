import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { UiStateStore } from "../src/runtime/core/state.js";
import { renderChoices } from "../src/runtime/blocks/choices.js";
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
  assert.ok(!changed.includes("Latency:"));
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
  } finally {
    (globalThis as { document?: unknown }).document = previousDocument;
  }
});
