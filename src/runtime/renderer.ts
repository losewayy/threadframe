import {
  parsePartialUiSpec,
  type PartialUiSpecResult,
  type UiBlock,
  type UiSpec,
} from "../schema/uiSpec.js";
import { evaluateNumericFormula, type VarScope } from "./formula.js";

export interface RendererHostBridge {
  sendMessage?: (text: string) => Promise<void> | void;
  onReplayRequested?: () => void;
}

interface ReactiveBinding {
  update: (scope: VarScope) => void;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * Stateful progressive renderer for Intelligence UI specs.
 * Supports partial streaming updates without tearing down active form controls.
 */
export class IntelligenceUiRenderer {
  private readonly scope: VarScope = {};
  private readonly checklistState = new Map<string, boolean>();
  private selectedNodeId: string | null = null;
  private selectedChoiceIds = new Set<string>();
  private reactiveBindings: ReactiveBinding[] = [];
  private controlSyncCallbacks: Array<(scope: VarScope) => void> = [];
  private lastStructureSignature = "";
  private statusEl: HTMLElement | null = null;

  constructor(
    private readonly root: HTMLElement,
    private readonly bridge: RendererHostBridge = {},
  ) {}

  renderPartial(raw: unknown, streaming: boolean): void {
    const parsed = parsePartialUiSpec(raw);
    this.renderParsed(parsed, streaming);
  }

  renderFull(spec: UiSpec): void {
    const parsed = parsePartialUiSpec(spec);
    this.renderParsed(parsed, false);
  }

  private renderParsed(parsed: PartialUiSpecResult, streaming: boolean): void {
    this.initScopeDefaults(parsed.blocks);

    // Preserve active slider drag and input focus if only numeric stream payloads are appending
    const sig = JSON.stringify({
      title: parsed.title,
      blocks: parsed.blocks.map((b) => b.kind),
      count: parsed.blocks.length,
      pending: parsed.pendingBlockCount,
      streaming,
    });

    if (sig === this.lastStructureSignature && this.reactiveBindings.length > 0 && !streaming) {
      this.notifyScopeChange();
      return;
    }
    this.lastStructureSignature = sig;
    this.reactiveBindings = [];
    this.controlSyncCallbacks = [];

    this.root.innerHTML = "";
    const shell = el("div", "iui-shell");

    // Header
    const header = el("div", "iui-header");
    const titleWrap = el("div");
    titleWrap.appendChild(el("h2", "iui-title", parsed.title));
    if (parsed.subtitle) {
      titleWrap.appendChild(el("p", "iui-subtitle", parsed.subtitle));
    }
    header.appendChild(titleWrap);

    const meta = el("div", "iui-header-meta");
    const statusBadge = el("span", "iui-badge");
    const dot = el("span", streaming ? "iui-dot streaming" : "iui-dot");
    statusBadge.appendChild(dot);
    statusBadge.appendChild(
      document.createTextNode(
        streaming ? "Streaming UI..." : parsed.badge ?? "Interactive",
      ),
    );
    meta.appendChild(statusBadge);

    if (this.bridge.onReplayRequested && !streaming) {
      const replayBtn = el("button", "iui-action-btn secondary", "Replay Build");
      replayBtn.type = "button";
      replayBtn.addEventListener("click", () => this.bridge.onReplayRequested?.());
      meta.appendChild(replayBtn);
    }
    header.appendChild(meta);
    shell.appendChild(header);

    // Blocks
    for (const block of parsed.blocks) {
      shell.appendChild(this.renderBlock(block));
    }

    if (streaming || parsed.pendingBlockCount > 0) {
      shell.appendChild(
        el("div", "iui-skeleton", "Assembling next UI component from stream..."),
      );
    }

    // Actions footer
    if (parsed.actions.length > 0 || !streaming) {
      const footer = el("div", "iui-footer");
      const btns = el("div");
      btns.style.display = "flex";
      btns.style.gap = "6px";
      btns.style.flexWrap = "wrap";

      for (const action of parsed.actions) {
        const btn = el("button", "iui-action-btn", action.label);
        btn.type = "button";
        btn.addEventListener("click", () => this.handleAction(action.label, action.promptTemplate));
        btns.appendChild(btn);
      }

      footer.appendChild(btns);
      this.statusEl = el("span", "iui-status", "");
      footer.appendChild(this.statusEl);
      shell.appendChild(footer);
    }

    this.root.appendChild(shell);
    this.notifyScopeChange();
  }

  private initScopeDefaults(blocks: UiBlock[]): void {
    for (const block of blocks) {
      if (block.kind === "controls") {
        for (const ctrl of block.controls) {
          if (!(ctrl.id in this.scope)) {
            this.scope[ctrl.id] = ctrl.defaultValue;
          }
        }
      } else if (block.kind === "checklist") {
        for (const item of block.items) {
          if (!this.checklistState.has(item.id)) {
            this.checklistState.set(item.id, Boolean(item.checked));
          }
        }
      } else if (block.kind === "architecture" && this.selectedNodeId === null) {
        const firstNode = block.layers[0]?.nodes[0];
        if (firstNode) this.selectedNodeId = firstNode.id;
      }
    }
  }

  private notifyScopeChange(): void {
    for (const sync of this.controlSyncCallbacks) {
      sync(this.scope);
    }
    for (const binding of this.reactiveBindings) {
      binding.update(this.scope);
    }
  }

  private setStatus(msg: string): void {
    if (this.statusEl) {
      this.statusEl.textContent = msg;
    }
  }

  private summarizeState(): string {
    const parts: string[] = [];
    for (const [k, v] of Object.entries(this.scope)) {
      parts.push(`${k}=${String(v)}`);
    }
    if (this.checklistState.size > 0) {
      let done = 0;
      for (const val of this.checklistState.values()) {
        if (val) done++;
      }
      parts.push(`checklist=${done}/${this.checklistState.size}`);
    }
    if (this.selectedChoiceIds.size > 0) {
      parts.push(`choices=${Array.from(this.selectedChoiceIds).join(",")}`);
    }
    return parts.join(", ");
  }

  private async handleAction(label: string, template?: string): Promise<void> {
    const summary = this.summarizeState();
    const message = template
      ? template.replace("{{state_summary}}", summary)
      : `${label}: ${summary}`;

    if (this.bridge.sendMessage) {
      try {
        await this.bridge.sendMessage(message);
        this.setStatus("Sent to agent chat");
        return;
      } catch {
        this.setStatus("Host rejected ui/message");
        return;
      }
    }

    if (navigator.clipboard) {
      await navigator.clipboard.writeText(message).catch(() => {});
      this.setStatus(`Copied: ${summary}`);
    } else {
      this.setStatus(message);
    }
  }

  private renderBlock(block: UiBlock): HTMLElement {
    const card = el("section", "iui-block");
    if ("title" in block && block.title) {
      card.appendChild(el("h3", "iui-block-title", block.title));
    }

    switch (block.kind) {
      case "choices":
        card.appendChild(this.renderChoices(block));
        break;
      case "controls":
        card.appendChild(this.renderControls(block));
        break;
      case "chart":
        card.appendChild(this.renderChart(block));
        break;
      case "compare":
        card.appendChild(this.renderCompare(block));
        break;
      case "checklist":
        card.appendChild(this.renderChecklist(block));
        break;
      case "architecture":
        card.appendChild(this.renderArchitecture(block));
        break;
    }

    return card;
  }

  private renderChoices(block: Extract<UiBlock, { kind: "choices" }>): HTMLElement {
    const grid = el("div", "iui-choices");
    const buttons: Array<{ id: string; btn: HTMLButtonElement }> = [];

    for (const opt of block.options) {
      const btn = el("button", "iui-choice-btn");
      btn.type = "button";
      btn.appendChild(el("span", "iui-choice-label", opt.label));
      if (opt.description) {
        btn.appendChild(el("span", "iui-choice-desc", opt.description));
      }

      btn.addEventListener("click", () => {
        if (!block.multi) this.selectedChoiceIds.clear();
        if (this.selectedChoiceIds.has(opt.id) && block.multi) {
          this.selectedChoiceIds.delete(opt.id);
        } else {
          this.selectedChoiceIds.add(opt.id);
        }

        for (const item of buttons) {
          item.btn.classList.toggle("active", this.selectedChoiceIds.has(item.id));
        }

        if (opt.setVars) {
          Object.assign(this.scope, opt.setVars);
          this.notifyScopeChange();
          this.setStatus(`Profile: ${opt.label}`);
        } else if (opt.prompt && this.bridge.sendMessage) {
          void this.bridge.sendMessage(opt.prompt);
          this.setStatus(`Prompted: ${opt.label}`);
        } else {
          this.setStatus(`Selected: ${opt.label}`);
        }
      });

      buttons.push({ id: opt.id, btn });
      grid.appendChild(btn);
    }

    return grid;
  }

  private renderControls(block: Extract<UiBlock, { kind: "controls" }>): HTMLElement {
    const wrap = el("div");
    const grid = el("div", "iui-controls-grid");

    for (const ctrl of block.controls) {
      const box = el("div", "iui-control");
      const top = el("div", "iui-control-top");
      top.appendChild(el("span", undefined, ctrl.label));
      const valEl = el("span", "iui-control-val");
      top.appendChild(valEl);
      box.appendChild(top);

      if (ctrl.kind === "slider") {
        const input = el("input", "iui-range");
        input.type = "range";
        input.min = String(ctrl.min);
        input.max = String(ctrl.max);
        input.step = String(ctrl.step ?? 1);
        input.value = String(this.scope[ctrl.id] ?? ctrl.defaultValue);

        const sync = () => {
          const cur = Number(this.scope[ctrl.id] ?? ctrl.defaultValue);
          input.value = String(cur);
          valEl.textContent = `${cur}${ctrl.unit ? ` ${ctrl.unit}` : ""}`;
        };
        sync();
        this.controlSyncCallbacks.push(sync);

        input.addEventListener("input", () => {
          this.scope[ctrl.id] = Number(input.value);
          this.notifyScopeChange();
        });
        box.appendChild(input);
      } else if (ctrl.kind === "toggle") {
        const btn = el("button", "iui-toggle-btn");
        btn.type = "button";
        const sync = () => {
          const on = Boolean(this.scope[ctrl.id]);
          btn.classList.toggle("on", on);
          btn.textContent = on ? "Enabled" : "Off";
          valEl.textContent = on ? "ON" : "OFF";
        };
        sync();
        this.controlSyncCallbacks.push(sync);

        btn.addEventListener("click", () => {
          this.scope[ctrl.id] = !Boolean(this.scope[ctrl.id]);
          this.notifyScopeChange();
        });
        box.appendChild(btn);
      } else {
        const seg = el("div", "iui-seg");
        const segButtons: Array<{ opt: string; btn: HTMLButtonElement }> = [];
        for (const opt of ctrl.options) {
          const btn = el("button", "iui-seg-btn", opt);
          btn.type = "button";
          btn.addEventListener("click", () => {
            this.scope[ctrl.id] = opt;
            this.notifyScopeChange();
          });
          segButtons.push({ opt, btn });
          seg.appendChild(btn);
        }

        const sync = () => {
          const cur = String(this.scope[ctrl.id] ?? ctrl.defaultValue);
          valEl.textContent = cur;
          for (const item of segButtons) {
            item.btn.classList.toggle("active", item.opt === cur);
          }
        };
        sync();
        this.controlSyncCallbacks.push(sync);
        box.appendChild(seg);
      }

      grid.appendChild(box);
    }

    wrap.appendChild(grid);

    if (block.metrics?.length) {
      const strip = el("div", "iui-metrics-strip");
      for (const metric of block.metrics) {
        const pill = el("div", "iui-metric-pill");
        pill.appendChild(el("div", "iui-metric-label", metric.label));
        const numEl = el("div", "iui-metric-num", "-");
        pill.appendChild(numEl);
        strip.appendChild(pill);

        this.reactiveBindings.push({
          update: (scope) => {
            const val = evaluateNumericFormula(metric.formula, scope, 0);
            const txt = metric.precision !== undefined ? val.toFixed(metric.precision) : String(val);
            numEl.textContent = `${txt}${metric.unit ? ` ${metric.unit}` : ""}`;
            const warn = metric.warnAbove !== undefined && val > metric.warnAbove;
            numEl.classList.toggle("warn", warn);
          },
        });
      }
      wrap.appendChild(strip);
    }

    return wrap;
  }

  private renderChart(block: Extract<UiBlock, { kind: "chart" }>): HTMLElement {
    const wrap = el("div");
    const defaultUnit = block.unit ? ` ${block.unit}` : "";

    if (block.mode === "stacked") {
      const track = el("div", "iui-stacked-track");
      const legend = el("div", "iui-legend");
      const segs: Array<{
        bar: (typeof block.bars)[number];
        seg: HTMLElement;
        valEl: HTMLElement;
      }> = [];

      for (const bar of block.bars) {
        const tone = bar.tone ?? "primary";
        const seg = el("div", `iui-stacked-seg ${tone}`);
        track.appendChild(seg);

        const item = el("span", "iui-legend-item");
        item.appendChild(el("span", `iui-swatch ${tone}`));
        item.appendChild(el("span", undefined, `${bar.label}: `));
        const valEl = el("strong");
        item.appendChild(valEl);
        legend.appendChild(item);

        segs.push({ bar, seg, valEl });
      }

      wrap.appendChild(track);
      wrap.appendChild(legend);

      this.reactiveBindings.push({
        update: (scope) => {
          const vals = segs.map((s) =>
            s.bar.formula
              ? evaluateNumericFormula(s.bar.formula, scope, s.bar.value ?? 0)
              : (s.bar.value ?? 0),
          );
          const dynamicMax = block.maxFormula
            ? evaluateNumericFormula(block.maxFormula, scope, block.max ?? 100)
            : (block.max ?? Math.max(1, vals.reduce((a, b) => a + b, 0)));

          segs.forEach((s, idx) => {
            const val = Math.max(0, vals[idx]);
            const pct = Math.min(100, (val / Math.max(0.0001, dynamicMax)) * 100);
            s.seg.style.width = `${pct.toFixed(1)}%`;
            s.valEl.textContent = `${val}${s.bar.unit ? ` ${s.bar.unit}` : defaultUnit}`;
          });
        },
      });
      return wrap;
    }

    const rows: Array<{
      bar: (typeof block.bars)[number];
      fill: HTMLElement;
      valEl: HTMLElement;
    }> = [];
    for (const bar of block.bars) {
      const row = el("div", "iui-bar-row");
      const head = el("div", "iui-bar-head");
      head.appendChild(el("span", undefined, bar.label));
      const valEl = el("span", "iui-control-val");
      head.appendChild(valEl);
      row.appendChild(head);

      const track = el("div", "iui-bar-track");
      const fill = el("div", `iui-bar-fill ${bar.tone ?? "primary"}`);
      track.appendChild(fill);
      row.appendChild(track);
      wrap.appendChild(row);
      rows.push({ bar, fill, valEl });
    }

    this.reactiveBindings.push({
      update: (scope) => {
        const vals = rows.map((r) =>
          r.bar.formula
            ? evaluateNumericFormula(r.bar.formula, scope, r.bar.value ?? 0)
            : (r.bar.value ?? 0),
        );
        const maxVal = block.maxFormula
          ? evaluateNumericFormula(block.maxFormula, scope, block.max ?? 100)
          : (block.max ?? Math.max(1, ...vals));

        rows.forEach((r, idx) => {
          const val = Math.max(0, vals[idx]);
          const pct = Math.min(100, (val / Math.max(0.0001, maxVal)) * 100);
          r.fill.style.width = `${pct.toFixed(1)}%`;
          r.valEl.textContent = `${val}${r.bar.unit ? ` ${r.bar.unit}` : defaultUnit}`;
        });
      },
    });

    return wrap;
  }

  private renderCompare(block: Extract<UiBlock, { kind: "compare" }>): HTMLElement {
    const wrap = el("div", "iui-table-wrap");
    const table = el("table", "iui-table");
    const thead = el("thead");
    const headRow = el("tr");
    headRow.appendChild(el("th", undefined, "Criterion"));
    block.columns.forEach((col, idx) => {
      const label = block.recommendedIndex === idx ? `${col} (Recommended)` : col;
      headRow.appendChild(el("th", undefined, label));
    });
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = el("tbody");
    for (const row of block.rows) {
      const tr = el("tr");
      tr.appendChild(el("td", undefined, row.criterion));
      block.columns.forEach((_, idx) => {
        const td = el("td", row.winnerIndex === idx ? "winner" : undefined, row.values[idx] ?? "-");
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    wrap.appendChild(table);
    return wrap;
  }

  private renderChecklist(block: Extract<UiBlock, { kind: "checklist" }>): HTMLElement {
    const wrap = el("div");
    const progress = el("div", "iui-check-progress");
    wrap.appendChild(progress);

    const updateProgress = () => {
      let done = 0;
      for (const item of block.items) {
        if (this.checklistState.get(item.id)) done++;
      }
      progress.textContent = `${done} of ${block.items.length} completed`;
    };
    updateProgress();

    for (const item of block.items) {
      const label = el("label", "iui-check-item");
      const box = el("input");
      box.type = "checkbox";
      box.checked = Boolean(this.checklistState.get(item.id));
      box.addEventListener("change", () => {
        this.checklistState.set(item.id, box.checked);
        updateProgress();
      });

      const body = el("div");
      body.appendChild(el("div", undefined, item.label));
      if (item.detail) {
        body.appendChild(el("div", "iui-check-detail", item.detail));
      }
      label.appendChild(box);
      label.appendChild(body);
      wrap.appendChild(label);
    }

    return wrap;
  }

  private renderArchitecture(block: Extract<UiBlock, { kind: "architecture" }>): HTMLElement {
    const wrap = el("div");
    const layersEl = el("div", "iui-arch-layers");
    const detailBox = el("div", "iui-arch-detail");
    const nodeButtons: Array<{ id: string; btn: HTMLButtonElement; detail: string }> = [];

    const selectNode = (id: string) => {
      this.selectedNodeId = id;
      for (const item of nodeButtons) {
        item.btn.classList.toggle("selected", item.id === id);
        if (item.id === id) {
          detailBox.textContent = item.detail;
        }
      }
    };

    for (const layer of block.layers) {
      const layerWrap = el("div");
      layerWrap.appendChild(el("div", "iui-arch-layer-title", layer.layer));
      const nodesGrid = el("div", "iui-arch-nodes");
      for (const node of layer.nodes) {
        const btn = el("button", "iui-arch-node");
        btn.type = "button";
        btn.appendChild(el("span", "iui-choice-label", node.label));
        btn.appendChild(
          el("span", "iui-choice-desc", node.badge ? `${node.role} · ${node.badge}` : node.role),
        );
        const detailText = `${node.label}: ${node.detail ?? node.role}`;
        btn.addEventListener("click", () => selectNode(node.id));
        nodeButtons.push({ id: node.id, btn, detail: detailText });
        nodesGrid.appendChild(btn);
      }
      layerWrap.appendChild(nodesGrid);
      layersEl.appendChild(layerWrap);
    }

    wrap.appendChild(layersEl);
    wrap.appendChild(detailBox);
    if (this.selectedNodeId) selectNode(this.selectedNodeId);
    return wrap;
  }
}
