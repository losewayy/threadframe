# Intelligence UI

Open-source **streaming Intelligence UI** runtime and [MCP Apps](https://github.com/modelcontextprotocol/ext-apps) (`ui://`, SEP-1865) server that renders interactive, progressive inline widgets inside desktop AI chat threads without modifying host client code.

## Why This Exists

Proprietary generative chat interfaces (such as ChatGPT's inline Intelligent UI) lock interactive components inside closed consumer chat tabs, leaving API agents, Claude Desktop, VS Code, Codex/CLI tools, and self-hosted workflows with plain walls of text. Meanwhile, frontend-coupled libraries require modifying the host application itself.

`intelligence-ui` flips that model: it packs a compact **streaming block renderer** and **CSP-safe reactive formula engine** inside a single `ui://` HTML bundle served via standard MCP Apps, with clean Markdown fallback for terminal/TUI agents and single-file HTML export for inline embeds.

## Six Core UI Primitives

- **`choices`**: Quick decision cards that either update reactive variables or send follow-up prompts back to the agent (`ui/message`).
- **`controls`**: Sliders, toggles, and segmented selectors paired with live reactive metric pills.
- **`chart`**: Standard and stacked breakdown bars bound directly to static values or client-side formulas.
- **`compare`**: Side-by-side decision matrices with winner highlighting.
- **`checklist`**: Stateful interactive checklists with live completion progress.
- **`architecture`**: Layered stack diagrams with clickable node inspection panels.

## Key Capabilities

- **Progressive Streaming**: Consumes `ui/notifications/tool-input-partial` via `@modelcontextprotocol/ext-apps` to render completed blocks while trailing fields are still streaming, and smoothly falls back to `tool-input` / `tool-result` when hosts send full arguments.
- **Zero-`eval` Reactive Formulas**: Includes a recursive-descent expression parser (`+`, `-`, `*`, `/`, comparisons, ternaries, string equality, `min`, `max`, `round`, `clamp`, `if`) so strict sandboxed iframes never block interactive sliders.
- **Automatic Text Fallback**: Every tool invocation returns structured Markdown alongside `structuredContent` so CLI/TUI hosts (such as terminals or OpenCode TUI) never display blank responses.
- **Local Stream Simulator Playground**: Run the server locally and open `http://127.0.0.1:3001/` to test presets, step-by-step `tool-input-partial` streaming, light/dark host themes, and live JSON-RPC `postMessage` bridge traffic.

## Quick Start

```bash
pnpm install
pnpm run build
pnpm test
```

Start the MCP HTTP server and interactive Playground:

```bash
pnpm start
# Playground: http://127.0.0.1:3001/
# MCP Endpoint: http://127.0.0.1:3001/mcp
```

Run over stdio (for Claude Desktop or local MCP client configuration):

```bash
node dist/main.js --stdio
```

Export any built-in preset or custom JSON spec as a self-contained single-file HTML artifact:

```bash
node dist/main.js --export gpu-vram-tuner ./out/vram-tuner.html
```

## Connecting to Claude Desktop (Stdio)

Add an entry to your Claude Desktop MCP configuration pointing at the built entrypoint:

```json
{
  "mcpServers": {
    "intelligence-ui": {
      "command": "node",
      "args": ["<path-to-intelligence-ui>/dist/main.js", "--stdio"]
    }
  }
}
```

## License

MIT — see [LICENSE](./LICENSE).
