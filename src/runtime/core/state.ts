import { walkBlocks, type UiBlock } from "../../schema/uiSpec.js";
import type { VarScope } from "../formula.js";
import { copyText } from "./clipboard.js";
import type {
  BlockRenderContext, ControlSyncCallback, ReactiveBinding, RendererHostBridge, UiState,
} from "./types.js";

export class UiStateStore implements UiState {
  readonly scope: VarScope = {};
  readonly checklistState = new Map<string, boolean>();
  readonly selectedChoiceIds = new Set<string>();
  readonly tabSelections = new Map<string, string>();
  readonly accordionOpen = new Map<string, boolean>();
  private readonly containerKeys = new WeakMap<UiBlock, string>();
  selectedNodeId: string | null = null;
  private reactiveBindings: ReactiveBinding[] = [];
  private controlSyncCallbacks: ControlSyncCallback[] = [];

  constructor(
    private readonly bridge: RendererHostBridge = {},
    private readonly onStatus: (message: string) => void = () => {},
    private readonly clipboard: (text: string) => Promise<boolean> = copyText,
  ) {}

  createContext(renderChild: (block: UiBlock) => HTMLElement): BlockRenderContext {
    return { state: this, bindings: [], syncControls: [], renderChild };
  }

  containerKey(block: UiBlock): string {
    const key = this.containerKeys.get(block);
    if (key === undefined) throw new Error("Container defaults must be initialized before rendering");
    return key;
  }

  activateBindings(contexts: readonly BlockRenderContext[]): void {
    this.reactiveBindings = contexts.flatMap((context) => context.bindings);
    this.controlSyncCallbacks = contexts.flatMap((context) => context.syncControls);
  }

  setStatus(message: string): void {
    this.onStatus(message);
  }

  copy(text: string): Promise<boolean> {
    return this.clipboard(text);
  }

  prompt(text: string): boolean {
    if (!this.bridge.sendMessage) return false;
    void this.bridge.sendMessage(text);
    return true;
  }

  initDefaults(blocks: UiBlock[]): void {
    let containerIndex = 0;
    walkBlocks(blocks, (block) => {
      if (block.kind === "tabs" || block.kind === "accordion") {
        // Ordinals distinguish anonymous containers while append-only streams keep them stable.
        const key = JSON.stringify([block.kind, block.id ?? containerIndex]);
        containerIndex++;
        this.containerKeys.set(block, key);
        if (block.kind === "tabs" && !this.tabSelections.has(key)) {
          const initial = block.tabs.find((tab) => tab.id === block.defaultTab) ?? block.tabs[0];
          this.tabSelections.set(key, initial.id);
        } else if (block.kind === "accordion") {
          for (const item of block.items) {
            const itemKey = JSON.stringify([key, item.id]);
            if (!this.accordionOpen.has(itemKey)) this.accordionOpen.set(itemKey, Boolean(item.defaultOpen));
          }
        }
      }
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
    });
  }

  notifyScopeChange(): void {
    for (const sync of this.controlSyncCallbacks) {
      sync(this.scope);
    }
    for (const binding of this.reactiveBindings) {
      binding.update(this.scope);
    }
  }

  summarize(): string {
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

  async dispatchAction(label: string, template?: string, kind?: "send_message" | "copy_state"): Promise<void> {
    const summary = this.summarize();
    const message = template
      ? template.replace("{{state_summary}}", summary)
      : `${label}: ${summary}`;

    if (kind !== "copy_state" && this.bridge.sendMessage) {
      try {
        await this.bridge.sendMessage(message);
        this.setStatus("Sent to agent chat");
        return;
      } catch {
        this.setStatus("Host rejected ui/message");
        return;
      }
    }

    const copied = await this.copy(message);
    this.setStatus(copied ? "Copied to clipboard" : `Copy unavailable. Select and copy: ${message}`);
  }
}
