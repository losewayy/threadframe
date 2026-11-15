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

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
export const UI_BUNDLE_PATH = path.resolve(THIS_DIR, "mcp-app.html");
export const UI_RESOURCE_URI = "ui://intelligence-ui/view.html";

/**
 * Reads the compiled single-file HTML bundle from dist/mcp-app.html.
 */
export async function readUiBundleHtml(): Promise<string> {
  try {
    return await fs.readFile(UI_BUNDLE_PATH, "utf-8");
  } catch {
    // Also support running via tsx directly from project root before tsc emits into dist/
    const fallbackPath = path.resolve(THIS_DIR, "dist", "mcp-app.html");
    return fs.readFile(fallbackPath, "utf-8");
  }
}

/**
 * Creates a configured MCP server exposing streaming Intelligence UI tools and ui:// resources.
 */
export function createServer(): McpServer {
  const server = new McpServer({
    name: "intelligence-ui",
    version: "0.1.0",
  });

  registerAppTool(
    server,
    "render_intelligence_ui",
    {
      title: "Render Inline Intelligence UI",
      description:
        "Renders an interactive inline Intelligence UI widget (choices, sliders/calculators, charts, comparisons, checklists, or architecture diagrams) inside MCP Apps-capable chat clients, with Markdown fallback for CLI hosts. Use selectively when interactive controls or structured visual comparison clearly outperform prose.",
      inputSchema: UiSpecSchema,
      _meta: { ui: { resourceUri: UI_RESOURCE_URI } },
    },
    async (args) => {
      const markdown = renderFallbackMarkdown(args);
      return {
        content: [{ type: "text", text: markdown }],
        structuredContent: args,
      };
    },
  );

  registerAppTool(
    server,
    "inspect_preset_ui",
    {
      title: "Inspect Preset Intelligence UI",
      description:
        "Renders one of the built-in Intelligence UI showcases (gpu-vram-tuner, runtime-compare, deploy-checklist, mcp-architecture).",
      inputSchema: z.object({
        preset: z
          .enum(["gpu-vram-tuner", "runtime-compare", "deploy-checklist", "mcp-architecture"])
          .describe("Preset showcase identifier"),
      }),
      _meta: { ui: { resourceUri: UI_RESOURCE_URI } },
    },
    async ({ preset }) => {
      const spec = PRESETS[preset];
      return {
        content: [{ type: "text", text: renderFallbackMarkdown(spec) }],
        structuredContent: spec as unknown as Record<string, unknown>,
      };
    },
  );

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
