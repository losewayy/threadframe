import type { VarValue, VarScope } from "./formula.js";

export interface ControlMeta {
  label: string;
  defaultValue: VarValue;
  unit?: string;
}

export interface SummaryInput {
  scope: VarScope;
  controlMeta: ReadonlyMap<string, ControlMeta>;
  selectedChoices: ReadonlySet<string>;
  choiceLabels: ReadonlyMap<string, string>;
  choicePrompts?: ReadonlyMap<string, string>;
  checklistState: ReadonlyMap<string, boolean>;
  checklistLabels: ReadonlyMap<string, string>;
}

export interface SnapshotVariable {
  id: string;
  label: string;
  value: VarValue;
  changed: boolean;
}

export interface ThreadFrameSnapshot {
  title: string;
  savedAt: string;
  variables: SnapshotVariable[];
  choices: string[];
  checklist: {
    done: number;
    total: number;
    items: Array<{ label: string; checked: boolean }>;
  };
}

/**
 * Builds a human-readable intent summary: changed values are called out separately
 * from untouched defaults, and selections use labels instead of internal ids.
 */
export function buildIntentSummary(input: SummaryInput): string {
  const changed: string[] = [];
  const defaults: string[] = [];
  for (const [id, value] of Object.entries(input.scope)) {
    const meta = input.controlMeta.get(id);
    const text = `${meta?.label ?? id}: ${String(value)}${meta?.unit ? ` ${meta.unit}` : ""}`;
    if (meta && value === meta.defaultValue) defaults.push(text);
    else changed.push(text);
  }
  const parts: string[] = [];
  if (changed.length) parts.push(`Changed: ${changed.join(", ")}`);
  if (defaults.length) parts.push(`Defaults: ${defaults.join(", ")}`);
  const choices = [...input.selectedChoices].map((id) => {
    const label = input.choiceLabels.get(id) ?? id;
    const prompt = input.choicePrompts?.get(id);
    return prompt && prompt !== label ? `${label} (${prompt})` : label;
  });
  if (choices.length) parts.push(`Selected: ${choices.join(", ")}`);
  if (input.checklistState.size) {
    let done = 0;
    for (const checked of input.checklistState.values()) if (checked) done++;
    parts.push(`Checklist: ${done}/${input.checklistState.size} done`);
  }
  return parts.join("; ") || "No changes";
}

export function buildSnapshot(input: SummaryInput & { title: string; savedAt?: string }): ThreadFrameSnapshot {
  let done = 0;
  const items: Array<{ label: string; checked: boolean }> = [];
  for (const [id, checked] of input.checklistState) {
    if (checked) done++;
    items.push({ label: input.checklistLabels.get(id) ?? id, checked });
  }
  return {
    title: input.title,
    savedAt: input.savedAt ?? new Date().toISOString(),
    variables: Object.entries(input.scope).map(([id, value]) => {
      const meta = input.controlMeta.get(id);
      return { id, label: meta?.label ?? id, value, changed: !meta || value !== meta.defaultValue };
    }),
    choices: [...input.selectedChoices].map((id) => input.choiceLabels.get(id) ?? id),
    checklist: { done, total: input.checklistState.size, items },
  };
}
