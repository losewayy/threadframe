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
import { PRESETS } from "./src/presets.js";
import { renderFallbackMarkdown } from "./src/schema/fallback.js";
import { UiSpecSchema, choiceAssignmentIssues } from "./src/schema/uiSpec.js";
import type { UiSpec } from "./src/schema/uiSpec.js";
import { detectClientAdapter } from "./src/clientAdapter.js";
import { injectStandaloneHtml } from "./src/export.js";
import { writeEmbedFile } from "./src/embedFile.js";
import { SVG_EXAMPLES, RECIPES } from "./src/examples.js";
import { VERSION } from "./src/version.js";
import { CalculatorInputSchema, DecisionInputSchema, DiagramInputSchema, compileCalculator, compileDecision, compileDiagram } from "./src/compile.js";
import { SnapshotSchema, readSnapshot, writeSnapshot } from "./src/snapshot.js";
import { resolveSafeFilePath } from "./src/pathSafety.js";

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
  const server = new McpServer({
    name: "threadframe",
    version: VERSION,
  });

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
    "render_threadframe",
    {
      title: "Render Custom ThreadFrame",
      description:
        'Render a fully custom interactive card with the low-level UiSpec schema. Prefer present_calculator for parameter tuning, present_decision for picking among 2-4 options, and present_diagram for node/edge flows; use this tool only when the compact tools cannot express the layout. Blocks: choices, controls, stats, chart, plot, svg, compare, checklist, timeline, architecture, graph, table, callout, code; containers: grid holds leaves, tabs/accordion hold leaves or one grid. plot accepts discrete points, or parameterized curves in line mode: curves (label + formula), xMin/xMax, optional xVariable (default x) and samples; undefined or non-finite samples break the line into segments. graph auto-lays nodes/edges without manual coordinates, and table supports sortable columns plus keyword/status filtering. Control ids define variables; formulas support arithmetic, comparisons, ternary and min/max/abs/floor/ceil/round/clamp/if; code uses {{var}}. Keep cards compact: fold secondary detail into tabs or a collapsed accordion, target roughly 450px and stay under about 800px. Never supply executable HTML or JavaScript. Minimal linked example: {"title":"Size","blocks":[{"kind":"controls","controls":[{"kind":"slider","id":"x","label":"Size","min":1,"max":10,"defaultValue":3}]},{"kind":"stats","items":[{"label":"Size","formula":"x"}]},{"kind":"svg","width":120,"height":30,"elements":[{"type":"rect","x":0,"y":0,"widthFormula":"x * 10","height":20,"fill":"primary"}]}]}. Read threadframe://examples/svg or threadframe://examples/recipes for more.',
      inputSchema: UiSpecSchema.extend({ embedPath: embedPathSchema }),
      _meta: { ui: { resourceUri: UI_RESOURCE_URI } },
    },
    async ({ embedPath, ...spec }) => respond(spec, embedPath),
  );

  registerAppTool(
    server,
    "present_calculator",
    {
      title: "Present Tunable Calculator",
      description:
        'Use when the answer depends on trade-offs the user should tune: sizing, budgets, memory, throughput, cost, quotas, or configuration parameters. Renders sliders, toggles, and selects with live metrics and a copyable template inside chat. Do not call for factual Q&A, a single command output, or cases with no adjustable parameter. Keep it compact: a few inputs and one or two metrics are ideal; large sets fold into tabs automatically. Inputs are flat: id is optional (a stable id is derived from the label), slider defaults to min 0 max 100 step 1, select requires options, metrics and bars use formulas over input ids, and template placeholders use {{id}}. Provide at least one metric or bar. Example: {"title":"GPU memory budget","inputs":[{"kind":"select","id":"quant","label":"Quantization","options":["Q4_K","FP16"],"defaultValue":"Q4_K"},{"kind":"slider","id":"ctx","label":"Context","min":2,"max":64,"defaultValue":16}],"metrics":[{"label":"VRAM","formula":"quant == \'FP16\' ? 15.2 : 4.6 + ctx * 0.05","unit":"GB"}]}. Pass statePath only in local --stdio mode to add an Apply & remember snapshot action.',
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
        'Use when the user must choose between 2-4 concrete options (libraries, architectures, rollout plans) and you can state the trade-offs. Builds a comparison matrix plus selectable decision cards with an apply action. Do not call when one option is clearly correct or no decision is needed. criteria values are ordered exactly like options; winner is a 0-based option index; mark at most one option recommended. Option prompts fire an immediate follow-up message when clicked. Example: {"title":"Choose a serving stack","options":[{"label":"llama.cpp","recommended":true},{"label":"vLLM"},{"label":"SGLang"}],"criteria":[{"label":"Single GPU","values":["Native","Heavy","CUDA-focused"],"winner":0}]}. Pass statePath only in local --stdio mode to add a Record decision snapshot action.',
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
        'Use when explaining a layered call chain, data flow, pipeline, or dependency topology. Provide nodes and directed edges only; coordinates, box sizes, and arrow paths are computed automatically. Do not hand-calculate SVG coordinates for these cases, and do not use this tool for measured charts (use render_threadframe with plot/chart). Nodes need stable ids (derived from labels when omitted); edges reference ids or labels. Optional inputs declare variables usable by node valueFormula and edge activeFormula to animate paths from sliders or toggles. Cycles are layered safely. Example: {"title":"Request path","nodes":[{"id":"client","label":"Client"},{"id":"api","label":"API","role":"Node"}],"edges":[{"from":"client","to":"api","label":"HTTP"}]}. Pass statePath only in local --stdio mode to add a Remember diagram snapshot action.',
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
    "inspect_preset_frame",
    {
      title: "Inspect Preset ThreadFrame",
      description:
        "Render one of the built-in ThreadFrame showpieces. Use it to show the available interaction patterns quickly; presets are demonstrations, not measured data.",
      inputSchema: z.object({
        embedPath: embedPathSchema,
        preset: z
          .enum(["gpu-vram-tuner", "runtime-compare", "deploy-checklist", "mcp-architecture", "composable-workbench", "svg-visual-lab", "agent-launch-kit"])
          .describe("Preset showcase identifier"),
      }),
      _meta: { ui: { resourceUri: UI_RESOURCE_URI } },
    },
    async ({ preset, embedPath }) => respond(PRESETS[preset], embedPath),
  );

  server.registerTool(
    "save_threadframe_state",
    {
      title: "Save ThreadFrame State",
      description:
        "Write a compact snapshot for the next turn. Called by the ThreadFrame UI's explicit Apply & remember action. Available only in local --stdio mode; disabled over HTTP. statePath must be an explicit local .json path without device names, ADS, UNC paths, or symlink components.",
      inputSchema: z.object({ statePath: z.string(), snapshot: SnapshotSchema }),
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
        "Read the latest confirmed ThreadFrame snapshot from an explicitly chosen .json path. Read-only and available only in local --stdio mode; disabled over HTTP.",
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
