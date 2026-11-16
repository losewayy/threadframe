import { createMcpExpressApp } from "@modelcontextprotocol/express";
import { NodeStreamableHTTPServerTransport } from "@modelcontextprotocol/node";
import type { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import cors from "cors";
import type { Request, Response } from "express";
import { json } from "express";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer, readUiBundleHtml } from "./server.js";
import { PRESETS } from "./src/presets.js";
import { UiSpecSchema, type UiSpec } from "./src/schema/uiSpec.js";

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));

/**
 * Exports any preset or JSON UiSpec into a standalone single-file HTML document
 * suitable for Antigravity <agent-embed> or offline browser sharing.
 */
async function exportStandaloneHtml(source: string, outputPath: string): Promise<void> {
  let spec: UiSpec;
  if (source in PRESETS) {
    spec = PRESETS[source];
  } else {
    const raw = await fs.readFile(path.resolve(source), "utf-8");
    spec = UiSpecSchema.parse(JSON.parse(raw));
  }

  const bundleHtml = await readUiBundleHtml();
  // Escape closing script tags inside JSON payload before injecting inline
  const safeJson = JSON.stringify(spec).replace(/<\/script/gi, "<\\/script");
  const injected = bundleHtml.replace(
    "<main id=\"app-root\"></main>",
    `<main id="app-root"></main>\n  <script>window.__INTELLIGENCE_UI_SPEC__ = ${safeJson};</script>`,
  );

  await fs.mkdir(path.dirname(path.resolve(outputPath)), { recursive: true });
  await fs.writeFile(path.resolve(outputPath), injected, "utf-8");
  console.log(`Exported standalone Intelligence UI to ${path.resolve(outputPath)}`);
}

async function readPlaygroundHtml(): Promise<string> {
  const candidates = [
    path.resolve(THIS_DIR, "src", "ui", "playground.html"),
    path.resolve(THIS_DIR, "..", "src", "ui", "playground.html"),
  ];
  for (const candidate of candidates) {
    try {
      return await fs.readFile(candidate, "utf-8");
    } catch {
      continue;
    }
  }
  throw new Error("Could not locate playground.html");
}

/**
 * Starts Streamable HTTP MCP server (/mcp) alongside the local Stream Simulator (/).
 */
export async function startHttpServer(makeServer: () => McpServer): Promise<void> {
  const port = parseInt(process.env.PORT ?? "3001", 10);
  const app = createMcpExpressApp({ host: "127.0.0.1" });
  app.use(cors());

  app.get("/", async (_req: Request, res: Response) => {
    try {
      res.type("html").send(await readPlaygroundHtml());
    } catch (err) {
      res.status(500).send(String(err));
    }
  });

  app.get("/view", async (_req: Request, res: Response) => {
    try {
      res.type("html").send(await readUiBundleHtml());
    } catch (err) {
      res.status(500).send(`UI bundle missing. Run 'pnpm run build' first. (${String(err)})`);
    }
  });

  app.get("/presets.json", (_req: Request, res: Response) => {
    res.json(PRESETS);
  });

  app.post("/validate", json({ limit: "1mb" }), (req: Request, res: Response) => {
    const parsed = UiSpecSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json({ issues: parsed.error.issues.map((issue) => ({ path: issue.path, message: issue.message })) });
      return;
    }
    res.json({ spec: parsed.data });
  });

  app.all("/mcp", async (req: Request, res: Response) => {
    const server = makeServer();
    const transport = new NodeStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    res.on("close", () => {
      transport.close().catch(() => {});
      server.close().catch(() => {});
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error("MCP error:", error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error" },
          id: null,
        });
      }
    }
  });

  const httpServer = app.listen(port, () => {
    console.log(`Intelligence UI playground: http://127.0.0.1:${port}/`);
    console.log(`Intelligence UI MCP HTTP:   http://127.0.0.1:${port}/mcp`);
  });

  const shutdown = () => {
    httpServer.close(() => process.exit(0));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

async function main(): Promise<void> {
  const exportIdx = process.argv.indexOf("--export");
  if (exportIdx !== -1) {
    const source = process.argv[exportIdx + 1];
    const out = process.argv[exportIdx + 2];
    if (!source || !out) {
      console.error("Usage: intelligence-ui --export <preset|spec.json> <output.html>");
      process.exit(1);
    }
    await exportStandaloneHtml(source, out);
    return;
  }

  if (process.argv.includes("--stdio")) {
    await createServer().connect(new StdioServerTransport());
    return;
  }

  await startHttpServer(createServer);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
