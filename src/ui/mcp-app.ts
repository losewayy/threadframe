import { App } from "@modelcontextprotocol/ext-apps";
import { syncHostStyles } from "./host-styles.js";
import { syncEmbedTheme } from "./embed-theme.js";
import type { RenderReport } from "../runtime/core/types.js";
import { PRESETS } from "../presets.js";
import { ThreadFrameRenderer } from "../runtime/renderer.js";
import type { UiSpec } from "../schema/uiSpec.js";
import { parsePartialMarkup } from "../schema/markup.js";
import { VERSION } from "../version.js";
import "./styles.css";

declare global {
  interface Window {
    __THREADFRAME_SPEC__?: UiSpec;
    __THREADFRAME_EMBED__?: boolean;
  }
}

const root = document.getElementById("app-root");
if (!root) {
  throw new Error("Missing #app-root container");
}

function resolveSpecPayload(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const record = raw as Record<string, unknown>;
  if (typeof record.preset === "string" && Object.hasOwn(PRESETS, record.preset)) {
    return PRESETS[record.preset];
  }
  return raw;
}

const app = new App({ name: "ThreadFrame", version: VERSION });

let currentStandaloneSpec: UiSpec | null = window.__THREADFRAME_SPEC__ ?? null;
const useHostBridge = !currentStandaloneSpec && window.parent !== window;
if (window.__THREADFRAME_EMBED__ === true) syncEmbedTheme();
let hostConnected = false;
let lastReport: RenderReport | undefined;
function reportRender(report: RenderReport): void {
  lastReport = report;
  document.documentElement.dataset.iuiRenderStatus = report.status;
  window.dispatchEvent(new CustomEvent("threadframe:render", { detail: report }));
  if (hostConnected) void app.sendLog({ level: report.status === "error" ? "error" : "info", data: report }).catch(() => {});
}
let replayTimers: number[] = [];

function clearReplayTimers(): void {
  for (const id of replayTimers) {
    window.clearTimeout(id);
  }
  replayTimers = [];
}

function runStandaloneProgressiveBuild(spec: UiSpec): void {
  clearReplayTimers();
  const total = spec.blocks.length;
  for (let i = 0; i <= total; i++) {
    const t = window.setTimeout(() => {
      const partial: UiSpec = {
        ...spec,
        blocks: spec.blocks.slice(0, Math.max(1, i)),
      };
      if (i < total) {
        renderer.renderPartial(
          {
            ...partial,
            blocks: i === 0 ? [] : spec.blocks.slice(0, i),
          },
          true,
        );
      } else {
        renderer.renderFull(spec);
      }
    }, i * 320);
    replayTimers.push(t);
  }
}

const renderer = new ThreadFrameRenderer(root, {
  sendMessage: useHostBridge ? async (text: string) => {
      await app.sendMessage({
        role: "user",
        content: [{ type: "text", text }],
      });
  } : undefined,
  saveState: useHostBridge ? async (snapshot, statePath) => {
      const result = await app.callServerTool({
        name: "save_threadframe_state",
        arguments: { statePath, snapshot },
      });
      if (result.isError) {
        const content = result.content as Array<{ type: string; text?: string }> | undefined;
        throw new Error(content?.find((part) => part.type === "text" && part.text)?.text ?? "Snapshot rejected");
      }
  } : undefined,
  onRender: reportRender,
  onReplayRequested: currentStandaloneSpec
    ? () => {
        if (currentStandaloneSpec) {
          runStandaloneProgressiveBuild(currentStandaloneSpec);
        }
      }
    : undefined,
});

if (currentStandaloneSpec) {
  runStandaloneProgressiveBuild(currentStandaloneSpec);
} else {
  renderer.renderPartial(
    {
      title: "ThreadFrame",
      blocks: [],
    },
    false,
  );
}

let previewingMarkup = false;
function renderToolInput(raw: Record<string, unknown> | undefined, streaming: boolean): void {
  clearReplayTimers();
  const markup = raw?.markup;
  previewingMarkup = typeof markup === "string";
  if (typeof markup === "string") {
    // Only the server's tool result may add actions or confirm a complete card.
    const preview = parsePartialMarkup({
      markup,
      title: typeof raw?.title === "string" ? raw.title : undefined,
      subtitle: typeof raw?.subtitle === "string" ? raw.subtitle : undefined,
      badge: typeof raw?.badge === "string" ? raw.badge : undefined,
    });
    renderer.renderPartial(preview, streaming, streaming ? preview.pendingBlockCount : 0);
  } else {
    renderer.renderPartial(resolveSpecPayload(raw), streaming);
  }
}

// Register handlers before connect() so initial notifications are never missed.
app.ontoolinputpartial = (params) => renderToolInput(params.arguments, true);
app.ontoolinput = (params) => renderToolInput(params.arguments, false);

app.ontoolresult = (result) => {
  clearReplayTimers();
  if (result.structuredContent) {
    renderer.renderPartial(resolveSpecPayload(result.structuredContent), false);
  } else if (previewingMarkup && result.isError) {
    const issue = result.content?.find((part) => part.type === "text");
    renderer.renderFull({
      title: "Card could not be built",
      blocks: [{ kind: "callout", tone: "warn", body: issue?.text ?? "Check the markup and try again." }],
    });
  }
  previewingMarkup = false;
};

app.onhostcontextchanged = (ctx) => syncHostStyles(ctx);

if (useHostBridge) {
  void app.connect().then(() => {
    hostConnected = true;
    syncHostStyles(app.getHostContext());
    if (lastReport) reportRender(lastReport);
  }).catch(() => {
    // Standalone / non-MCP iframe fallback if parent does not speak MCP Apps JSON-RPC
    if (!currentStandaloneSpec) {
      currentStandaloneSpec = PRESETS["gpu-vram-tuner"];
      runStandaloneProgressiveBuild(currentStandaloneSpec);
    }
  });
}
