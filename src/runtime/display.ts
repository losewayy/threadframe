import type { StatItem } from "../schema/content.js";
import { evaluateFormula, type VarScope } from "./formula.js";

export function formatNumber(value: number, precision?: number): string {
  return precision === undefined ? String(Math.round(value * 100) / 100) : value.toFixed(precision);
}

export function interpolateCode(source: string, scope: VarScope): string {
  return source.replace(/{{\s*([a-zA-Z_]\w*)\s*}}/g, (_, key: string) =>
    Object.hasOwn(scope, key) ? String(scope[key]) : `{{${key}}}`);
}

export function statDisplay(item: StatItem, scope: VarScope): { value: string; delta?: string; warning: boolean } {
  const result = item.formula ? evaluateFormula(item.formula, scope) : null;
  const value = result !== null && (typeof result !== "number" || Number.isFinite(result)) ? result : item.value ?? 0;
  const deltaResult = item.deltaFormula ? evaluateFormula(item.deltaFormula, scope) : null;
  const delta = deltaResult !== null && (typeof deltaResult !== "number" || Number.isFinite(deltaResult))
    ? deltaResult : item.delta;
  return {
    value: typeof value === "number" ? formatNumber(value, item.precision) : String(value),
    delta: delta === undefined ? undefined : typeof delta === "number"
      ? `${delta > 0 ? "+" : ""}${formatNumber(delta, item.precision)}` : String(delta),
    warning: item.warnAbove !== undefined && Number(value) > item.warnAbove,
  };
}
