import { parsePartialUiSpec, type PartialUiSpecResult, type UiBlock, type UiSpec } from "../schema/uiSpec.js";
import { el, icon } from "./core/dom.js";
import { UiStateStore } from "./core/state.js";
import type { BlockRenderContext, RendererHostBridge } from "./core/types.js";
import { renderBlock } from "./blocks/registry.js";
export type { RendererHostBridge } from "./core/types.js";

interface BlockView {
  signature: string;
  node: HTMLElement;
  context: BlockRenderContext;
}

export class ThreadFrameRenderer {
  private readonly state: UiStateStore;
  private shell: HTMLElement | null = null;
  private headerEl: HTMLElement | null = null;
  private headerSignature = "";
  private footerEl: HTMLElement | null = null;
  private footerSignature = "";
  private skeletonEl: HTMLElement | null = null;
  private blockViews: BlockView[] = [];
  private statusEl: HTMLElement | null = null;

  constructor(private readonly root: HTMLElement, private readonly bridge: RendererHostBridge = {}) {
    this.state = new UiStateStore(bridge, (message) => {
      if (this.statusEl) this.statusEl.textContent = message;
    });
  }

  renderPartial(raw: unknown, streaming: boolean): void {
    try {
      this.renderParsed(parsePartialUiSpec(raw), streaming);
    } catch (error) {
      this.bridge.onRender?.({ status: "error", blockCount: this.blockViews.length, pendingBlockCount: 0, message: (error as Error).message });
      throw error;
    }
  }

  renderFull(spec: UiSpec): void {
    this.renderPartial(spec, false);
  }

  private renderParsed(parsed: PartialUiSpecResult, streaming: boolean): void {
    this.state.initDefaults(parsed.blocks);
    if (!this.shell) {
      this.shell = el("div", "iui-shell");
      this.root.replaceChildren(this.shell);
    }
    const shell = this.shell;
    this.updateHeader(shell, parsed, streaming);
    const nextViews: BlockView[] = [];
    parsed.blocks.forEach((block, index) => {
      const signature = JSON.stringify(block);
      let view = this.blockViews[index];
      if (!view || view.signature !== signature) {
        const previousNode = view?.node;
        try { view = this.createBlockView(block, signature); }
        catch (error) { throw new Error(`blocks.${index} (${block.kind}): ${(error as Error).message}`); }
        previousNode?.remove();
      }
      const position = shell.children[index + 1] ?? null;
      if (position !== view.node) shell.insertBefore(view.node, position);
      nextViews.push(view);
    });
    for (const view of this.blockViews.slice(parsed.blocks.length)) view.node.remove();
    this.blockViews = nextViews;
    this.state.activateBindings(nextViews.map((view) => view.context));
    this.updateSkeleton(shell, streaming || parsed.pendingBlockCount > 0);
    this.updateFooter(shell, parsed, streaming);
    this.state.notifyScopeChange();
    this.bridge.onRender?.({ status: streaming || parsed.pendingBlockCount > 0 ? "partial" : "ready",
      blockCount: nextViews.length, pendingBlockCount: parsed.pendingBlockCount });
  }

  private createBlockView(block: UiBlock, signature: string): BlockView {
    const context = this.state.createContext((child) => this.renderNestedBlock(child, context));
    const node = this.renderNestedBlock(block, context, "iui-block");
    return { signature, node, context };
  }

  private renderNestedBlock(block: UiBlock, context: BlockRenderContext, className = "iui-subblock"): HTMLElement {
    const node = el("section", className);
    node.dataset.kind = block.kind;
    if (block.title) node.appendChild(el("h3", "iui-block-title", block.title));
    node.appendChild(renderBlock(block.kind, block, context));
    return node;
  }

  private updateHeader(shell: HTMLElement, parsed: PartialUiSpecResult, streaming: boolean): void {
    const signature = JSON.stringify([parsed.title, parsed.subtitle, parsed.badge, streaming]);
    if (signature === this.headerSignature) return;
    this.headerSignature = signature;
    const header = el("div", "iui-header");
    const titleWrap = el("div");
    titleWrap.appendChild(el("h2", "iui-title", parsed.title));
    if (parsed.subtitle) titleWrap.appendChild(el("p", "iui-subtitle", parsed.subtitle));
    header.appendChild(titleWrap);
    const meta = el("div", "iui-header-meta");
    const badge = el("span", "iui-badge");
    badge.setAttribute("role", "status");
    badge.appendChild(el("span", streaming ? "iui-dot streaming" : "iui-dot"));
    badge.appendChild(document.createTextNode(streaming ? "Streaming UI..." : parsed.badge ?? "Interactive"));
    meta.appendChild(badge);
    if (this.bridge.onReplayRequested && !streaming) {
      const replay = el("button", "iui-action-btn secondary", "Replay Build");
      replay.prepend(icon("replay"));
      replay.type = "button";
      replay.addEventListener("click", () => this.bridge.onReplayRequested?.());
      meta.appendChild(replay);
    }
    header.appendChild(meta);
    if (this.headerEl) this.headerEl.replaceWith(header);
    else shell.prepend(header);
    this.headerEl = header;
  }

  private updateSkeleton(shell: HTMLElement, visible: boolean): void {
    if (visible && !this.skeletonEl) {
      const skeleton = el("div", "iui-skeleton");
      skeleton.setAttribute("role", "status");
      skeleton.append(el("span", "iui-skeleton-line"), el("span", "iui-skeleton-line short"),
        el("span", "iui-skeleton-caption", "Assembling next component…"));
      shell.insertBefore(skeleton, this.footerEl);
      this.skeletonEl = skeleton;
    } else if (!visible) {
      this.skeletonEl?.remove();
      this.skeletonEl = null;
    }
  }

  private updateFooter(shell: HTMLElement, parsed: PartialUiSpecResult, streaming: boolean): void {
    const signature = JSON.stringify([parsed.actions, streaming]);
    if (signature === this.footerSignature) return;
    this.footerSignature = signature;
    this.footerEl?.remove();
    this.footerEl = null;
    this.statusEl = null;
    if (parsed.actions.length === 0 && streaming) return;
    const footer = el("div", "iui-footer");
    const buttons = el("div");
    buttons.style.display = "flex";
    buttons.style.gap = "6px";
    buttons.style.flexWrap = "wrap";
    for (const action of parsed.actions) {
      const button = el("button", "iui-action-btn", action.label);
      button.type = "button";
      button.addEventListener("click", () => this.state.dispatchAction(action.label, action.promptTemplate, action.kind));
      buttons.appendChild(button);
    }
    footer.appendChild(buttons);
    this.statusEl = el("span", "iui-status", "");
    this.statusEl.setAttribute("role", "status");
    footer.appendChild(this.statusEl);
    shell.appendChild(footer);
    this.footerEl = footer;
  }
}
