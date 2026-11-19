import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import { McpServer } from "@modelcontextprotocol/server";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { renderFallbackMarkdown } from "./src/schema/fallback.js";
import { choiceAssignmentIssues } from "./src/schema/uiSpec.js";
import type { UiSpec } from "./src/schema/uiSpec.js";
import { detectClientAdapter } from "./src/clientAdapter.js";
import { injectStandaloneHtml } from "./src/export.js";
import { writeEmbedFile } from "./src/embedFile.js";
import { SVG_EXAMPLES, RECIPES, MARKUP_RECIPES } from "./src/examples.js";
import { VERSION } from "./src/version.js";
import { CalculatorInputSchema, DecisionInputSchema, DiagramInputSchema, compileCalculator, compileDecision, compileDiagram } from "./src/compile.js";
import { SnapshotSchema, readSnapshot, writeSnapshot } from "./src/snapshot.js";
import { resolveSafeFilePath } from "./src/pathSafety.js";
import { compileMarkup, MarkupInputSchema } from "./src/schema/markup.js";

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
export const UI_BUNDLE_PATH = path.resolve(THIS_DIR, import.meta.url.endsWith(".ts") ? "dist/mcp-app.html" : "mcp-app.html");
export const UI_RESOURCE_URI = "ui://threadframe/view.html";

/**
 * Reads the compiled single-file HTML bundle from dist/mcp-app.html.
 */
export async function readUiBundleHtml(): Promise<string> {
  return fs.readFile(UI_BUNDLE_PATH, "utf-8");
}

/**
 * Creates a configured MCP server exposing streaming ThreadFrame tools and ui:// resources.
 */
export function createServer(options: { localStdio?: boolean } = {}): McpServer {
  const server = new McpServer(
    {
      name: "threadframe",
      version: VERSION,
    },
    {
      instructions: [
        "Use ThreadFrame proactively to show one compact interactive card (~450px height) when the user faces tunable trade-offs, 2–4 concrete options, a layered flow/topology, parameterized curves, or a filterable/sortable multi-row table.",
        "Stay text-only for simple factual Q&A, single command output, or isolated error debugging.",
        "Pick the most specific tool first: present_calculator (tunable inputs and metrics/templates), present_decision (2–4 options comparison), present_diagram (node/edge flows), or render_markup (custom layouts, curves, tables, and icon flow cards).",
        "Keep detailed reasoning in the surrounding reply instead of cramming prose into the card. Native MCP Apps clients omit embedPath; embedded-HTML hosts pass embedPath via local --stdio; pass statePath only for local --stdio MCP Apps and read it on a later turn with read_threadframe_state.",
      ].join(" "),
    },
  );

  const embedPathSchema = z.string().optional().describe(
    "Optional local .html output path for non-MCP-Apps embedded hosts. Only local --stdio may write files. Native MCP Apps clients should omit this.",
  );
  const respond = async (spec: UiSpec, embedPath?: string) => {
    const issues = choiceAssignmentIssues(spec.blocks);
    if (issues.length) {
      return { isError: true, content: [{ type: "text" as const, text: `Invalid ThreadFrame spec:\n- ${issues.join("\n- ")}` }] };
    }
    const mode = detectClientAdapter(server.server.getClientVersion(), server.server.getClientCapabilities(), process.env.THREADFRAME_HOST);
    const snapshotActions = (spec.actions ?? []).filter((action) => action.kind === "save_state" || action.statePath !== undefined);
    if (snapshotActions.length) {
      for (const action of snapshotActions) {
        try {
          if (!action.statePath) throw new Error("save_state actions need a statePath");
          resolveSafeFilePath(action.statePath, ".json");
        } catch (error) {
          return { isError: true, content: [{ type: "text" as const, text: `Invalid statePath: ${(error as Error).message}` }] };
        }
      }
      if (!options.localStdio || mode !== "mcp-apps") {
        return {
          isError: true,
          content: [{ type: "text" as const, text: "statePath is only supported for MCP Apps clients over local --stdio. Omit statePath for Antigravity/embedded or Markdown clients, which fall back to copying the summary." }],
        };
      }
    }
    const markdown = renderFallbackMarkdown(spec);
    if (mode === "mcp-apps") return { content: [{ type: "text" as const, text: markdown }], structuredContent: spec };
    let hint = `Client mode: ${mode}. Markdown fallback returned.`;
    if (embedPath !== undefined) {
      try {
        if (!options.localStdio) throw new Error("embedPath writes are only allowed in local --stdio mode, never over HTTP");
        const html = injectStandaloneHtml(await readUiBundleHtml(), spec, { embed: true });
        const uri = await writeEmbedFile(embedPath, html, true);
        hint = `Client mode: ${mode}. Embed HTML written: ${uri}`;
      } catch (error) {
        return { isError: true, content: [{ type: "text" as const, text: `${markdown}\n\nEmbed export failed: ${(error as Error).message}` }] };
      }
    } else if (mode === "antigravity") hint += " Pass embedPath with an artifact .html path through local --stdio to generate an embedded page.";
    return { content: [{ type: "text" as const, text: `${markdown}\n\n${hint}` }], structuredContent: spec };
  };

  const compileError = (issues: string[]) => ({
    isError: true as const,
    content: [{ type: "text" as const, text: `ThreadFrame could not build this card:\n- ${issues.join("\n- ")}` }],
  });

  registerAppTool(
    server,
    "render_markup",
    {
      title: "Render ThreadFrame from Markup",
      description: [
        'Use when a custom interactive card adds clarity—such as plotting parameter-linked curves, presenting a filterable/sortable table, or combining live formulas with icons and tinted boxes—when present_calculator, present_decision, or present_diagram does not fit.',
        "Do not call for factual Q&A, a single command output, or isolated error debugging.",
        'Example markup: <box tint="accent" padding="md"><slider id="x" label="Amount" min={1} max={10} default={3}/><text>**Total** {x * 2}</text></box>.',
        'Use <title>, <caption>, <badge>, <divider/>, and <icon name="arrow-down"/>; use <plot><curve/><point x={...} y={...}/></plot>, <graph><node/><edge/></graph>, or <table><column/><row><cell/></row></table> for data.',
        "Nesting rules: <tabs> and <accordion> are top-level only and cannot nest; <filter> belongs only inside <table>; inner <box> accepts only leaf atoms (<title>, <caption>, <text>, <badge>, <icon>, <stat>, <divider/>).",
        "Formula rules: <stat> formula accepts numbers or strings; <metric>, <bar>, <curve>, <point> (xFormula/yFormula/formula), and <node valueFormula> require numeric expressions.",
        "Quote strings; put numbers, booleans, and formulas in braces. Text supports **bold**, inline code, and live {expressions} over control IDs. No JavaScript, HTML, CSS, or event attributes.",
        "Use one question, 1–3 inputs, one main visual, and 1–3 results. Aim for ~450px in chat and keep long explanations in the reply.",
        "Read threadframe://examples/markup for copyable recipes. Supply statePath only for local --stdio MCP Apps, or embedPath for a local HTML embed.",
      ].join(" "),
      inputSchema: MarkupInputSchema.extend({ embedPath: embedPathSchema }),
      _meta: { ui: { resourceUri: UI_RESOURCE_URI } },
    },
    async ({ embedPath, ...input }) => {
      const compiled = compileMarkup(input);
      return compiled.ok ? respond(compiled.spec, embedPath) : compileError(compiled.issues);
    },
  );

  registerAppTool(
    server,
    "present_calculator",
    {
      title: "Present Tunable Calculator",
      description:
        'Use when the answer depends on trade-offs the user should tune: sizing, budgets, memory, throughput, cost, quotas, or configuration parameters. Renders sliders, toggles, and selects with live metrics and a copyable template inside chat. Do not call for factual Q&A, a single command output, or cases with no adjustable parameter. Keep it compact: a few inputs and one or two metrics are ideal; large sets fold into tabs automatically. Inputs are flat: id is optional (a stable id is derived from the label), slider defaults to min 0 max 100 step 1, select requires options, metrics and bars require numeric formulas over input ids, and template placeholders use {{id}}. Provide at least one metric or bar. Example: {"title":"GPU memory budget","inputs":[{"kind":"select","id":"quant","label":"Quantization","options":["Q4_K","FP16"],"defaultValue":"Q4_K"},{"kind":"slider","id":"ctx","label":"Context","min":2,"max":64,"defaultValue":16}],"metrics":[{"label":"VRAM","formula":"quant == \'FP16\' ? 15.2 : 4.6 + ctx * 0.05","unit":"GB"}]}. Pass statePath only in local --stdio mode to add an Apply & remember snapshot action.',
      inputSchema: CalculatorInputSchema.extend({ embedPath: embedPathSchema }),
      _meta: { ui: { resourceUri: UI_RESOURCE_URI } },
    },
    async ({ embedPath, ...input }) => {
      const compiled = compileCalculator(input);
      return compiled.ok ? respond(compiled.spec, embedPath) : compileError(compiled.issues);
    },
  );

  registerAppTool(
    server,
    "present_decision",
    {
      title: "Present Decision Card",
      description:
        'Use when the user must choose between 2-4 concrete options (libraries, architectures, rollout plans) and you can state the trade-offs. Builds a comparison matrix plus selectable decision cards with an apply action. Do not call when one option is clearly correct or no decision is needed. criteria values are ordered exactly like options; winner is a 0-based option index; mark at most one option recommended. Clicking an option selects it; Apply decision submits the chosen option (including its optional prompt note if provided). Example: {"title":"Choose a serving stack","options":[{"label":"llama.cpp","recommended":true},{"label":"vLLM"},{"label":"SGLang"}],"criteria":[{"label":"Single GPU","values":["Native","Heavy","CUDA-focused"],"winner":0}]}. Pass statePath only in local --stdio mode to add a Record decision snapshot action.',
      inputSchema: DecisionInputSchema.extend({ embedPath: embedPathSchema }),
      _meta: { ui: { resourceUri: UI_RESOURCE_URI } },
    },
    async ({ embedPath, ...input }) => {
      const compiled = compileDecision(input);
      return compiled.ok ? respond(compiled.spec, embedPath) : compileError(compiled.issues);
    },
  );

  registerAppTool(
    server,
    "present_diagram",
    {
      title: "Present Auto-Laid Diagram",
      description:
        'Use when explaining a layered call chain, data flow, pipeline, or dependency topology. Provide nodes and directed edges only; coordinates, box sizes, and arrow paths are computed automatically. Do not hand-calculate SVG coordinates for these cases, and do not use this tool for measured charts (use render_markup with <plot> or <chart>). Nodes need stable ids (derived from labels when omitted) and can use a built-in icon name; edges reference ids or labels. Optional inputs declare variables usable by node valueFormula and edge activeFormula to animate paths from sliders or toggles. Cycles are layered safely. Example: {"title":"Request path","nodes":[{"id":"client","label":"Client"},{"id":"api","label":"API","role":"Node"}],"edges":[{"from":"client","to":"api","label":"HTTP"}]}. Pass statePath only in local --stdio mode to add a Remember diagram snapshot action.',
      inputSchema: DiagramInputSchema.extend({ embedPath: embedPathSchema }),
      _meta: { ui: { resourceUri: UI_RESOURCE_URI } },
    },
    async ({ embedPath, ...input }) => {
      const compiled = compileDiagram(input);
      return compiled.ok ? respond(compiled.spec, embedPath) : compileError(compiled.issues);
    },
  );

  registerAppTool(
    server,
    "save_threadframe_state",
    {
      title: "Save ThreadFrame State",
      description:
        "Write a compact snapshot for the next turn. Called by the ThreadFrame UI's explicit Apply & remember action. Available only in local --stdio mode; disabled over HTTP. statePath must be an explicit local .json path without device names, ADS, UNC paths, or symlink components.",
      inputSchema: z.object({ statePath: z.string(), snapshot: SnapshotSchema }),
      _meta: { ui: { resourceUri: UI_RESOURCE_URI, visibility: ["app"] } },
    },
    async ({ statePath, snapshot }) => {
      const mode = detectClientAdapter(server.server.getClientVersion(), server.server.getClientCapabilities(), process.env.THREADFRAME_HOST);
      if (!options.localStdio || mode !== "mcp-apps") {
        return { isError: true, content: [{ type: "text" as const, text: "State snapshots are only allowed for MCP Apps clients over local --stdio, never over HTTP or from embedded/terminal clients" }] };
      }
      try {
        return { content: [{ type: "text" as const, text: `Snapshot saved: ${await writeSnapshot(statePath, snapshot)}` }] };
      } catch (error) {
        return { isError: true, content: [{ type: "text" as const, text: `Snapshot write failed: ${(error as Error).message}` }] };
      }
    },
  );

  server.registerTool(
    "read_threadframe_state",
    {
      title: "Read ThreadFrame State",
      description:
        "Read the latest confirmed ThreadFrame snapshot from an explicitly chosen .json path. Only call when a prior MCP Apps turn passed statePath and the user confirmed Apply & remember. Read-only and available only in local --stdio mode; disabled over HTTP.",
      inputSchema: z.object({ statePath: z.string() }),
    },
    async ({ statePath }) => {
      if (!options.localStdio) {
        return { isError: true, content: [{ type: "text" as const, text: "State snapshots can only be read in local --stdio mode, never over HTTP" }] };
      }
      try {
        const snapshot = await readSnapshot(statePath);
        return { content: [{ type: "text" as const, text: JSON.stringify(snapshot, null, 2) }] };
      } catch (error) {
        return { isError: true, content: [{ type: "text" as const, text: `Snapshot read failed: ${(error as Error).message}` }] };
      }
    },
  );

  server.registerResource("Safe SVG examples", "threadframe://examples/svg", {
    mimeType: "application/json", description: "Editable capacity bar, flow arrows and reactive size examples with controls and formulas.",
  }, async (uri) => ({ contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(SVG_EXAMPLES) }] }));

  server.registerResource("Shortcut tool recipes", "threadframe://examples/recipes", {
    mimeType: "application/json", description: "Minimal copy-paste inputs for present_calculator, present_decision, and present_diagram.",
  }, async (uri) => ({ contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(RECIPES) }] }));

  server.registerResource("ThreadFrame markup recipes", "threadframe://examples/markup", {
    mimeType: "application/json", description: "Copyable render_markup inputs for a tinted flow, linked curve, node graph, and sortable table.",
  }, async (uri) => ({
    contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(MARKUP_RECIPES) }],
  }));

  registerAppResource(
    server,
    "ThreadFrame Runtime",
    UI_RESOURCE_URI,
    { mimeType: RESOURCE_MIME_TYPE },
    async () => {
      const html = await readUiBundleHtml();
      return {
        contents: [
          {
            uri: UI_RESOURCE_URI,
            mimeType: RESOURCE_MIME_TYPE,
            text: html,
          },
        ],
      };
    },
  );

  return server;
}
