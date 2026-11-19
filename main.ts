#!/usr/bin/env node
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
import { MARKUP_RECIPES } from "./src/examples.js";
import { compileMarkup, MarkupInputSchema } from "./src/schema/markup.js";
import { UiSpecSchema, choiceAssignmentIssues, type UiSpec } from "./src/schema/uiSpec.js";
import { injectStandaloneHtml } from "./src/export.js";

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));

/**
 * Exports any preset or JSON UiSpec into a standalone single-file HTML document
 * suitable for Antigravity <agent-embed> or offline browser sharing.
 */
async function exportStandaloneHtml(source: string, outputPath: string, embed: boolean): Promise<void> {
  let spec: UiSpec;
  if (Object.hasOwn(PRESETS, source)) {
    spec = PRESETS[source];
  } else {
    const chunks: Buffer[] = [];
    if (source === "-") for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
    const raw = source === "-" ? Buffer.concat(chunks).toString("utf8") : await fs.readFile(path.resolve(source), "utf-8");
    spec = UiSpecSchema.parse(JSON.parse(raw));
  }

  const issues = choiceAssignmentIssues(spec.blocks);
  if (issues.length) throw new Error(`Invalid ThreadFrame spec:\n- ${issues.join("\n- ")}`);

  const bundleHtml = await readUiBundleHtml();
  const injected = injectStandaloneHtml(bundleHtml, spec, { embed });

  await fs.mkdir(path.dirname(path.resolve(outputPath)), { recursive: true });
  await fs.writeFile(path.resolve(outputPath), injected, "utf-8");
  console.log(`Exported standalone ThreadFrame to ${path.resolve(outputPath)}`);
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

  app.get("/markup-examples.json", (_req: Request, res: Response) => {
    res.json(MARKUP_RECIPES);
  });

  app.post("/compile-markup", json({ limit: "1mb" }), (req: Request, res: Response) => {
    const parsed = MarkupInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json({ issues: parsed.error.issues.map((issue) => ({ path: issue.path, message: issue.message })) });
      return;
    }
    const compiled = compileMarkup(parsed.data);
    if (!compiled.ok) {
      res.status(422).json({ issues: compiled.issues.map((message) => ({ path: [], message })) });
      return;
    }
    res.json({ spec: compiled.spec });
  });

  app.post("/validate", json({ limit: "1mb" }), (req: Request, res: Response) => {
    const parsed = UiSpecSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json({ issues: parsed.error.issues.map((issue) => ({ path: issue.path, message: issue.message })) });
      return;
    }
    const issues = choiceAssignmentIssues(parsed.data.blocks);
    if (issues.length) {
      res.status(422).json({ issues: issues.map((message) => ({ path: [], message })) });
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
    console.log(`ThreadFrame playground: http://127.0.0.1:${port}/`);
    console.log(`ThreadFrame MCP HTTP:   http://127.0.0.1:${port}/mcp`);
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
    if (process.argv.includes("--stdio")) throw new Error("--export and --stdio cannot be combined");
    const source = process.argv[exportIdx + 1];
    const out = process.argv[exportIdx + 2];
    if (!source || !out || out.startsWith("--")) {
      console.error("Usage: threadframe --export <preset|spec.json|-> <output.html> [--embed]");
      process.exit(1);
    }
    await exportStandaloneHtml(source, out, process.argv.includes("--embed"));
    return;
  }

  if (process.argv.includes("--stdio")) {
    await createServer({ localStdio: true }).connect(new StdioServerTransport());
    return;
  }

  await startHttpServer(createServer);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
