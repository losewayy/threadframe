import type { UiBlock } from "../../schema/uiSpec.js";
import type { VarScope } from "../formula.js";
import type { ThreadFrameSnapshot } from "../summary.js";

export interface RendererHostBridge {
  sendMessage?: (text: string) => Promise<void> | void;
  saveState?: (snapshot: ThreadFrameSnapshot, statePath: string) => Promise<void>;
  onReplayRequested?: () => void;
  onRender?: (report: RenderReport) => void;
}

export type UiActionKind = "send_message" | "copy_state" | "save_state";

export interface UiActionRequest {
  label: string;
  promptTemplate?: string;
  kind?: UiActionKind;
  statePath?: string;
}

export interface RenderReport {
  status: "ready" | "partial" | "error";
  blockCount: number;
  pendingBlockCount: number;
  message?: string;
}

export interface ReactiveBinding {
  update: (scope: VarScope) => void;
}

export type ControlSyncCallback = (scope: VarScope) => void;

export interface UiState {
  readonly scope: VarScope;
  readonly checklistState: Map<string, boolean>;
  readonly selectedChoiceIds: Set<string>;
  readonly tabSelections: Map<string, string>;
  readonly accordionOpen: Map<string, boolean>;
  readonly timelineSelections: Map<string, string>;
  readonly nodeSelections: Map<string, string>;
  readonly hasSubmitAction?: boolean;
  readonly zh?: boolean;
  containerKey(block: UiBlock): string;
  notifyScopeChange(): void;
  setStatus(message: string): void;
  prompt(text: string): boolean;
  copy(text: string): Promise<boolean>;
  dispatchAction(action: UiActionRequest): Promise<void>;
}

export interface BlockRenderContext {
  readonly state: UiState;
  readonly bindings: ReactiveBinding[];
  readonly syncControls: ControlSyncCallback[];
  readonly renderChild: (block: UiBlock) => HTMLElement;
}

export type BlockKind = UiBlock["kind"];
export type BlockByKind = { [K in BlockKind]: Extract<UiBlock, { kind: K }> };
export type BlockRenderer<K extends BlockKind> = (
  block: BlockByKind[K],
  context: BlockRenderContext,
) => HTMLElement;
