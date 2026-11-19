import assert from "node:assert/strict";
import test from "node:test";
import {
  CalculatorInputSchema, DecisionInputSchema, compileCalculator, compileDecision,
} from "../src/compile.js";
import { RECIPES } from "../src/examples.js";
import { renderFallbackMarkdown } from "../src/schema/fallback.js";
import { compileMarkup } from "../src/schema/markup.js";
import { UiSpecSchema } from "../src/schema/uiSpec.js";

const calculator = (overrides: Record<string, unknown> = {}) => CalculatorInputSchema.parse({
  title: "Tuning",
  inputs: [
    { id: "size", kind: "slider", label: "Size", min: 2, max: 20, defaultValue: 4 },
    { id: "mode", kind: "select", label: "Mode", options: ["fast", "safe"], defaultValue: "fast" },
  ],
  metrics: [{ label: "Budget", formula: "size * 2" }],
  ...overrides,
});

const decision = (overrides: Record<string, unknown> = {}) => DecisionInputSchema.parse({
  title: "Pick",
  options: [{ label: "Alpha" }, { label: "Beta" }, { label: "Gamma" }],
  criteria: [
    { label: "Speed", values: ["high", "medium", "low"], winner: 0 },
    { label: "Safety", values: ["low", "high", "high"], winner: 1 },
  ],
  ...overrides,
});

test("calculator compiles compact inputs into a valid UiSpec and rejects undeclared variables", () => {
  const compiled = compileCalculator(calculator());
  assert.ok(compiled.ok);
  const spec = UiSpecSchema.parse(compiled.spec);
  assert.ok(spec.blocks.some((block) => block.kind === "controls"));
  assert.ok(renderFallbackMarkdown(spec).length > 0);

  const failures: Array<[Record<string, unknown>, RegExp]> = [
    [{ metrics: [{ label: "Bad", formula: "size * ghost" }] }, /unknown variable "ghost"/],
    [{ bars: [{ label: "No value" }] }, /give either a formula or a value/],
    [{ template: "run {{missing}}" }, /template: unknown variable "missing"/],
    [{ metrics: [{ label: "Broken", formula: "size +" }] }, /formula is not valid/],
  ];
  for (const [overrides, message] of failures) {
    const failed = compileCalculator(calculator(overrides));
    assert.equal(failed.ok, false);
    assert.match(failed.ok ? "" : failed.issues.join("\n"), message);
  }

  const withSnapshot = compileCalculator(calculator({ statePath: "session/state.json" }));
  assert.ok(withSnapshot.ok);
  assert.equal(withSnapshot.spec.actions?.[0].kind, "save_state");
  assert.equal(withSnapshot.spec.actions?.[0].statePath, "session/state.json");
});

test("calculator derives stable unique ids and rejects out-of-range defaults", () => {
  const compiled = compileCalculator(calculator({
    inputs: [
      { kind: "slider", label: "GPUs", min: 1, max: 4, defaultValue: 2 },
      { kind: "slider", label: "GPUs", min: 1, max: 4 },
      { kind: "toggle", label: "Flash", defaultValue: true },
    ],
    metrics: [{ label: "Budget", formula: "gpus * 2" }],
  }));
  assert.ok(compiled.ok);
  const controls = compiled.spec.blocks.find((block) => block.kind === "controls");
  assert.ok(controls?.kind === "controls");
  const ids = controls.controls.map((control) => control.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(ids[0], "gpus");

  const failed = compileCalculator(calculator({
    inputs: [{ kind: "slider", label: "Size", min: 0, max: 10, defaultValue: 11 }],
  }));
  assert.equal(failed.ok, false);
  assert.match(failed.ok ? "" : failed.issues.join("\n"), /must be between 0 and 10/);

  const duplicate = compileCalculator(calculator({
    inputs: [
      { id: "x", kind: "slider", label: "A", min: 0, max: 10 },
      { id: "x", kind: "slider", label: "B", min: 0, max: 10 },
    ],
  }));
  assert.equal(duplicate.ok, false);
  assert.match(duplicate.ok ? "" : duplicate.issues.join("\n"), /duplicate id/);
});

test("calculator folds dense secondary content into tabs without nesting violations", () => {
  const compiled = compileCalculator(calculator({
    inputs: Array.from({ length: 5 }, (_, index) => ({
      kind: "slider", label: `Input ${index}`, min: 0, max: 10, defaultValue: 1,
    })),
    metrics: [
      { label: "A", formula: "input_0 * 2" },
      { label: "B", formula: "input_1 * 2" },
      { label: "C", formula: "input_2 * 2" },
      { label: "D", formula: "input_3 * 2" },
    ],
    bars: [{ label: "Bar", formula: "input_4" }],
    template: "run {{input_0}}",
  }));
  assert.ok(compiled.ok);
  const spec = UiSpecSchema.parse(compiled.spec);
  assert.equal(spec.blocks[0].kind, "tabs");
  assert.ok(spec.blocks[0].tabs[0].children.some((child) => child.kind === "chart"));
  assert.ok(renderFallbackMarkdown(spec).includes("run 1"));

  const strMetric = compileCalculator(calculator({
    metrics: [{ label: "Bad", formula: "'oops'" }],
  }));
  assert.equal(strMetric.ok, false);
  assert.match(strMetric.ok ? "" : strMetric.issues.join("\n"), /must evaluate to a number/);
});

test("decision compiles comparison and choices, and validates indexes", () => {
  const compiled = compileDecision(decision());
  assert.ok(compiled.ok);
  const spec = UiSpecSchema.parse(compiled.spec);
  const compare = spec.blocks.find((block) => block.kind === "compare");
  assert.ok(compare?.kind === "compare");
  assert.equal(compare.columns.length, 3);
  assert.equal(compare.rows[1].winnerIndex, 1);

  const recommended = compileDecision(decision({ options: [
    { label: "Alpha", recommended: true }, { label: "Beta" }, { label: "Gamma" },
  ] }));
  assert.ok(recommended.ok);
  const recommendedCompare = recommended.spec.blocks.find((block) => block.kind === "compare");
  assert.ok(recommendedCompare?.kind === "compare");
  assert.equal(recommendedCompare.recommendedIndex, 0);

  const failures: Array<[Record<string, unknown>, RegExp]> = [
    [{ criteria: [{ label: "Too short", values: ["a", "b"] }] }, /exactly 3 values/],
    [{ criteria: [{ label: "Bad winner", values: ["a", "b", "c"], winner: 3 }] }, /0-based option index/],
    [{ options: [{ label: "Alpha", recommended: true }, { label: "Beta", recommended: true }] }, /at most one option/],
  ];
  for (const [overrides, message] of failures) {
    const failed = compileDecision(decision(overrides));
    assert.equal(failed.ok, false);
    assert.match(failed.ok ? "" : failed.issues.join("\n"), message);
  }
});

test("shortcut recipes stay compilable and schema-valid", () => {
  const calc = compileCalculator(CalculatorInputSchema.parse(RECIPES.calculator));
  const dec = compileDecision(DecisionInputSchema.parse(RECIPES.decision));
  assert.ok(calc.ok && dec.ok);
  for (const spec of [calc.spec, dec.spec]) {
    assert.ok(UiSpecSchema.safeParse(spec).success);
    assert.ok(renderFallbackMarkdown(spec).length > 0);
  }
});

test("Chinese titles localize default action labels while English stays unchanged", () => {
  const zhDecision = compileDecision(DecisionInputSchema.parse({
    title: "新项目配置怎么处理",
    options: [{ label: "自动补齐", recommended: true }, { label: "先不动" }],
  }));
  assert.ok(zhDecision.ok);
  assert.equal(zhDecision.spec.badge, "方案决策");
  assert.deepEqual(zhDecision.spec.actions?.map((a) => a.label), ["应用选择", "复制选择"]);

  const zhCalc = compileCalculator(CalculatorInputSchema.parse({
    title: "显存预算",
    inputs: [{ kind: "slider", id: "concurrency", label: "并发数", defaultValue: 2 }],
    metrics: [{ label: "显存", formula: "concurrency * 2", unit: "GB" }],
  }));
  assert.ok(zhCalc.ok);
  assert.deepEqual(zhCalc.spec.actions?.map((a) => a.label), ["应用设置", "复制设置"]);

  const enCalc = compileCalculator(CalculatorInputSchema.parse(RECIPES.calculator));
  assert.ok(enCalc.ok);
  assert.deepEqual(enCalc.spec.actions?.map((a) => a.label), ["Apply settings", "Copy settings"]);
});

test("line plot accepts coordinate marker points alongside curves", () => {
  const compiled = compileMarkup({
    title: "Roofline 拐点标点",
    markup: `<slider id="peak" label="峰值" min={100} max={400} default={250}/>
<plot mode="line" xMin={0} xMax={250}>
  <curve label="上限" formula={min(peak, 2 * x)}/>
  <point label="当前拐点" xFormula="peak / 2" yFormula="peak" tone="accent"/>
</plot>`,
  });
  assert.ok(compiled.ok, compiled.ok ? "" : compiled.issues.join("\n"));
  const markdown = renderFallbackMarkdown(compiled.spec);
  assert.match(markdown, /\*\*当前拐点\*\*:\s*x=125,\s*y=250/);
});
