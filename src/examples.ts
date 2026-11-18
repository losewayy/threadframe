import type { CalculatorInput, DecisionInput, DiagramInput } from "./compile.js";
import type { UiSpec } from "./schema/uiSpec.js";

export const SVG_EXAMPLES: Record<string, UiSpec> = {
  capacity: {
    title: "Capacity allocation", subtitle: "Illustrative units, not measured memory usage.",
    blocks: [
      { kind: "controls", controls: [{ kind: "slider", id: "used", label: "Used", min: 0, max: 12, defaultValue: 4 }] },
      { kind: "stats", items: [{ label: "Used", formula: "used", unit: "GB" }] },
      { kind: "svg", width: 280, height: 64, elements: [
        { type: "rect", x: 10, y: 8, width: 240, height: 20, rx: 4, fill: "muted", opacity: 0.2 },
        { type: "rect", x: 10, y: 8, widthFormula: "used * 20", height: 20, rx: 4, fill: "primary" },
        { type: "text", x: 10, y: 52, textFormula: "used + ' / 12 GB'", fontSize: 14 },
      ] },
    ],
  },
  flow: {
    title: "Request flow", blocks: [{ kind: "svg", width: 300, height: 100, elements: [
      { type: "rect", x: 10, y: 20, width: 90, height: 40, rx: 5, fill: "primary", opacity: 0.25 },
      { type: "text", x: 55, y: 45, text: "Request", textAnchor: "middle", fontSize: 13 },
      { type: "line", x1: 110, y1: 40, x2: 180, y2: 40, stroke: "muted", strokeWidth: 2 },
      { type: "polygon", points: "180,35 188,40 180,45", fill: "muted" },
      { type: "rect", x: 198, y: 20, width: 90, height: 40, rx: 5, fill: "accent", opacity: 0.25 },
      { type: "text", x: 243, y: 45, text: "Worker", textAnchor: "middle", fontSize: 13 },
    ] }],
  },
  size: {
    title: "Reactive dimensions", blocks: [
      { kind: "controls", controls: [{ kind: "slider", id: "size", label: "Size", min: 10, max: 100, defaultValue: 40 }] },
      { kind: "svg", width: 240, height: 140, elements: [
        { type: "rect", x: 10, y: 10, widthFormula: "size * 2", heightFormula: "size", rx: 4, fill: "success", opacity: 0.5 },
        { type: "text", x: 10, y: 130, textFormula: "size * 2 + ' × ' + size", fontSize: 14 },
      ] },
    ],
  },
};

/** Minimal copy-paste recipes for the shortcut tools. */
export const RECIPES: { calculator: CalculatorInput; decision: DecisionInput; diagram: DiagramInput } = {
  calculator: {
    title: "GPU memory and throughput budget",
    subtitle: "Tune quantization, context, and batching before choosing runtime flags.",
    inputs: [
      { id: "quant", kind: "select", label: "Weights format", options: ["Q4_K", "Q8_0", "FP16"], defaultValue: "Q4_K" },
      { id: "context", kind: "slider", label: "Context window", min: 2, max: 64, step: 2, defaultValue: 16, unit: "K" },
      { id: "batch", kind: "slider", label: "Concurrent sequences", min: 1, max: 8, defaultValue: 2 },
      { id: "flash", kind: "toggle", label: "KV cache compression", defaultValue: true },
    ],
    metrics: [
      { label: "Estimated VRAM", formula: "round((quant == 'FP16' ? 15.2 : (quant == 'Q8_0' ? 8.6 : 4.6)) + context * batch * (flash ? 0.045 : 0.072) + 0.8, 1)", unit: "GB", precision: 1, warnAbove: 12 },
    ],
    bars: [
      { label: "Weights", formula: "quant == 'FP16' ? 15.2 : (quant == 'Q8_0' ? 8.6 : 4.6)", unit: "GB" },
      { label: "KV cache", formula: "round(context * batch * (flash ? 0.045 : 0.072), 1)", unit: "GB", tone: "accent" },
    ],
    template: "llama-server -m <model> -c {{context}}K --parallel {{batch}}",
    templateLanguage: "bash",
  },
  decision: {
    title: "Choose a serving stack",
    subtitle: "Single 12 GB GPU, mostly local single-user workloads.",
    options: [
      { id: "llamacpp", label: "llama.cpp", description: "Zero-Python binary, offload support.", recommended: true },
      { id: "vllm", label: "vLLM", description: "Mature paged attention serving stack." },
      { id: "sglang", label: "SGLang", description: "Prefix reuse for high-concurrency traffic." },
    ],
    criteria: [
      { label: "Single consumer GPU", values: ["Native", "Heavier base footprint", "CUDA-focused"], winner: 0 },
      { label: "High concurrency", values: ["Basic slot batching", "PagedAttention", "RadixAttention"], winner: 2 },
      { label: "Cross-platform", values: ["CUDA, Metal, Vulkan, CPU", "CUDA / ROCm", "CUDA primary"], winner: 0 },
    ],
  },
  diagram: {
    title: "Reactive request path",
    subtitle: "Toggle KV cache compression to highlight the secondary path.",
    direction: "LR",
    nodes: [
      { id: "client", label: "Client", role: "Browser" },
      { id: "api", label: "API", role: "Node service" },
      { id: "worker", label: "GPU worker", role: "CUDA", valueFormula: "panel * 4", unit: "ms" },
      { id: "cache", label: "KV cache", role: "Memory pool" },
    ],
    edges: [
      { from: "client", to: "api", label: "HTTP" },
      { from: "api", to: "worker", label: "batch" },
      { from: "worker", to: "cache", label: "paged" },
      { from: "cache", to: "api", label: "reuse", dashed: true, activeFormula: "compress" },
    ],
    inputs: [
      { kind: "toggle", id: "compress", label: "KV cache compression", defaultValue: false },
      { kind: "slider", id: "panel", label: "Batch panel", min: 1, max: 16, defaultValue: 4, unit: "ms" },
    ],
  },
};
