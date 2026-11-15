import { App, applyDocumentTheme } from "@modelcontextprotocol/ext-apps";
import { PRESETS } from "../presets.js";
import { IntelligenceUiRenderer } from "../runtime/renderer.js";
import type { UiSpec } from "../schema/uiSpec.js";
import "./styles.css";

declare global {
  interface Window {
    __INTELLIGENCE_UI_SPEC__?: UiSpec;
  }
}

const root = document.getElementById("app-root");
if (!root) {
  throw new Error("Missing #app-root container");
}

function resolveSpecPayload(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const record = raw as Record<string, unknown>;
  if (typeof record.preset === "string" && record.preset in PRESETS) {
    return PRESETS[record.preset];
  }
  return raw;
}

const app = new App({ name: "Intelligence UI", version: "0.1.0" });

let currentStandaloneSpec: UiSpec | null = window.__INTELLIGENCE_UI_SPEC__ ?? null;
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

const renderer = new IntelligenceUiRenderer(root, {
  sendMessage: async (text: string) => {
    if (window.parent !== window) {
      await app.sendMessage({
        role: "user",
        content: [{ type: "text", text }],
      });
    }
  },
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
      title: "Intelligence UI",
      subtitle: "Waiting for host tool stream...",
      blocks: [],
    },
    true,
  );
}

// Register MCP Apps lifecycle handlers BEFORE connect() so initial notifications are never missed
app.ontoolinputpartial = (params) => {
  clearReplayTimers();
  renderer.renderPartial(resolveSpecPayload(params.arguments), true);
};

app.ontoolinput = (params) => {
  clearReplayTimers();
  renderer.renderPartial(resolveSpecPayload(params.arguments), false);
};

app.ontoolresult = (result) => {
  clearReplayTimers();
  if (result.structuredContent) {
    renderer.renderPartial(resolveSpecPayload(result.structuredContent), false);
  }
};

app.onhostcontextchanged = (ctx) => {
  if (ctx.theme) {
    applyDocumentTheme(ctx.theme);
    document.documentElement.dataset.theme = ctx.theme;
  }
};

if (window.parent !== window) {
  void app.connect().catch(() => {
    // Standalone / non-MCP iframe fallback if parent does not speak MCP Apps JSON-RPC
    if (!currentStandaloneSpec) {
      currentStandaloneSpec = PRESETS["gpu-vram-tuner"];
      runStandaloneProgressiveBuild(currentStandaloneSpec);
    }
  });
}
