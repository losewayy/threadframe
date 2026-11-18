import { readBracedExpression, readInlineCode } from "./inlineText.js";

export interface MarkupAttribute {
  kind: "quoted" | "expression" | "flag";
  value: string;
  offset: number;
}

export interface MarkupElement {
  kind: "element";
  name: string;
  attrs: Map<string, MarkupAttribute>;
  children: MarkupNode[];
  offset: number;
  closed: boolean;
}

export interface MarkupText {
  kind: "text";
  value: string;
  offset: number;
}

export type MarkupNode = MarkupElement | MarkupText;

export class MarkupSyntaxError extends Error {
  constructor(message: string, readonly offset: number, readonly atEnd = false) {
    super(message);
    this.name = "MarkupSyntaxError";
  }
}

const MAX_DEPTH = 12;
const TAG_NAME = /^[a-z][a-z0-9-]*/;
const ATTRIBUTE_NAME = /^[a-zA-Z_][a-zA-Z0-9_-]*/;

class MarkupParser {
  private offset = 0;
  private readonly nodes: MarkupNode[] = [];
  private readonly stack: MarkupElement[] = [];

  constructor(private readonly source: string) {}

  private get atEnd(): boolean {
    return this.offset >= this.source.length;
  }

  private skipWhitespace(): boolean {
    const start = this.offset;
    while (!this.atEnd && /\s/.test(this.source[this.offset])) this.offset++;
    return this.offset > start;
  }

  private append(node: MarkupNode): void {
    (this.stack.at(-1)?.children ?? this.nodes).push(node);
  }

  private readName(pattern: RegExp): string | undefined {
    const name = pattern.exec(this.source.slice(this.offset))?.[0];
    if (name) this.offset += name.length;
    return name;
  }

  private readAttributeValue(name: string, offset: number): MarkupAttribute {
    const char = this.source[this.offset];
    if (char === '"' || char === "'") {
      const end = this.source.indexOf(char, this.offset + 1);
      if (end < 0) throw new MarkupSyntaxError(`Close the quoted value for "${name}".`, offset, true);
      const value = this.source.slice(this.offset + 1, end);
      this.offset = end + 1;
      return { kind: "quoted", value, offset };
    }
    if (char === "{") {
      const expression = readBracedExpression(this.source, this.offset);
      if (!expression) throw new MarkupSyntaxError(`Close the expression for "${name}" with '}'.`, offset, true);
      this.offset = expression.end;
      return { kind: "expression", value: expression.expression, offset };
    }
    throw new MarkupSyntaxError(`Give "${name}" a quoted value or a braced expression.`, offset, this.atEnd);
  }

  private readOpeningTag(name: string, offset: number): void {
    if (this.stack.length >= MAX_DEPTH) {
      throw new MarkupSyntaxError(`Tags can nest up to ${MAX_DEPTH} levels. Move <${name}> up a level.`, offset);
    }
    const attrs = new Map<string, MarkupAttribute>();
    let spaced = this.skipWhitespace();
    while (!this.atEnd && this.source[this.offset] !== ">" && this.source[this.offset] !== "/") {
      const fieldOffset = this.offset;
      if (!spaced) throw new MarkupSyntaxError(`Separate the attributes of <${name}> with spaces.`, fieldOffset);
      const field = this.readName(ATTRIBUTE_NAME);
      if (!field) throw new MarkupSyntaxError(`Write an attribute name on <${name}>, such as label="Example".`, fieldOffset);
      if (attrs.has(field)) {
        throw new MarkupSyntaxError(`Remove the duplicate "${field}" attribute from <${name}>.`, fieldOffset, this.atEnd);
      }
      spaced = this.skipWhitespace();
      if (this.source[this.offset] === "=") {
        this.offset++;
        this.skipWhitespace();
        attrs.set(field, this.readAttributeValue(field, fieldOffset));
        spaced = this.skipWhitespace();
      } else {
        attrs.set(field, { kind: "flag", value: "true", offset: fieldOffset });
      }
    }

    const closed = this.source[this.offset] === "/";
    if (closed) this.offset++;
    if (this.source[this.offset] !== ">") {
      throw new MarkupSyntaxError(`Finish <${name}> with '>' or '/>'.`, this.offset, this.atEnd);
    }
    this.offset++;
    const element: MarkupElement = { kind: "element", name, attrs, children: [], offset, closed };
    this.append(element);
    if (!closed) this.stack.push(element);
  }

  private readTag(): void {
    const offset = this.offset++;
    const closing = this.source[this.offset] === "/";
    if (closing) this.offset++;
    const name = this.readName(TAG_NAME);
    if (!name) {
      throw new MarkupSyntaxError("Use a lowercase tag name. For a literal '<', write &lt;.", offset, this.atEnd);
    }
    if (!closing) {
      this.readOpeningTag(name, offset);
      return;
    }

    this.skipWhitespace();
    if (this.source[this.offset] !== ">") {
      throw new MarkupSyntaxError(`Finish the closing tag as </${name}>.`, this.offset, this.atEnd);
    }
    const element = this.stack.at(-1);
    if (element?.name !== name) {
      const fix = element ? `Close <${element.name}> with </${element.name}> first.` : `Remove </${name}> or add its opening tag.`;
      throw new MarkupSyntaxError(`Unexpected </${name}>. ${fix}`, offset);
    }
    this.offset++;
    element.closed = true;
    this.stack.pop();
  }

  private readText(partial: boolean): void {
    const offset = this.offset;
    while (!this.atEnd && this.source[this.offset] !== "<") {
      const char = this.source[this.offset];
      if (char === "\\" && /[\\`{]/.test(this.source[this.offset + 1] ?? "")) {
        this.offset += 2;
      } else if (char === "{") {
        const expression = readBracedExpression(this.source, this.offset);
        if (!expression) throw new MarkupSyntaxError("Close the interpolation with '}'. For a literal '{', write &#123;.", this.offset, true);
        this.offset = expression.end;
      } else if (char === "`") {
        const end = readInlineCode(this.source, this.offset);
        if (end !== undefined) {
          this.offset = end;
        } else if (partial) {
          throw new MarkupSyntaxError("Close the inline code span.", this.offset, true);
        } else {
          while (this.source[this.offset] === "`") this.offset++;
        }
      } else {
        this.offset++;
      }
    }
    this.append({ kind: "text", value: this.source.slice(offset, this.offset), offset });
  }

  parse(partial: boolean): { nodes: MarkupNode[]; incomplete: boolean } {
    try {
      while (!this.atEnd) {
        if (this.source[this.offset] === "<") this.readTag();
        else this.readText(partial);
      }
      const open = this.stack.at(-1);
      if (open) throw new MarkupSyntaxError(`Close <${open.name}> with </${open.name}>.`, open.offset, true);
      return { nodes: this.nodes, incomplete: false };
    } catch (error) {
      if (!partial || !(error instanceof MarkupSyntaxError) || !error.atEnd) throw error;
      return { nodes: this.nodes, incomplete: true };
    }
  }
}

/** Reads tags and preserves raw attribute values for the compiler. */
export function parseMarkup(source: string, partial = false): { nodes: MarkupNode[]; incomplete: boolean } {
  return new MarkupParser(source).parse(partial);
}
