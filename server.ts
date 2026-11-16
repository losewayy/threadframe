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
import { UiSpecSchema } from "./src/schema/uiSpec.js";
import type { UiSpec } from "./src/schema/uiSpec.js";
import { detectClientAdapter } from "./src/clientAdapter.js";
import { injectStandaloneHtml } from "./src/export.js";
import { writeEmbedFile } from "./src/embedFile.js";
import { SVG_EXAMPLES } from "./src/examples.js";

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
export const UI_BUNDLE_PATH = path.resolve(THIS_DIR, import.meta.url.endsWith(".ts") ? "dist/mcp-app.html" : "mcp-app.html");
export const UI_RESOURCE_URI = "ui://intelligence-ui/view.html";

/**
 * Reads the compiled single-file HTML bundle from dist/mcp-app.html.
 */
export async function readUiBundleHtml(): Promise<string> {
  return fs.readFile(UI_BUNDLE_PATH, "utf-8");
}

/**
 * Creates a configured MCP server exposing streaming Intelligence UI tools and ui:// resources.
 */
export function createServer(options: { localStdio?: boolean } = {}): McpServer {
  const server = new McpServer({
    name: "intelligence-ui",
    version: "0.2.0",
  });

  const embedPathSchema = z.string().optional().describe(
    "Optional local .html output path for non-MCP-Apps embedded hosts. Only local --stdio may write files. Native MCP Apps clients should omit this.",
  );
  const respond = async (spec: UiSpec, embedPath?: string) => {
    const markdown = renderFallbackMarkdown(spec);
    const mode = detectClientAdapter(server.server.getClientVersion(), server.server.getClientCapabilities(), process.env.INTELLIGENCE_UI_HOST);
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

  registerAppTool(
    server,
    "render_intelligence_ui",
    {
      title: "Render Inline Intelligence UI",
      description:
        'Render declarative MCP Apps UI with Markdown fallback. Leaves: choices (decisions), controls (variables), stats (KPIs), chart (breakdown bars), plot (line/bar/donut), svg (safe diagrams), compare (matrices), checklist (checks), timeline (steps), architecture (layers), callout (notes), code (config previews). Layouts: grid holds leaves; tabs/accordion hold leaves or one grid. Control IDs define variables; formulas use round(x * 2, 1) or string + suffix; code uses {{var}}. Minimal linked example: {"title":"Size","blocks":[{"kind":"controls","controls":[{"kind":"slider","id":"x","label":"Size","min":1,"max":10,"defaultValue":3}]},{"kind":"stats","items":[{"label":"Size","formula":"x"}]},{"kind":"svg","width":120,"height":30,"elements":[{"type":"rect","x":0,"y":0,"widthFormula":"x * 10","height":20,"fill":"primary"}]}]}. Read intelligence-ui://examples/svg for three editable diagrams. Never supply executable HTML or JavaScript.',
      inputSchema: UiSpecSchema.extend({ embedPath: embedPathSchema }),
      _meta: { ui: { resourceUri: UI_RESOURCE_URI } },
    },
    async ({ embedPath, ...spec }) => respond(spec, embedPath),
  );

  registerAppTool(
    server,
    "inspect_preset_ui",
    {
      title: "Inspect Preset Intelligence UI",
      description:
        "Renders one of the built-in Intelligence UI showcases (gpu-vram-tuner, runtime-compare, deploy-checklist, mcp-architecture, composable-workbench, svg-visual-lab, agent-launch-kit).",
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

  server.registerResource("Safe SVG examples", "intelligence-ui://examples/svg", {
    mimeType: "application/json", description: "Editable capacity bar, flow arrows and reactive size examples with controls and formulas.",
  }, async (uri) => ({ contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(SVG_EXAMPLES) }] }));

  registerAppResource(
    server,
    "Intelligence UI Runtime",
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
