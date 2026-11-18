import assert from "node:assert/strict";
import test from "node:test";
import { CalculatorInputSchema, compileCalculator } from "../src/compile.js";
import { renderFallbackMarkdown } from "../src/schema/fallback.js";
import { parsePartialUiSpec, UiSpecSchema, walkBlocks } from "../src/schema/uiSpec.js";

test("atomic layouts are bounded and preserve completed children during partial input", () => {
  const caption = { kind: "caption", text: "Existing detail" };
  const box = { kind: "box", tint: "accent", children: [caption] };
  const spec = { title: "Compact layout", blocks: [{ kind: "box", direction: "row", children: [box] }] };
  assert.ok(UiSpecSchema.safeParse(spec).success);

  for (const block of [
    { ...box, tint: "custom-color" },
    { ...box, style: "color: red" },
    { ...box, children: [{ kind: "icon", name: "unregistered-icon" }] },
    { ...box, children: [{ ...box, children: [box] }] },
  ]) {
    assert.equal(UiSpecSchema.safeParse({ ...spec, blocks: [block] }).success, false);
  }

  const incomplete = parsePartialUiSpec({
    ...spec,
    blocks: [{ kind: "tabs", tabs: [{ id: "a", label: "A", children: [{ kind: "grid", children: [
      { ...box, children: [caption, { kind: "icon" }] },
    ] }] }] }],
  });
  assert.equal(incomplete.isComplete, false);
  assert.equal(incomplete.pendingBlockCount, 1);
  const kinds: string[] = [];
  walkBlocks(incomplete.blocks, (block) => kinds.push(block.kind));
  assert.deepEqual(kinds, ["tabs", "grid", "box", "caption"]);
});

test("atoms fall back to formatted Markdown, interpolating declared defaults as literal text", () => {
  const spec = UiSpecSchema.parse({
    title: "Measured &lt;label&gt;",
    blocks: [{ kind: "box", children: [
      { kind: "title", text: "**Budget {capacity}**" },
      { kind: "text", text: 'Run `start` and report {capacity > 2 ? "ready" : "waiting"}.' },
      { kind: "box", children: [
        { kind: "caption", text: "&lt;card&gt; [link](#anchor)" },
        { kind: "badge", text: "Planned" },
        { kind: "divider" },
        { kind: "icon", name: "arrow-down" },
      ] },
      { kind: "controls", controls: [
        { kind: "slider", id: "capacity", label: "Capacity", min: 0, max: 10, defaultValue: 4 },
      ] },
    ] }],
  });
  const markdown = renderFallbackMarkdown(spec);
  assert.match(markdown, /\*\*Budget 4\*\*/);
  assert.ok(markdown.includes("Run `start` and report ready."));
  assert.ok(markdown.includes("&lt;card&gt;"));
  assert.ok(markdown.includes("Measured &amp;lt;label&amp;gt;"));
  assert.ok(!markdown.includes("<card>") && !markdown.includes("[link](#anchor)"));
  for (const token of ["Planned", "↓"]) assert.ok(markdown.includes(token));
});

test("calculator bar fallback rounds a derived decimal without the floating-point tail", () => {
  const compiled = compileCalculator(CalculatorInputSchema.parse({
    title: "Estimate",
    inputs: [{ kind: "slider", id: "capacity", label: "Capacity", min: 1, max: 24, defaultValue: 16 }],
    bars: [{ label: "Combined", formula: "capacity * 2 * 0.15 + 2.4", unit: "GB" }],
  }));
  assert.ok(compiled.ok);
  const markdown = renderFallbackMarkdown(compiled.spec);
  assert.match(markdown, /\b7\.2 GB\b/);
});
