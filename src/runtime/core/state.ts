import type { UiBlock } from "../../schema/uiSpec.js";
import type { VarScope } from "../formula.js";
import type {
  BlockRenderContext, ControlSyncCallback, ReactiveBinding, RendererHostBridge, UiState,
} from "./types.js";

export class UiStateStore implements UiState {
  readonly scope: VarScope = {};
  readonly checklistState = new Map<string, boolean>();
  readonly selectedChoiceIds = new Set<string>();
  selectedNodeId: string | null = null;
  private reactiveBindings: ReactiveBinding[] = [];
  private controlSyncCallbacks: ControlSyncCallback[] = [];

  constructor(
    private readonly bridge: RendererHostBridge = {},
    private readonly onStatus: (message: string) => void = () => {},
  ) {}

  createContext(): BlockRenderContext {
    return { state: this, bindings: [], syncControls: [] };
  }

  activateBindings(contexts: readonly BlockRenderContext[]): void {
    this.reactiveBindings = contexts.flatMap((context) => context.bindings);
    this.controlSyncCallbacks = contexts.flatMap((context) => context.syncControls);
  }

  setStatus(message: string): void {
    this.onStatus(message);
  }

  prompt(text: string): boolean {
    if (!this.bridge.sendMessage) return false;
    void this.bridge.sendMessage(text);
    return true;
  }

  initDefaults(blocks: UiBlock[]): void {
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

  async dispatchAction(label: string, template?: string): Promise<void> {
    const summary = this.summarize();
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
}
