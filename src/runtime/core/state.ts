import { walkBlocks, type UiBlock } from "../../schema/uiSpec.js";
import type { VarScope } from "../formula.js";
import { buildIntentSummary, buildSnapshot, type ControlMeta, type ThreadFrameSnapshot } from "../summary.js";
import { copyText } from "./clipboard.js";
import type {
  BlockRenderContext, ControlSyncCallback, ReactiveBinding, RendererHostBridge, UiActionRequest, UiState,
} from "./types.js";

export class UiStateStore implements UiState {
  readonly scope: VarScope = {};
  readonly checklistState = new Map<string, boolean>();
  readonly selectedChoiceIds = new Set<string>();
  readonly tabSelections = new Map<string, string>();
  readonly accordionOpen = new Map<string, boolean>();
  readonly timelineSelections = new Map<string, string>();
  readonly nodeSelections = new Map<string, string>();
  readonly controlMeta = new Map<string, ControlMeta>();
  readonly choiceLabels = new Map<string, string>();
  readonly checklistLabels = new Map<string, string>();
  specTitle = "";
  private readonly containerKeys = new WeakMap<UiBlock, string>();
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
      if (block.kind === "tabs" || block.kind === "accordion" || block.kind === "timeline"
        || block.kind === "architecture" || block.kind === "graph") {
        // Ordinals distinguish anonymous containers while append-only streams keep them stable.
        const key = JSON.stringify([block.kind, block.id ?? containerIndex]);
        containerIndex++;
        this.containerKeys.set(block, key);
        if (block.kind === "timeline" && !this.timelineSelections.has(key)) {
          const initial = block.steps.find((step) => step.status === "active" && step.detail)
            ?? block.steps.find((step) => step.detail);
          if (initial) this.timelineSelections.set(key, initial.id);
        }
        if (block.kind === "tabs" && !this.tabSelections.has(key)) {
          const initial = block.tabs.find((tab) => tab.id === block.defaultTab) ?? block.tabs[0];
          this.tabSelections.set(key, initial.id);
        } else if (block.kind === "accordion") {
          for (const item of block.items) {
            const itemKey = JSON.stringify([key, item.id]);
            if (!this.accordionOpen.has(itemKey)) this.accordionOpen.set(itemKey, Boolean(item.defaultOpen));
          }
        } else if ((block.kind === "architecture" || block.kind === "graph") && !this.nodeSelections.has(key)) {
          const initial = block.kind === "architecture" ? block.layers[0]?.nodes[0] : block.nodes[0];
          if (initial) this.nodeSelections.set(key, initial.id);
        }
      }
      if (block.kind === "controls") {
        for (const ctrl of block.controls) {
          if (!(ctrl.id in this.scope)) {
            this.scope[ctrl.id] = ctrl.defaultValue;
          }
          if (!this.controlMeta.has(ctrl.id)) {
            this.controlMeta.set(ctrl.id, {
              label: ctrl.label,
              defaultValue: ctrl.defaultValue,
              ...(ctrl.kind === "slider" && ctrl.unit ? { unit: ctrl.unit } : {}),
            });
          }
        }
      } else if (block.kind === "checklist") {
        for (const item of block.items) {
          if (!this.checklistState.has(item.id)) {
            this.checklistState.set(item.id, Boolean(item.checked));
          }
          if (!this.checklistLabels.has(item.id)) this.checklistLabels.set(item.id, item.label);
        }
      } else if (block.kind === "choices") {
        for (const option of block.options) {
          if (!this.choiceLabels.has(option.id)) this.choiceLabels.set(option.id, option.label);
        }
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
    return buildIntentSummary({
      scope: this.scope,
      controlMeta: this.controlMeta,
      selectedChoices: this.selectedChoiceIds,
      choiceLabels: this.choiceLabels,
      checklistState: this.checklistState,
      checklistLabels: this.checklistLabels,
    });
  }

  snapshot(): ThreadFrameSnapshot {
    return buildSnapshot({
      title: this.specTitle,
      scope: this.scope,
      controlMeta: this.controlMeta,
      selectedChoices: this.selectedChoiceIds,
      choiceLabels: this.choiceLabels,
      checklistState: this.checklistState,
      checklistLabels: this.checklistLabels,
    });
  }

  async dispatchAction(action: UiActionRequest): Promise<void> {
    const summary = this.summarize();
    const message = action.promptTemplate
      ? action.promptTemplate.replace("{{state_summary}}", summary)
      : `${action.label}: ${summary}`;

    if (action.kind === "save_state" && action.statePath && this.bridge.saveState) {
      try {
        await this.bridge.saveState(this.snapshot(), action.statePath);
        this.setStatus("Saved snapshot for the next turn");
        return;
      } catch (error) {
        this.setStatus(`Snapshot failed: ${(error as Error).message}`);
      }
    }

    if (action.kind !== "copy_state" && this.bridge.sendMessage) {
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
