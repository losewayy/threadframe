import { declaredSelectVars, walkBlocks, type DerivedVar, type UiBlock } from "../../schema/uiSpec.js";
import { evaluateFormula, type VarScope } from "../formula.js";
import { hasCjkText, uiCopy } from "../display.js";
import { buildIntentSummary, buildSnapshot, type ControlMeta, type ThreadFrameSnapshot } from "../summary.js";
import { copyText } from "./clipboard.js";
import type {
  BlockRenderContext, ControlSyncCallback, ReactiveBinding, RendererHostBridge, UiActionRequest, UiState,
} from "./types.js";

export class UiStateStore implements UiState {
  readonly scope: VarScope = Object.create(null);
  readonly checklistState = new Map<string, boolean>();
  readonly selectedChoiceIds = new Set<string>();
  readonly tabSelections = new Map<string, string>();
  readonly accordionOpen = new Map<string, boolean>();
  readonly timelineSelections = new Map<string, string>();
  readonly nodeSelections = new Map<string, string>();
  readonly controlMeta = new Map<string, ControlMeta>();
  readonly choiceLabels = new Map<string, string>();
  readonly choicePrompts = new Map<string, string>();
  readonly checklistLabels = new Map<string, string>();
  readonly derivedVarIds = new Set<string>();
  specTitle = "";
  hasSubmitAction = false;
  zh = false;
  private readonly containerKeys = new WeakMap<UiBlock, string>();
  private readonly sliderBounds = new Map<string, { min: number; max: number; step: number }>();
  private readonly stepOptions = new Map<string, string[]>();
  private derivedVars: DerivedVar[] = [];
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

  setHeader(title: string, subtitle?: string): void {
    this.specTitle = title;
    this.zh = hasCjkText(title, subtitle);
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
          const initial = block.steps.find((step) => step.status === "active" && (step.detail || block.selectVar))
            ?? block.steps.find((step) => step.detail)
            ?? (block.selectVar ? block.steps[0] : undefined);
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
          if (ctrl.kind === "slider") {
            this.sliderBounds.set(ctrl.id, { min: ctrl.min, max: ctrl.max, step: ctrl.step ?? 1 });
          } else if (ctrl.kind === "select") {
            this.stepOptions.set(ctrl.id, ctrl.options);
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
          if (option.prompt && !this.choicePrompts.has(option.id)) this.choicePrompts.set(option.id, option.prompt);
        }
      }
    });
    for (const [id, selected] of declaredSelectVars(blocks)) {
      this.stepOptions.set(id, selected.values);
      if (!(id in this.scope)) this.scope[id] = selected.initial;
      if (!this.controlMeta.has(id)) {
        this.controlMeta.set(id, { label: selected.label, defaultValue: selected.initial });
      }
    }
  }

  setDerivedVars(vars: readonly DerivedVar[] | undefined): void {
    for (const id of this.derivedVarIds) delete this.scope[id];
    this.derivedVarIds.clear();
    this.derivedVars = [...(vars ?? [])];
    for (const item of this.derivedVars) this.derivedVarIds.add(item.id);
    this.evaluateDerivedVars();
  }

  private evaluateDerivedVars(): void {
    for (const item of this.derivedVars) {
      const value = evaluateFormula(item.formula, this.scope);
      if (value === null || (typeof value === "number" && !Number.isFinite(value))) {
        delete this.scope[item.id];
      } else {
        this.scope[item.id] = value;
      }
    }
  }

  notifyScopeChange(): void {
    this.evaluateDerivedVars();
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
      derivedIds: this.derivedVarIds,
      selectedChoices: this.selectedChoiceIds,
      choiceLabels: this.choiceLabels,
      choicePrompts: this.choicePrompts,
      checklistState: this.checklistState,
      checklistLabels: this.checklistLabels,
    });
  }

  snapshot(): ThreadFrameSnapshot {
    return buildSnapshot({
      title: this.specTitle,
      scope: this.scope,
      controlMeta: this.controlMeta,
      derivedIds: this.derivedVarIds,
      selectedChoices: this.selectedChoiceIds,
      choiceLabels: this.choiceLabels,
      checklistState: this.checklistState,
      checklistLabels: this.checklistLabels,
    });
  }

  private stepVariable(action: UiActionRequest): void {
    const id = action.var;
    if (!id || this.derivedVarIds.has(id)) return;
    const current = this.scope[id];
    if (typeof current === "number") {
      const bounds = this.sliderBounds.get(id);
      const delta = action.delta ?? bounds?.step ?? 1;
      const lo = action.min ?? bounds?.min;
      const hi = action.max ?? bounds?.max;
      let next = Number((current + delta).toFixed(6));
      if (lo !== undefined && hi !== undefined) {
        if (action.wrap) {
          if (next > hi) next = lo;
          else if (next < lo) next = hi;
        } else {
          next = Math.min(hi, Math.max(lo, next));
        }
      }
      this.scope[id] = next;
      this.notifyScopeChange();
      return;
    }
    if (typeof current === "string") {
      const options = this.stepOptions.get(id);
      if (!options?.length) return;
      const idx = Math.max(0, options.indexOf(current));
      const delta = Math.trunc(action.delta ?? 1);
      const raw = idx + delta;
      const next = action.wrap
        ? ((raw % options.length) + options.length) % options.length
        : Math.max(0, Math.min(options.length - 1, raw));
      this.scope[id] = options[next];
      this.notifyScopeChange();
      return;
    }
    if (typeof current === "boolean") {
      this.scope[id] = !current;
      this.notifyScopeChange();
    }
  }

  async dispatchAction(action: UiActionRequest): Promise<void> {
    if (action.kind === "set_var") {
      if (action.var && action.value !== undefined && !this.derivedVarIds.has(action.var)) {
        this.scope[action.var] = action.value;
        this.notifyScopeChange();
      }
      return;
    }
    if (action.kind === "step_var") {
      this.stepVariable(action);
      return;
    }
    const summary = this.summarize();
    const message = action.promptTemplate
      ? action.promptTemplate.replace("{{state_summary}}", summary)
      : `${action.label}: ${summary}`;

    const copy = uiCopy(this.zh);
    if (action.kind === "save_state" && action.statePath && this.bridge.saveState) {
      try {
        await this.bridge.saveState(this.snapshot(), action.statePath);
        this.setStatus(copy.savedStatus);
        return;
      } catch (error) {
        this.setStatus(`Snapshot failed: ${(error as Error).message}`);
      }
    }

    if (action.kind !== "copy_state" && this.bridge.sendMessage) {
      try {
        await this.bridge.sendMessage(message);
        this.setStatus(copy.sentStatus);
        return;
      } catch {
        this.setStatus(copy.hostRejected);
        return;
      }
    }

    const copied = await this.copy(message);
    this.setStatus(copied ? copy.copiedStatus : `${copy.copyFallback}${message}`);
  }
}
