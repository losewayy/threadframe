import assert from "node:assert/strict";
import test from "node:test";
import { MARKUP_RECIPES } from "../src/examples.js";
import { renderFallbackMarkdown, formatLayoutSummary, measureLayout } from "../src/schema/fallback.js";
import { compileMarkup, parsePartialMarkup } from "../src/schema/markup.js";
import { markupTags } from "../src/schema/markupTags.js";
import { UiSpecSchema } from "../src/schema/uiSpec.js";

test("markup compiles to the same UiSpec as native controls, atoms, and plots", () => {
  const result = compileMarkup({
    markup: `<frame title="Transfer" subtitle="Tune the rate">
      <box tint="accent" padding="md">
        <slider id="rate" label="Rate" min={1} max={8} default={3}/>
        <toggle id="burst" label="Burst" default={true}/>
        <text>**Total** {burst ? rate * 2 : rate}</text>
        <box align="center"><icon name="arrow-down"/><caption>Next</caption></box>
        <plot mode="line" xVariable="t" xMin={0} xMax={4}>
          <curve label="Rate" formula={t * rate}/>
        </plot>
      </box>
    </frame>`,
  });
  assert.ok(result.ok);
  assert.deepEqual(result.spec, UiSpecSchema.parse({
    title: "Transfer", subtitle: "Tune the rate", blocks: [{
      kind: "box", tint: "accent", padding: "md", children: [
        { kind: "controls", controls: [
          { kind: "slider", id: "rate", label: "Rate", min: 1, max: 8, defaultValue: 3 },
          { kind: "toggle", id: "burst", label: "Burst", defaultValue: true },
        ] },
        { kind: "text", text: "**Total** {burst ? rate * 2 : rate}" },
        { kind: "box", align: "center", children: [
          { kind: "icon", name: "arrow-down" }, { kind: "caption", text: "Next" },
        ] },
        { kind: "plot", mode: "line", xVariable: "t", xMin: 0, xMax: 4,
          curves: [{ label: "Rate", formula: "t * rate" }] },
      ],
    }],
  }));
  assert.match(renderFallbackMarkdown(result.spec), /Total\*\* 6/);
});

test("markup supports declared presets, graph icons, and derived table columns", () => {
  const compiled = compileMarkup({ markup: `
    <select id="target" label="Runtime"><option value="CPU"/><option value="GPU"/></select>
    <choices><choice id="fast" label="Use GPU" icon="cpu"><set var="target" value="GPU"/></choice></choices>
    <graph><node id="a" label="Client" icon="terminal"/><node id="b" label="Engine"/><edge from="a" to="b"/></graph>
    <table><column key="capacity" label="Capacity" formula={target == 'CPU' ? cores : cores * 2}/>
      <row><cell column="cores" value={6}/></row>
    </table>
    <button label="Copy summary" action="copy_state"/>
  ` });
  assert.ok(compiled.ok);
  const [controls, choices, graph, table] = compiled.spec.blocks;
  assert.ok(controls.kind === "controls" && choices.kind === "choices" && graph.kind === "graph" && table.kind === "table");
  assert.equal(controls.controls[0].defaultValue, "CPU");
  assert.deepEqual(choices.options[0].setVars, { target: "GPU" });
  assert.equal(graph.nodes[0].icon, "terminal");
  assert.equal(graph.edges[0].to, "b");
  assert.equal(compiled.spec.actions?.[0].kind, "copy_state");
  assert.match(renderFallbackMarkdown(compiled.spec), /\b6\b/);

  for (const input of [MARKUP_RECIPES.flow, MARKUP_RECIPES.curve, MARKUP_RECIPES.diagram, MARKUP_RECIPES.table]) {
    const result = compileMarkup(input);
    assert.ok(result.ok);
    assert.ok(UiSpecSchema.safeParse(result.spec).success);
  }
});

test("markup errors point to the offending tag, attribute, or formula", () => {
  const cases: [string, RegExp][] = [
    ["<text>Ready</text>\n<boox/>", /Line 2.*unknown tag <boox>/],
    ["<box\n  style=\"color:red\"><text>Ready</text></box>", /Line 2.*attribute "style"/],
    ["<frame\n  subtitle={false}><text>Ready</text></frame>", /Line 2.*<frame>\.subtitle/],
    ["<text>Ready</text>\n<text>{missing + 1}</text>", /Line 2.*unknown variable "missing"/],
    ["<text>{2 + }</text>", /<text> text.*invalid formula/],
    ["<box><box><box><text>Deep</text></box></box></box>", /nested <box> accepts only/],
    ["<box><text>Unclosed</box>", /Close <text>/],
    ["<slider id=\"x\" label=\"X\" min={1} max={2} default={4}/>", /<slider>\.default.*between/],
    ["<graph><node id=\"a\" label=\"A\"/><edge from=\"a\" to=\"b\"/></graph>", /<edge>\.to.*unknown node/],
    ["<toggle id=\"x\" label=\"Enabled\"/><choices><choice id=\"p\" label=\"Set\"><set var=\"x\" value={3}/></choice></choices>", /setVars\.x.*expected a boolean/],
  ];
  for (const [markup, diagnostic] of cases) {
    const result = compileMarkup({ markup });
    assert.ok(!result.ok, markup);
    assert.match(result.issues[0], diagnostic);
  }
});

test("table cells accept key alias and markup errors aggregate fields with usage examples", () => {
  const aliased = compileMarkup({
    markup: `<table><column key="domain" label="Domain"/><row><cell key="domain" value="search"/></row></table>`,
  });
  assert.ok(aliased.ok);
  assert.equal(aliased.spec.blocks[0]?.kind, "table");
  assert.deepEqual(aliased.spec.blocks[0].rows[0]?.values, { domain: "search" });

  const innerText = compileMarkup({
    markup: `<table><column key="domain" label="Domain"/><row><cell>search</cell></row></table>`,
  });
  assert.ok(!innerText.ok);
  assert.match(innerText.issues[0], /<cell> takes attributes only, not inner text; close it with \/>/);
  assert.match(innerText.issues[0], /Valid attributes for <cell>: key \(required\), value \(required\)/);
  assert.match(innerText.issues[0], /Example: <cell key="name" value="Item"\/>/);

  const multi = compileMarkup({
    markup: `<table><column name="Domain"/><row><cell value="search"/></row></table>`,
  });
  assert.ok(!multi.ok);
  const combined = multi.issues.join("\n");
  assert.match(combined, /unexpected or repeated attribute "name"/);
  assert.match(combined, /<column>\.key/);
  assert.match(combined, /<column>\.label/);
  assert.match(combined, /<cell>\.key/);
  assert.match(combined, /Example: <column key="name" label="Name" sortable\/>/);
});

test("markup preview preserves closed blocks and only applies checked presets", () => {
  const prefix = `<box><text>Ready</text><slider id="x" label="X" max={10} default={3}/>
    <choices><choice id="preset" label="Preset" prompt="Confirm"><set var="x" value={4}/></choice>
    <choice id="bad" label="Bad"><set var="x" value={20}/></choice></choices><caption>{x +`;
  const partial = parsePartialMarkup({ markup: prefix, statePath: "state.json" });
  assert.equal(partial.isComplete, false);
  assert.ok(partial.pendingBlockCount > 0);
  const box = partial.blocks[0];
  assert.ok(box?.kind === "box");
  assert.deepEqual(box.children.map(({ kind }) => kind), ["text", "controls", "choices"]);
  const choices = box.children[2];
  assert.ok(choices.kind === "choices");
  assert.ok(choices.options.every((option) => option.prompt === undefined && option.setVars === undefined));
  assert.deepEqual(partial.actions, []);

  const valid = parsePartialMarkup({ markup: prefix.replace("value={20}", "value={8}") });
  const validBox = valid.blocks[0];
  assert.ok(validBox.kind === "box" && validBox.children[2].kind === "choices");
  assert.deepEqual(validBox.children[2].options[0].setVars, { x: 4 });
});

test("markup accepts literal code and text through safe rendering, and rejects executable constructs", () => {
  for (const markup of [
    '<script>alert(1)</script>', '<text onclick="alert(1)">Click</text>',
    '<text>{globalThis.alert(1)}</text>', '<text>{constructor("test")}</text>',
    '<graph><node id="a" label="A" icon="custom.svg"/></graph>',
    '<button label="Write" action="save_state"/>',
  ]) assert.equal(compileMarkup({ markup }).ok, false, markup);

  const literal = compileMarkup({
    title: "<script>Example</script>",
    markup: "<text>**Literal** `<span>` {'<img src=example>'}</text><graph><node id=\"a\" label=\"&lt;img&gt;\"/></graph>",
  });
  assert.ok(literal.ok);
  const markdown = renderFallbackMarkdown(literal.spec);
  assert.doesNotMatch(markdown, /<(?:script|img)\b/i);
  assert.match(markdown, /&lt;img/);
  assert.match(markdown, /`<span>`/);
});

test("markup derives omitted structural ids, accepts natural aliases, and compiles every tag example", () => {
  const auto = compileMarkup({
    markup: `
      <tabs>
        <tab label="Overview"><text>One</text></tab>
        <tab label="中文标签"><text>Two</text></tab>
      </tabs>
      <accordion><section label="Details"><text>Inside</text></section></accordion>
      <choices><choice label="Fast"/></choices>
      <checklist><item label="Done" done={true}/></checklist>
      <architecture><layer label="UI"><component label="Card" role="View"/></layer></architecture>
      <compare><option value="A"/><option value="B"/><criterion label="Speed"><option value="Fast"/><option value="Slow"/></criterion></compare>
    `,
  });
  assert.ok(auto.ok, auto.ok ? "" : auto.issues.join("\n"));
  const [tabs, accordion, choices, checklist, arch, compare] = auto.spec.blocks;
  assert.ok(tabs.kind === "tabs" && tabs.tabs[0].id === "overview" && tabs.tabs[1].id === "tab_2");
  assert.ok(accordion.kind === "accordion" && accordion.items[0].id === "details" && accordion.items[0].title === "Details");
  assert.ok(choices.kind === "choices" && choices.options[0].id === "fast");
  assert.ok(checklist.kind === "checklist" && checklist.items[0].id === "done" && checklist.items[0].checked === true);
  assert.ok(arch.kind === "architecture" && arch.layers[0].layer === "UI" && arch.layers[0].nodes[0].id === "card");
  assert.ok(compare.kind === "compare" && compare.rows[0].criterion === "Speed");

  const wrap = (name: string, example: string): string => {
    const context = '<slider id="n" label="N" min={1} max={10} default={2}/><toggle id="mode" label="Mode" default={true}/>';
    switch (name) {
      case "tab": return `<tabs>${example}</tabs>`;
      case "section": return `<accordion>${example}</accordion>`;
      case "metric": return `<controls><slider id="n" label="N"/>${example}</controls>`;
      case "stat": return `<stats>${example}</stats>`;
      case "bar": return `${context}<chart>${example}</chart>`;
      case "curve":
      case "point": return `<plot mode="line" xVariable="x" xMin={0} xMax={10}>${example}</plot>`;
      case "node": return `<graph>${example}</graph>`;
      case "edge": return `<graph><node id="a" label="A"/><node id="b" label="B"/>${example}</graph>`;
      case "column": return `<table>${example}<row><cell key="name" value="A"/></row></table>`;
      case "row": return `<table><column key="name" label="Name"/>${example}</table>`;
      case "cell": return `<table><column key="name" label="Name"/><row>${example}</row></table>`;
      case "filter": return `<table>${example}<column key="name" label="Name"/><row><cell key="name" value="A"/></row></table>`;
      case "choice": return `<choices>${example}</choices>`;
      case "set": return `<select id="mode" label="Mode"><option value="fast"/><option value="safe"/></select><choices><choice label="Pick">${example}</choice></choices>`;
      case "criterion": return `<compare><option value="A"/><option value="B"/>${example}</compare>`;
      case "item": return `<checklist>${example}</checklist>`;
      case "step": return `<timeline>${example}</timeline>`;
      case "layer": return `<architecture>${example}</architecture>`;
      case "component": return `<architecture><layer layer="Runtime">${example}</layer></architecture>`;
      case "button": return `<text>Hi</text>${example}`;
      case "slider":
      case "toggle":
      case "select": return example;
      default: return `${context}${example}`;
    }
  };
  for (const [name, tag] of markupTags) {
    if (!tag.example) continue;
    const compiled = compileMarkup({ markup: wrap(name, tag.example) });
    assert.ok(compiled.ok, `Example for <${name}> failed: ${compiled.ok ? "" : compiled.issues.join("; ")}`);
  }
});

test("formatLayoutSummary flags compact cards vs overflowing multi-row tables", () => {
  const compact = compileMarkup({ markup: '<box><text>Hello</text></box>' });
  assert.ok(compact.ok);
  assert.equal(measureLayout(compact.spec).overflows, false);
  assert.match(formatLayoutSummary(compact.spec), /fits ~450px chat comfort height/);

  const rows = Array.from({ length: 18 }, (_, i) => `<row><cell key="k" value="Row ${i}"/></row>`).join("");
  const dense = compileMarkup({ markup: `<tabs><tab label="Data"><table><column key="k" label="K"/>${rows}</table></tab><tab label="Notes"><text>Hi</text></tab></tabs>` });
  assert.ok(dense.ok);
  const metrics = measureLayout(dense.spec);
  assert.equal(metrics.overflows, true);
  assert.equal(metrics.rows, 18);
  assert.equal(metrics.activeTab, "Data");
  assert.equal(metrics.tabs, 2);
  const summary = formatLayoutSummary(dense.spec);
  assert.match(summary, /table 18 rows/);
  assert.match(summary, /exceeds ~450px comfort height/);
});
