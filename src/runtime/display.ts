import type { StatItem } from "../schema/content.js";
import { evaluateFormula, type VarScope } from "./formula.js";

const cjkPattern = /[\u3400-\u9fff]/;

export function hasCjkText(...parts: Array<string | undefined>): boolean {
  return parts.some((part) => typeof part === "string" && cjkPattern.test(part));
}

export function uiCopy(zh: boolean) {
  return zh
    ? {
        aboveBudget: "超出预算",
        aboveThreshold: "超过阈值",
        changePrefix: "变化: ",
        selectedPrefix: "已选中: ",
        promptedPrefix: "已发送: ",
        profilePrefix: "预设: ",
        sentStatus: "已发送到对话",
        hostRejected: "宿主拒绝了发送消息",
        savedStatus: "已保存状态快照",
        copiedStatus: "已复制到剪贴板",
        copyFallback: "无法自动复制，请手动复制: ",
      }
    : {
        aboveBudget: "Above budget",
        aboveThreshold: "Above threshold",
        changePrefix: "Change: ",
        selectedPrefix: "Selected: ",
        promptedPrefix: "Prompted: ",
        profilePrefix: "Profile: ",
        sentStatus: "Sent to agent chat",
        hostRejected: "Host rejected ui/message",
        savedStatus: "Saved snapshot for the next turn",
        copiedStatus: "Copied to clipboard",
        copyFallback: "Copy unavailable. Select and copy: ",
      };
}

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
