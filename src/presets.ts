import type { UiSpec } from "./schema/uiSpec.js";

const WORKBENCH_KV = "round(wb_context * wb_batch * (wb_flash ? 0.035 : 0.055), 1)";

/**
 * Built-in presets demonstrating leaf primitives and bounded composition.
 * Used both by `inspect_preset_ui` and the local interactive Playground.
 */
export const PRESETS: Record<string, UiSpec> = {
  "gpu-vram-tuner": {
    title: "Local LLM VRAM & Throughput Budget",
    subtitle: "Adjust quantization, context window, and batching locally inside chat.",
    badge: "Reactive Calculator",
    blocks: [
      {
        kind: "choices",
        title: "Quick Hardware Profiles",
        options: [
          {
            id: "laptop-fast",
            label: "12 GB Laptop Fast",
            description: "Q4_K, 16K ctx, batch 2",
            setVars: { quant: "Q4_K", ctx_k: 16, batch: 2, flash_attn: true },
          },
          {
            id: "fp16-fit",
            label: "FP16 Baseline",
            description: "Full precision weights",
            setVars: { quant: "FP16", ctx_k: 8, batch: 1, flash_attn: true },
          },
          {
            id: "long-ctx",
            label: "64K Long Context",
            description: "Stress-test KV cache",
            setVars: { quant: "Q4_K", ctx_k: 64, batch: 4, flash_attn: true },
          },
        ],
      },
      {
        kind: "controls",
        title: "Runtime Parameters",
        controls: [
          {
            kind: "select",
            id: "quant",
            label: "Weights Format",
            options: ["Q4_K", "Q8_0", "FP16"],
            defaultValue: "Q4_K",
          },
          {
            kind: "slider",
            id: "ctx_k",
            label: "Context Window",
            min: 2,
            max: 64,
            step: 2,
            defaultValue: 16,
            unit: "K",
          },
          {
            kind: "slider",
            id: "batch",
            label: "Concurrent Sequences",
            min: 1,
            max: 16,
            step: 1,
            defaultValue: 2,
            unit: "seq",
          },
          {
            kind: "toggle",
            id: "flash_attn",
            label: "FlashAttention KV Compression",
            defaultValue: true,
          },
        ],
        metrics: [
          {
            label: "Total VRAM",
            formula:
              "(quant == 'FP16' ? 15.2 : (quant == 'Q8_0' ? 8.6 : 4.6)) + ctx_k * batch * (flash_attn ? 0.045 : 0.072) + 0.8",
            unit: "GB",
            precision: 1,
            warnAbove: 12,
          },
          {
            label: "Est. Decode",
            formula:
              "max(8, round((quant == 'FP16' ? 34 : (quant == 'Q8_0' ? 62 : 94)) - batch * 3.2 - ctx_k * 0.22 + (flash_attn ? 8 : 0)))",
            unit: "tok/s",
            precision: 0,
          },
        ],
      },
      {
        kind: "chart",
        title: "VRAM Footprint vs 12 GB Target",
        mode: "stacked",
        max: 16,
        unit: "GB",
        bars: [
          {
            label: "Model Weights",
            formula: "round(quant == 'FP16' ? 15.2 : (quant == 'Q8_0' ? 8.6 : 4.6), 1)",
            tone: "primary",
          },
          {
            label: "KV Cache",
            formula: "round(ctx_k * batch * (flash_attn ? 0.045 : 0.072), 1)",
            tone: "accent",
          },
          {
            label: "CUDA Scratch / Activations",
            value: 0.8,
            tone: "success",
          },
        ],
      },
    ],
    actions: [
      {
        label: "Apply Configuration to Chat",
        kind: "send_message",
        promptTemplate: "Use these runtime parameters for our config: {{state_summary}}",
      },
    ],
  },
  "runtime-compare": {
    title: "Inference Backend Matrix",
    subtitle: "Comparing local single-GPU vs multi-GPU serving trade-offs.",
    badge: "Decision Matrix",
    blocks: [
      {
        kind: "compare",
        title: "Architecture & Operational Fit",
        columns: ["llama.cpp", "vLLM", "SGLang"],
        recommendedIndex: 0,
        rows: [
          {
            criterion: "Single Consumer GPU",
            values: ["Native GGUF + CPU offload", "Good, heavier base footprint", "Good, CUDA-focused"],
            winnerIndex: 0,
          },
          {
            criterion: "High-Concurrency Serving",
            values: ["Basic slot batching", "PagedAttention mature", "RadixAttention prefix reuse"],
            winnerIndex: 2,
          },
          {
            criterion: "Cross-Platform Backends",
            values: ["CUDA, Metal, Vulkan, CPU", "CUDA primary, ROCm", "CUDA primary"],
            winnerIndex: 0,
          },
          {
            criterion: "Binary Distribution",
            values: ["Zero-Python C++ binary", "Python + Torch stack", "Python + CUDA kernels"],
            winnerIndex: 0,
          },
        ],
      },
      {
        kind: "choices",
        title: "Drill Down Next",
        options: [
          {
            id: "deep-llamacpp",
            label: "Benchmark llama.cpp Vulkan vs CUDA",
            prompt: "Compare llama.cpp Vulkan and CUDA throughput on single 12 GB GPU.",
          },
          {
            id: "deep-sglang",
            label: "Inspect SGLang Prefix Cache",
            prompt: "Explain when RadixAttention outperforms standard continuous batching.",
          },
        ],
      },
    ],
  },
  "deploy-checklist": {
    title: "MCP App Release Verification",
    subtitle: "Track local verification gates before shipping to desktop clients.",
    badge: "Workflow Gate",
    blocks: [
      {
        kind: "checklist",
        title: "Pre-Flight Verification",
        items: [
          {
            id: "singlefile",
            label: "Bundle UI into self-contained HTML artifact",
            checked: true,
            detail: "vite-plugin-singlefile outputs dist/mcp-app.html with zero external CDN scripts.",
          },
          {
            id: "csp",
            label: "Verify strict iframe CSP compatibility",
            checked: true,
            detail: "No eval/new Function; formula evaluator uses recursive-descent parser.",
          },
          {
            id: "partial",
            label: "Test progressive tool-input-partial rendering",
            checked: false,
            detail: "Verify healed partial JSON mounts skeleton before final tool result.",
          },
          {
            id: "fallback",
            label: "Check plain-text fallback for TUI/CLI hosts",
            checked: false,
            detail: "Ensure non-UI MCP clients receive clean Markdown tables and bullet summaries.",
          },
        ],
      },
    ],
    actions: [
      {
        label: "Report Checklist Status",
        kind: "send_message",
        promptTemplate: "Current checklist status: {{state_summary}}",
      },
    ],
  },
  "mcp-architecture": {
    title: "Intelligence UI Execution Pipeline",
    subtitle: "Click any node to inspect how streaming UI crosses host sandboxes.",
    badge: "Exploded Stack",
    blocks: [
      {
        kind: "architecture",
        title: "Four-Layer Bridge",
        layers: [
          {
            layer: "1. Agent & Protocol",
            nodes: [
              {
                id: "llm",
                label: "LLM Tool Call",
                role: "Streaming JSON Args",
                badge: "MCP",
                detail: "Model invokes render_intelligence_ui with declarative blocks; host heals partial JSON tokens in flight.",
              },
              {
                id: "server",
                label: "MCP Apps Server",
                role: "ui:// Resource + Fallback",
                badge: "SEP-1865",
                detail: "Links tool metadata via _meta.ui.resourceUri and serves Markdown fallback for TUI/CLI agents.",
              },
            ],
          },
          {
            layer: "2. Host Sandbox Container",
            nodes: [
              {
                id: "host",
                label: "Desktop Chat Host",
                role: "Claude / ChatGPT / VS Code",
                badge: "Iframe",
                detail: "Mounts dist/mcp-app.html inline inside the conversation thread under strict CSP isolation.",
              },
              {
                id: "bridge",
                label: "JSON-RPC postMessage",
                role: "ui/notifications/*",
                badge: "Bidirectional",
                detail: "Streams tool-input-partial, tool-input, host theme, and sends ui/message actions back to the agent.",
              },
            ],
          },
          {
            layer: "3. Embedded UI Kernel",
            nodes: [
              {
                id: "parser",
                label: "Partial Spec Parser",
                role: "Progressive Mount",
                badge: "Streaming",
                detail: "Renders completed blocks immediately while showing live skeletons for incomplete trailing blocks.",
              },
              {
                id: "formula",
                label: "CSP-Safe Formula Engine",
                role: "Zero-Latency Reactivity",
                badge: "Local State",
                detail: "Recalculates derived metrics and chart bars client-side on slider/toggle input without server round-trips.",
              },
            ],
          },
        ],
      },
    ],
  },
  "composable-workbench": {
    title: "Inference Deployment Workbench",
    subtitle: "Tune your memory budget, review readiness, and keep the deployment plan in one place.",
    badge: "Composable Workspace",
    blocks: [
      {
        kind: "callout",
        title: "Start with a quantized baseline",
        tone: "warn",
        body: "A quantized model leaves room for context and batching on a 12 GB GPU. Keep the estimated total below your memory budget.",
        items: ["Longer context and more concurrent sequences increase KV cache memory.", "These estimates are planning inputs; verify them with your actual model and workload."],
      },
      {
        kind: "tabs",
        id: "deployment-views",
        defaultTab: "budget",
        tabs: [
          {
            id: "budget",
            label: "Memory budget",
            badge: "Live",
            children: [
              {
                kind: "grid",
                columns: 2,
                children: [
                  {
                    kind: "controls",
                    title: "Runtime parameters",
                    controls: [
                      { kind: "slider", id: "wb_context", label: "Context window", min: 4, max: 128, step: 4, defaultValue: 16, unit: "K" },
                      { kind: "slider", id: "wb_batch", label: "Concurrent sequences", min: 1, max: 8, step: 1, defaultValue: 2 },
                      { kind: "toggle", id: "wb_flash", label: "KV cache compression", defaultValue: true },
                    ],
                    metrics: [
                      { label: "Estimated total", formula: `round(4.6 + 0.8 + ${WORKBENCH_KV}, 1)`, unit: "GB", precision: 1, warnAbove: 12 },
                    ],
                  },
                  {
                    kind: "chart",
                    title: "12 GB memory budget",
                    mode: "stacked",
                    max: 12,
                    unit: "GB",
                    bars: [
                      { label: "Model weights", value: 4.6, tone: "primary" },
                      { label: "KV cache", formula: WORKBENCH_KV, tone: "accent" },
                      { label: "Runtime overhead", value: 0.8, tone: "success" },
                    ],
                  },
                ],
              },
            ],
          },
          {
            id: "readiness",
            label: "Release readiness",
            badge: "3 checks",
            children: [
              {
                kind: "checklist",
                title: "Before deployment",
                items: [
                  { id: "wb-budget", label: "Keep the memory estimate within the GPU budget", checked: true },
                  { id: "wb-workload", label: "Measure throughput with a representative workload" },
                  { id: "wb-host", label: "Verify the interactive view in the target desktop host" },
                ],
              },
              {
                kind: "chart",
                title: "Current estimate",
                max: 12,
                unit: "GB",
                bars: [{ label: "Total memory", formula: `round(4.6 + 0.8 + ${WORKBENCH_KV}, 1)` }],
              },
            ],
          },
        ],
      },
      {
        kind: "accordion",
        id: "deployment-details",
        title: "Deployment notes",
        items: [
          {
            id: "optimization",
            title: "Optimization checklist",
            summary: "3 steps",
            defaultOpen: false,
            children: [
              {
                kind: "checklist",
                items: [
                  { id: "wb-baseline", label: "Record a baseline with the default context and batch size" },
                  { id: "wb-change", label: "Change one runtime parameter at a time" },
                  { id: "wb-headroom", label: "Leave memory headroom for the host and workload peaks" },
                ],
              },
              { kind: "callout", tone: "info", body: "Switching tabs or closing these notes keeps your local parameter values and checklist selections." },
            ],
          },
        ],
      },
    ],
    actions: [{ label: "Use deployment plan", kind: "send_message", promptTemplate: "Use this inference deployment plan: {{state_summary}}" }],
  },
  "svg-visual-lab": {
    title: "Vector Visual Lab",
    subtitle: "Explore a response curve, allocation split, and proportional diagrams with the same controls.",
    badge: "Live Vectors",
    blocks: [
      {
        kind: "controls", title: "Experiment inputs",
        controls: [
          { kind: "slider", id: "lab_load", label: "Allocated capacity", min: 0, max: 100, defaultValue: 42, unit: "%" },
          { kind: "slider", id: "lab_gain", label: "Response gain", min: 1, max: 5, step: 0.25, defaultValue: 2, unit: "×" },
        ],
      },
      {
        kind: "tabs", id: "vector-views", defaultTab: "response",
        tabs: [
          {
            id: "response", label: "Response & diagram", badge: "Live",
            children: [{
              kind: "grid", columns: 2,
              children: [
                {
                  kind: "plot", mode: "line", title: "Response over time",
                  xLabel: "Time", yLabel: "Response", max: 100,
                  points: [
                    { label: "0 s", value: 4 },
                    { label: "1 s", formula: "round(8 + lab_gain * 2, 1)" },
                    { label: "2 s", formula: "round(10 + lab_gain * 5 + lab_load * 0.04, 1)" },
                    { label: "3 s", formula: "round(14 + lab_gain * 6 + lab_load * 0.12, 1)" },
                    { label: "4 s", formula: "round(18 + lab_gain * 8 + lab_load * 0.18, 1)" },
                    { label: "5 s", formula: "round(22 + lab_gain * 10 + lab_load * 0.25, 1)" },
                  ],
                },
                {
                  kind: "svg", title: "Capacity envelope", width: 360, height: 240,
                  caption: "The split and marker follow allocated capacity. Coordinates stay inside a fixed canvas.",
                  elements: [
                    { type: "text", x: 20, y: 36, text: "Available capacity", fontSize: 15 },
                    { type: "rect", x: 20, y: 68, widthFormula: "3.2 * lab_load", height: 36, rx: 4, fill: "primary" },
                    { type: "rect", xFormula: "20 + 3.2 * lab_load", y: 68, widthFormula: "320 - 3.2 * lab_load", height: 36, rx: 4, fill: "accent", opacity: 0.5 },
                    { type: "line", x1Formula: "20 + 3.2 * lab_load", y1: 115, x2Formula: "20 + 3.2 * lab_load", y2: 145, stroke: "muted" },
                    { type: "circle", cxFormula: "20 + 3.2 * lab_load", cy: 145, r: 5, fill: "accent" },
                    { type: "path", d: "M20 170 L340 170", stroke: "muted", opacity: 0.3 },
                    { type: "text", x: 20, y: 212, textFormula: "lab_load + '% allocated'", fontSize: 22 },
                  ],
                },
              ],
            }],
          },
          {
            id: "allocation", label: "Allocation", badge: "Share",
            children: [{
              kind: "grid", columns: 2,
              children: [
                {
                  kind: "plot", mode: "donut", title: "Capacity allocation", unit: "%",
                  centerFormula: "lab_load", centerLabel: "Allocated",
                  points: [
                    { label: "Allocated", formula: "lab_load", tone: "primary" },
                    { label: "Available", formula: "100 - lab_load", tone: "accent" },
                  ],
                },
                {
                  kind: "svg", title: "Load & response", width: 360, height: 240,
                  caption: "The outer circle follows capacity; the inner circle follows response gain.",
                  elements: [
                    { type: "circle", cx: 180, cy: 105, rFormula: "12 + lab_load * 0.45", fill: "accent", opacity: 0.25 },
                    { type: "circle", cx: 180, cy: 105, rFormula: "8 + lab_gain * 5", fill: "primary" },
                    { type: "text", x: 180, y: 205, textFormula: "lab_load", textAnchor: "middle", fontSize: 26 },
                    { type: "text", x: 180, y: 230, text: "Relative load", textAnchor: "middle", fill: "muted", fontSize: 12 },
                  ],
                },
              ],
            }],
          },
        ],
      },
    ],
    actions: [{ label: "Use visual settings", promptTemplate: "Use these visual experiment settings: {{state_summary}}" }],
  },
  "agent-launch-kit": {
    title: "Inference Service Launch Kit",
    subtitle: "Configure planning targets, inspect the pipeline, and prepare a launch command.",
    badge: "Launch Planner",
    blocks: [
      {
        kind: "stats", columns: 3, title: "Configured targets",
        items: [
          { label: "Throughput target", formula: "workers * per_worker_target", unit: "req/s", deltaFormula: "(workers - 1) * per_worker_target", tone: "primary" },
          { label: "Hourly cost ceiling", formula: "workers * hourly_budget", precision: 2, unit: "USD/h", tone: "accent" },
          { label: "Latency budget", formula: "latency_budget", unit: "ms", warnAbove: 150, tone: "success" },
        ],
      },
      {
        kind: "controls", title: "Deployment inputs",
        controls: [
          { kind: "slider", id: "workers", label: "GPU count", min: 1, max: 4, defaultValue: 1 },
          { kind: "select", id: "quant", label: "Model quantization", options: ["awq", "gptq"], defaultValue: "awq" },
          { kind: "slider", id: "concurrency", label: "Concurrent sequences", min: 1, max: 16, defaultValue: 4 },
          { kind: "slider", id: "per_worker_target", label: "Per-GPU throughput target", min: 1, max: 64, defaultValue: 8, unit: "req/s" },
          { kind: "slider", id: "hourly_budget", label: "Per-GPU hourly budget", min: 0.1, max: 3, step: 0.1, defaultValue: 0.5, unit: "USD" },
          { kind: "slider", id: "latency_budget", label: "Latency budget", min: 20, max: 200, step: 10, defaultValue: 100, unit: "ms" },
        ],
      },
      {
        kind: "callout", tone: "info",
        body: "These are configurable planning targets, not measured benchmarks. Verify capacity, model compatibility, and resource limits before launching.",
      },
      {
        kind: "tabs", id: "launch-views", defaultTab: "plan",
        tabs: [
          { id: "plan", label: "Capacity & pipeline", children: [{ kind: "grid", columns: 2, children: [
            { kind: "plot", mode: "bar", title: "Throughput targets", unit: "req/s", precision: 0,
              points: [
                { label: "Per GPU", formula: "per_worker_target", tone: "accent" },
                { label: "Total", formula: "workers * per_worker_target", tone: "primary" },
              ],
            },
            { kind: "svg", title: "Request pipeline", width: 360, height: 240, caption: "The worker pool expands with GPU count.", elements: [
              { type: "rect", x: 20, y: 25, width: 120, height: 44, rx: 6, fill: "accent", opacity: 0.25 },
              { type: "text", x: 80, y: 52, text: "Requests", textAnchor: "middle", fontSize: 14 },
              { type: "polyline", points: "80,75 80,110 180,110 180,135", stroke: "muted", strokeWidth: 2 },
              { type: "polygon", points: "174,130 186,130 180,140", fill: "muted" },
              { type: "rect", x: 70, y: 145, widthFormula: "150 + workers * 12", height: 50, rx: 6, fill: "primary", opacity: 0.3 },
              { type: "text", x: 90, y: 176, textFormula: "workers + ' GPU workers'", fontSize: 14 },
            ] },
          ] }] },
          { id: "launch", label: "Readiness & command", children: [{ kind: "grid", columns: 2, children: [
            { kind: "timeline", id: "launch-steps", title: "Launch sequence", steps: [
              { id: "configure", title: "Set targets", status: "done", meta: "Planning", detail: "Set capacity and cost targets for the deployment." },
              { id: "validate", title: "Validate the workload", status: "active", meta: "Measure", detail: "Measure real throughput and latency with the selected model and GPU topology." },
              { id: "deploy", title: "Launch the service", status: "pending", meta: "Release", detail: "Replace the model placeholder, review the command, and launch in your own environment." },
            ] },
            { kind: "code", title: "Launch command", language: "bash",
              template: "vllm serve <compatible-model-id> --tensor-parallel-size {{workers}} --max-num-seqs {{concurrency}} --quantization {{quant}}",
              caption: "Template only. Choose a compatible model and installed runtime; review before executing.",
            },
          ] }] },
        ],
      },
    ],
    actions: [
      { label: "Send launch plan", kind: "send_message", promptTemplate: "Review this deployment plan: {{state_summary}}" },
      { label: "Copy plan", kind: "copy_state", promptTemplate: "Deployment plan: {{state_summary}}" },
    ],
  },
};

export type PresetKey = keyof typeof PRESETS;
