import { formatNumber } from "../runtime/display.js";
import { evaluateFormula, type VarScope } from "../runtime/formula.js";

export type InlinePart =
  | { kind: "text" | "code"; text: string; strong?: boolean }
  | { kind: "formula"; formula: string; offset: number; strong?: boolean };

function backtickRunEnd(source: string, start: number): number {
  let end = start;
  while (source[end] === "`") end++;
  return end;
}

export function readInlineCode(source: string, start: number): number | undefined {
  if (source[start] !== "`") return undefined;
  const openEnd = backtickRunEnd(source, start);
  const length = openEnd - start;
  let close = source.indexOf("`", openEnd);
  while (close !== -1) {
    const end = backtickRunEnd(source, close);
    if (end - close === length) return end;
    close = source.indexOf("`", end);
  }
  return undefined;
}

export function readBracedExpression(source: string, start: number): { expression: string; end: number } | undefined {
  if (source[start] !== "{") return undefined;
  let depth = 1;
  let quote = "";
  for (let i = start + 1; i < source.length; i++) {
    const char = source[i];
    if (quote) {
      if (char === "\\") i++;
      else if (char === quote) quote = "";
    } else if (char === "'" || char === '"') {
      quote = char;
    } else if (char === "{") {
      depth++;
    } else if (char === "}" && --depth === 0) {
      return { expression: source.slice(start + 1, i), end: i + 1 };
    }
  }
  return undefined;
}

const entities: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'",
};

export function decodeInlineEntities(source: string): string {
  return source.replace(/&(amp|lt|gt|quot|apos|#\d+|#x[\da-f]+);/gi, (raw, key: string) => {
    key = key.toLowerCase();
    if (key[0] !== "#") return entities[key];
    const value = key[1] === "x" ? Number.parseInt(key.slice(2), 16) : Number(key.slice(1));
    if (value <= 0 || value > 0x10ffff || (value >= 0xd800 && value <= 0xdfff)) return raw;
    return String.fromCodePoint(value);
  });
}

const escapable = /[\\`*{}]/;

/** Parses inline emphasis, code spans and safe formula placeholders. All other text stays literal. */
export function parseInlineText(source: string): InlinePart[] {
  const tokens: Array<InlinePart | null> = [];
  let markerCount = 0;
  let literalStart = 0;
  const flush = (end: number) => {
    if (end > literalStart) {
      const text = source.slice(literalStart, end).replace(/\\([\\`*{}])/g, "$1");
      tokens.push({ kind: "text", text: decodeInlineEntities(text) });
    }
  };

  for (let i = 0; i < source.length;) {
    if (source[i] === "\\" && escapable.test(source[i + 1] ?? "")) {
      i += 2;
    } else if (source.startsWith("**", i)) {
      flush(i);
      tokens.push(null);
      markerCount++;
      i += 2;
      literalStart = i;
    } else if (source[i] === "`") {
      const end = readInlineCode(source, i);
      const openingEnd = backtickRunEnd(source, i);
      if (end === undefined) {
        i = openingEnd;
        continue;
      }
      flush(i);
      const body = source.slice(openingEnd, end - (openingEnd - i)).replace(/\r?\n/g, " ");
      const text = body.startsWith(" ") && body.endsWith(" ") && body.trim() ? body.slice(1, -1) : body;
      tokens.push({ kind: "code", text: decodeInlineEntities(text) });
      i = end;
      literalStart = i;
    } else if (source[i] === "{") {
      const result = readBracedExpression(source, i);
      if (!result) break;
      flush(i);
      tokens.push({ kind: "formula", formula: result.expression, offset: i });
      i = result.end;
      literalStart = i;
    } else {
      i++;
    }
  }
  flush(source.length);

  const unpaired = markerCount % 2 === 1 ? tokens.lastIndexOf(null) : -1;
  const parts: InlinePart[] = [];
  let strong = false;
  for (const [index, part] of tokens.entries()) {
    if (part) parts.push(strong ? { ...part, strong: true } : part);
    else if (index === unpaired) parts.push({ kind: "text", text: "**" });
    else strong = !strong;
  }
  return parts;
}

export function inlineFormulaValue(formula: string, scope: VarScope): string {
  const value = evaluateFormula(formula, scope);
  if (value === null) return "…";
  if (typeof value === "number") return Number.isFinite(value) ? formatNumber(value) : "…";
  return String(value);
}

/** Keeps dynamic data literal while allowing the renderer to supply Markdown structure. */
export function escapeMarkdownText(source: string): string {
  return source.replace(/&(?=(?:#\d+|#x[\da-f]+|[a-z][\da-z]*);)/gi, "&amp;")
    .replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replace(/[\\`*_[\]|#~]/g, "\\$&")
    .replace(/^([ \t]*)([-+=]|\d{1,9}[.)])(?=\s|$)/gm, (_, indent: string, marker: string) =>
      indent + marker.replace(/.$/, "\\$&"));
}

export function markdownCodeSpan(source: string): string {
  const text = source.replace(/\r?\n/g, " ");
  let longest = 0;
  for (const [run] of text.matchAll(/`+/g)) longest = Math.max(longest, run.length);
  const fence = "`".repeat(longest + 1);
  const pad = text.startsWith("`") || text.endsWith("`")
    || (text.startsWith(" ") && text.endsWith(" ") && text.trim()) ? " " : "";
  return fence + pad + text + pad + fence;
}

export function inlineTextMarkdown(source: string, scope: VarScope): string {
  let result = "";
  let emphasis = "";
  for (const part of parseInlineText(source)) {
    const value = part.kind === "formula" ? inlineFormulaValue(part.formula, scope) : part.text;
    const text = part.kind === "code" ? markdownCodeSpan(value) : escapeMarkdownText(value);
    if (part.strong) {
      emphasis += text;
    } else {
      if (emphasis) result += `**${emphasis}**`;
      emphasis = "";
      result += text;
    }
  }
  return emphasis ? `${result}**${emphasis}**` : result;
}
