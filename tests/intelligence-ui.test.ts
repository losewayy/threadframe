import assert from "node:assert/strict";
import test from "node:test";
import { PRESETS } from "../src/presets.js";
import { evaluateFormula, evaluateNumericFormula } from "../src/runtime/formula.js";
import { renderFallbackMarkdown } from "../src/schema/fallback.js";
import { parsePartialUiSpec, UiSpecSchema } from "../src/schema/uiSpec.js";

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

test("formula evaluator returns null / fallback cleanly on malformed partial strings", () => {
  assert.equal(evaluateFormula("2 + (3 *", {}), null);
  assert.equal(evaluateFormula("'unterminated", {}), null);
  assert.equal(evaluateNumericFormula("unknownFn(1)", {}, 42), 42);
});

test("parsePartialUiSpec renders valid leading blocks while tolerating half-streamed trailing blocks", () => {
  const halfStreamed = {
    title: "Streaming Panel",
    blocks: [
      {
        kind: "choices",
        options: [{ id: "a", label: "Option A" }],
      },
      {
        kind: "chart",
        bars: [{ label: "Half typed..." }],
      },
    ],
  };

  // Second block is valid enough except verify malformed trailing case too
  const withBrokenTail = {
    ...halfStreamed,
    blocks: [
      halfStreamed.blocks[0],
      { kind: "controls", controls: [{ kind: "slider", id: "x" }] },
    ],
  };

  const parsed = parsePartialUiSpec(withBrokenTail);
  assert.equal(parsed.title, "Streaming Panel");
  assert.equal(parsed.blocks.length, 1);
  assert.equal(parsed.blocks[0].kind, "choices");
  assert.equal(parsed.pendingBlockCount, 1);
  assert.equal(parsed.isComplete, false);
});

test("all built-in presets conform to UiSpecSchema and render non-empty Markdown fallback", () => {
  for (const [key, spec] of Object.entries(PRESETS)) {
    const validated = UiSpecSchema.parse(spec);
    assert.ok(validated.blocks.length >= 1, `${key} should have at least one block`);

    const md = renderFallbackMarkdown(validated);
    assert.ok(md.includes(validated.title), `${key} markdown missing title`);
    assert.ok(!md.includes("NaN"), `${key} markdown contains NaN`);
    assert.ok(!md.includes("undefined"), `${key} markdown contains undefined`);
  }
});
