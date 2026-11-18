/**
 * CSP-safe recursive-descent expression evaluator for reactive UI formulas.
 * Supports arithmetic, comparisons, ternary conditionals, string equality, and math helpers
 * without eval or new Function so strict sandboxed iframes never block execution.
 */

export type VarValue = number | string | boolean;
export type VarScope = Record<string, VarValue>;

type Token =
  | { type: "num"; value: number }
  | { type: "str"; value: string }
  | { type: "id"; value: string }
  | { type: "op"; value: string }
  | { type: "paren"; value: "(" | ")" }
  | { type: "comma" }
  | { type: "qmark" }
  | { type: "colon" };

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < input.length) {
    const ch = input[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }

    if (ch === "(" || ch === ")") {
      tokens.push({ type: "paren", value: ch });
      i++;
      continue;
    }
    if (ch === ",") {
      tokens.push({ type: "comma" });
      i++;
      continue;
    }
    if (ch === "?") {
      tokens.push({ type: "qmark" });
      i++;
      continue;
    }
    if (ch === ":") {
      tokens.push({ type: "colon" });
      i++;
      continue;
    }

    const two = input.slice(i, i + 2);
    if (["<=", ">=", "==", "!=", "&&", "||"].includes(two)) {
      tokens.push({ type: "op", value: two });
      i += 2;
      continue;
    }

    if ("+-*/%<>!".includes(ch)) {
      tokens.push({ type: "op", value: ch });
      i++;
      continue;
    }

    if (ch === '"' || ch === "'") {
      const quote = ch;
      i++;
      let str = "";
      while (i < input.length && input[i] !== quote) {
        if (input[i] === "\\" && i + 1 < input.length) {
          i++;
        }
        str += input[i];
        i++;
      }
      if (input[i] !== quote) {
        throw new Error(`Unterminated string literal in formula: ${input}`);
      }
      i++;
      tokens.push({ type: "str", value: str });
      continue;
    }

    if (/[0-9.]/.test(ch)) {
      let raw = "";
      while (i < input.length && /[0-9.]/.test(input[i])) {
        raw += input[i];
        i++;
      }
      const num = Number(raw);
      if (!Number.isFinite(num)) {
        throw new Error(`Invalid number token '${raw}' in formula`);
      }
      tokens.push({ type: "num", value: num });
      continue;
    }

    if (/[a-zA-Z_]/.test(ch)) {
      let id = "";
      while (i < input.length && /[a-zA-Z0-9_]/.test(input[i])) {
        id += input[i];
        i++;
      }
      tokens.push({ type: "id", value: id });
      continue;
    }

    throw new Error(`Unexpected character '${ch}' in formula: ${input}`);
  }

  return tokens;
}

type EvalValue = number | string | boolean;

function toNum(v: EvalValue): number {
  if (typeof v === "number") return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  const parsed = Number(v);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toBool(v: EvalValue): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0 && !Number.isNaN(v);
  return v.length > 0 && v !== "false" && v !== "0";
}

const FUNCTIONS: Record<string, (...args: EvalValue[]) => EvalValue> = {
  min: (...args) => Math.min(...args.map(toNum)),
  max: (...args) => Math.max(...args.map(toNum)),
  abs: (a = 0) => Math.abs(toNum(a)),
  floor: (a = 0) => Math.floor(toNum(a)),
  ceil: (a = 0) => Math.ceil(toNum(a)),
  round: (a = 0, digits = 0) => {
    const d = Math.max(0, Math.min(6, Math.trunc(toNum(digits))));
    const factor = 10 ** d;
    return Math.round(toNum(a) * factor) / factor;
  },
  clamp: (v = 0, lo = 0, hi = 1) => Math.min(toNum(hi), Math.max(toNum(lo), toNum(v))),
  if: (cond = false, a = 0, b = 0) => (toBool(cond) ? a : b),
};

class Parser {
  private pos = 0;

  constructor(
    private readonly tokens: Token[],
    private readonly scope: VarScope,
    private readonly strict = false,
  ) {}

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  private consume(): Token {
    const tok = this.tokens[this.pos];
    if (!tok) throw new Error("Unexpected end of formula");
    this.pos++;
    return tok;
  }

  private matchOp(...ops: string[]): string | null {
    const tok = this.peek();
    if (tok?.type === "op" && ops.includes(tok.value)) {
      this.pos++;
      return tok.value;
    }
    return null;
  }

  private isParen(ch: "(" | ")"): boolean {
    const tok = this.peek();
    return tok?.type === "paren" && tok.value === ch;
  }

  parse(): EvalValue {
    const val = this.parseTernary();
    if (this.pos < this.tokens.length) {
      throw new Error("Unexpected trailing tokens in formula");
    }
    return val;
  }

  private parseTernary(): EvalValue {
    const cond = this.parseOr();
    if (this.peek()?.type === "qmark") {
      this.consume();
      const whenTrue = this.parseTernary();
      if (this.peek()?.type !== "colon") {
        throw new Error("Expected ':' in ternary expression");
      }
      this.consume();
      const whenFalse = this.parseTernary();
      return toBool(cond) ? whenTrue : whenFalse;
    }
    return cond;
  }

  private parseOr(): EvalValue {
    let left = this.parseAnd();
    while (this.matchOp("||")) {
      const right = this.parseAnd();
      left = toBool(left) || toBool(right);
    }
    return left;
  }

  private parseAnd(): EvalValue {
    let left = this.parseEquality();
    while (this.matchOp("&&")) {
      const right = this.parseEquality();
      left = toBool(left) && toBool(right);
    }
    return left;
  }

  private parseEquality(): EvalValue {
    let left = this.parseComparison();
    let op: string | null;
    while ((op = this.matchOp("==", "!="))) {
      const right = this.parseComparison();
      left = op === "==" ? left === right : left !== right;
    }
    return left;
  }

  private parseComparison(): EvalValue {
    let left = this.parseAdditive();
    let op: string | null;
    while ((op = this.matchOp("<", "<=", ">", ">="))) {
      const right = this.parseAdditive();
      const a = toNum(left);
      const b = toNum(right);
      if (op === "<") left = a < b;
      else if (op === "<=") left = a <= b;
      else if (op === ">") left = a > b;
      else left = a >= b;
    }
    return left;
  }

  private parseAdditive(): EvalValue {
    let left = this.parseMultiplicative();
    let op: string | null;
    while ((op = this.matchOp("+", "-"))) {
      const right = this.parseMultiplicative();
      left = op === "+" && (typeof left === "string" || typeof right === "string")
        ? String(left) + String(right)
        : op === "+" ? toNum(left) + toNum(right) : toNum(left) - toNum(right);
    }
    return left;
  }

  private parseMultiplicative(): EvalValue {
    let left = this.parseUnary();
    let op: string | null;
    while ((op = this.matchOp("*", "/", "%"))) {
      const right = this.parseUnary();
      const a = toNum(left);
      const b = toNum(right);
      if (op === "*") left = a * b;
      else if (op === "/") left = this.strict ? a / b : (b === 0 ? 0 : a / b);
      else left = this.strict ? a % b : (b === 0 ? 0 : a % b);
    }
    return left;
  }

  private parseUnary(): EvalValue {
    const op = this.matchOp("-", "+", "!");
    if (op) {
      const operand = this.parseUnary();
      if (op === "-") return -toNum(operand);
      if (op === "+") return toNum(operand);
      return !toBool(operand);
    }
    return this.parsePrimary();
  }

  private parsePrimary(): EvalValue {
    const tok = this.consume();
    if (tok.type === "num" || tok.type === "str") {
      return tok.value;
    }
    if (tok.type === "paren" && tok.value === "(") {
      const inner = this.parseTernary();
      const close = this.consume();
      if (close.type !== "paren" || close.value !== ")") {
        throw new Error("Expected ')'");
      }
      return inner;
    }
    if (tok.type === "id") {
      if (tok.value === "true") return true;
      if (tok.value === "false") return false;

      if (this.isParen("(")) {
        this.consume();
        const args: EvalValue[] = [];
        if (!this.isParen(")")) {
          args.push(this.parseTernary());
          while (this.peek()?.type === "comma") {
            this.consume();
            args.push(this.parseTernary());
          }
        }
        const close = this.consume();
        if (close.type !== "paren" || close.value !== ")") {
          throw new Error(`Expected ')' closing call to ${tok.value}`);
        }
        const fn = FUNCTIONS[tok.value];
        if (!fn) {
          throw new Error(`Unsupported formula function '${tok.value}'`);
        }
        return fn(...args);
      }

      if (tok.value in this.scope) {
        return this.scope[tok.value];
      }
      return 0;
    }

    throw new Error(`Unexpected token in formula: ${JSON.stringify(tok)}`);
  }
}

/**
 * Lists identifiers referenced by a formula, excluding literals and function names,
 * so compilers can reject variables that were never declared.
 */
export function formulaIdentifiers(expr: string): string[] {
  const trimmed = expr.trim();
  if (!trimmed) return [];
  let tokens: Token[];
  try {
    tokens = tokenize(trimmed);
  } catch {
    return [];
  }
  const names = new Set<string>();
  tokens.forEach((token, index) => {
    if (token.type !== "id" || token.value === "true" || token.value === "false") return;
    const next = tokens[index + 1];
    if (next?.type === "paren" && next.value === "(") return;
    names.add(token.value);
  });
  return [...names];
}

/**
 * Evaluates a formula expression safely against the current control variable scope.
 * Returns null if the expression is empty or invalid so partial streams degrade cleanly.
 */
export function evaluateFormula(expr: string, scope: VarScope): EvalValue | null {
  const trimmed = expr.trim();
  if (!trimmed) return null;
  try {
    const tokens = tokenize(trimmed);
    if (tokens.length === 0) return null;
    return new Parser(tokens, scope).parse();
  } catch {
    return null;
  }
}

/**
 * Evaluates one curve sample in strict mode: division by zero yields a non-finite value
 * instead of the forgiving 0, so sampling can break the curve at undefined points.
 */
export function evaluateNumericSample(expr: string, scope: VarScope): number {
  const trimmed = expr.trim();
  if (!trimmed) return Number.NaN;
  try {
    const tokens = tokenize(trimmed);
    if (tokens.length === 0) return Number.NaN;
    const value = new Parser(tokens, scope, true).parse();
    if (typeof value === "number") return value;
    if (typeof value === "boolean") return value ? 1 : 0;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : Number.NaN;
  } catch {
    return Number.NaN;
  }
}

/**
 * Convenience helper evaluating a formula to a finite number with fallback.
 */
export function evaluateNumericFormula(expr: string, scope: VarScope, fallback = 0): number {
  const res = evaluateFormula(expr, scope);
  if (res === null) return fallback;
  const num = toNum(res);
  return Number.isFinite(num) ? num : fallback;
}
