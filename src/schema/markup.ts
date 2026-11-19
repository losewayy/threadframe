import { z } from "zod";
import type { CompileResult } from "../compile.js";
import { slugify } from "../compile.js";
import { evaluateFormula, formulaIdentifiers, type VarScope } from "../runtime/formula.js";
import { decodeInlineEntities, parseInlineText } from "./inlineText.js";
import {
  parseMarkup, MarkupSyntaxError, type MarkupAttribute, type MarkupElement, type MarkupNode,
} from "./markupSyntax.js";
import {
  markupTags, atomicTags, autoIdTags, tagUsageHint, type BlockLevel, type ChildRule, type MarkupTag,
} from "./markupTags.js";
import {
  InnerBoxBlockSchema, UiSpecSchema, choiceAssignmentIssues, declaredControls, walkBlocks,
  type ControlItem, type PartialUiSpecResult, type UiBlock, type UiSpec,
} from "./uiSpec.js";

const MAX_MARKUP = 32_768;
export const MarkupInputSchema = z.object({
  markup: z.string().min(1).max(MAX_MARKUP),
  title: z.string().optional(),
  subtitle: z.string().optional(),
  badge: z.string().optional(),
  statePath: z.string().optional(),
});
type MarkupInput = z.infer<typeof MarkupInputSchema>;
type Fields = Record<string, unknown>;
type Action = NonNullable<UiSpec["actions"]>[number];

interface FormulaSource {
  expression: string;
  field: string;
  offset: number;
  locals?: string[];
}

const MAX_ISSUES = 12;
const controlTags = new Set(["slider", "toggle", "select"]);
const formulaField = (name: string) => name === "formula" || name.endsWith("Formula");
const fail = (offset: number, message: string): never => { throw new MarkupSyntaxError(message, offset); };

function formatOffset(source: string, offset: number, message: string): string {
  const lines = source.slice(0, offset).split(/\r\n|\n|\r/);
  return `Line ${lines.length}, column ${lines.at(-1)!.length + 1}: ${message}`;
}

function attributeValue(attribute: MarkupAttribute, field: string, isFormula: boolean): unknown {
  if (attribute.kind === "quoted") return decodeInlineEntities(attribute.value);
  if (attribute.kind === "flag") return true;
  if (isFormula) return attribute.value.trim();
  if (formulaIdentifiers(attribute.value).length) {
    return fail(attribute.offset, `${field}: use a constant here, or a formula attribute for a live value`);
  }
  const value = evaluateFormula(attribute.value, {});
  if (value === null || (typeof value === "number" && !Number.isFinite(value))) {
    return fail(attribute.offset, `${field}: expected a safe number, boolean, or quoted string inside braces`);
  }
  return value;
}

function formulaIssue(source: FormulaSource, scope: VarScope): string | undefined {
  const local = { ...scope };
  for (const name of source.locals ?? []) if (!Object.hasOwn(local, name)) local[name] = 0;
  const missing = formulaIdentifiers(source.expression).find((name) => !Object.hasOwn(local, name));
  if (missing) return `unknown variable "${missing}"; declare it with a control or fix its name`;
  if (evaluateFormula(source.expression, local) === null) {
    return "invalid formula; use arithmetic, comparisons, and math helpers such as round or clamp";
  }
}

function readBody(element: MarkupElement): { text: string; offset: number } {
  let source = "";
  let offset = element.offset;
  for (const child of element.children) {
    if (child.kind === "element") return fail(child.offset, `<${element.name}> takes text, not <${child.name}>`);
    if (!source) offset = child.offset;
    source += child.value;
  }
  return { text: source.trim(), offset: offset + source.length - source.trimStart().length };
}

class MarkupCompiler {
  readonly actions: Action[] = [];
  readonly issues: string[] = [];
  pending = false;
  private readonly formulas: FormulaSource[] = [];
  private readonly controls = new Set<string>();
  private readonly assignments = new Map<string, number>();

  constructor(private readonly partial: boolean, private readonly source = "") {}

  private record(offset: number, message: string): undefined {
    if (this.partial) fail(offset, message);
    if (this.issues.length < MAX_ISSUES) this.issues.push(formatOffset(this.source, offset, message));
    return undefined;
  }

  frame(nodes: MarkupNode[], input: Partial<MarkupInput>): UiSpec {
    nodes = nodes.filter((node) => node.kind !== "text" || node.value.trim());
    const first = nodes[0];
    let metadata: Fields = {};
    if (first?.kind === "element" && first.name === "frame") {
      if (nodes.length > 1) this.record(nodes[1].offset, "put all blocks inside <frame>, or omit the wrapper");
      const frameTag = markupTags.get("frame")!;
      metadata = this.validateElementAttributes(first, frameTag) ?? {};
      nodes = first.children;
    }
    const subtitle = input.subtitle ?? (metadata.subtitle as string | undefined);
    const badge = input.badge ?? (metadata.badge as string | undefined);
    return {
      title: input.title?.trim() || String(metadata.title ?? "").trim() || "Interactive view",
      ...(subtitle === undefined ? {} : { subtitle }),
      ...(badge === undefined ? {} : { badge }),
      blocks: this.blocks(nodes, "root"),
    };
  }

  private preview<T>(build: () => T): T | undefined {
    try {
      return build();
    } catch (error) {
      if (!(error instanceof MarkupSyntaxError)) throw error;
      if (!this.partial) {
        this.record(error.offset, error.message);
        return undefined;
      }
      this.pending = true;
    }
  }

  private blocks(nodes: MarkupNode[], level: BlockLevel): UiBlock[] {
    const blocks: UiBlock[] = [];
    const controls: ControlItem[] = [];
    const flush = () => {
      if (controls.length) blocks.push({ kind: "controls", controls: controls.splice(0) });
    };
    for (const node of nodes) {
      if (node.kind === "text" && !node.value.trim()) continue;
      this.preview(() => {
        if (node.kind === "text") {
          flush();
          const text = node.value.trim();
          this.inline(text, node.offset + node.value.length - node.value.trimStart().length, "text");
          blocks.push({ kind: "text", text });
          return;
        }
        const tag = this.definition(node);
        if (level !== "atomic" && controlTags.has(node.name)) {
          const control = this.element(node, tag);
          if (control) controls.push(control as ControlItem);
          return;
        }
        flush();
        if (node.name === "button" && level === "root") {
          if (this.partial) return;
          const action = this.element(node, tag);
          if (action) this.actions.push({
            kind: action.action as Action["kind"], label: String(action.label), promptTemplate: action.promptTemplate as string | undefined,
          });
          return;
        }
        if (!tag.block) fail(node.offset, `<${node.name}> belongs inside its parent widget`);
        if (level === "atomic" && !atomicTags.has(node.name)) {
          fail(node.offset, `a nested <box> accepts only text, title, caption, badge, divider, and icon; move <${node.name}> out one level`);
        }
        if (level !== "root" && (node.name === "tabs" || node.name === "accordion" || (node.name === "grid" && level !== "panel"))) {
          fail(node.offset, `move <${node.name}> to the top level`);
        }
        const definition = node.name === "box" && level !== "root"
          ? { ...tag, schema: InnerBoxBlockSchema, blocks: "atomic" as const }
          : tag;
        const block = this.element(node, definition);
        if (block) blocks.push(block as UiBlock);
      });
    }
    flush();
    return blocks;
  }

  private definition(element: MarkupElement): MarkupTag {
    return markupTags.get(element.name) ?? fail(element.offset, `unknown tag <${element.name}>; check spelling or read threadframe://examples/markup`);
  }

  private collectAttributes(element: MarkupElement, tag: MarkupTag): {
    fields: Fields;
    problems: Array<{ offset: number; message: string; field?: string }>;
  } {
    const fields: Fields = { ...tag.fixed, ...(tag.block || controlTags.has(element.name) ? { kind: element.name } : {}) };
    const problems: Array<{ offset: number; message: string; field?: string }> = [];
    for (const [name, attribute] of element.attrs) {
      const field = tag.alias && Object.hasOwn(tag.alias, name) ? tag.alias[name] : name;
      const childField = (tag.blocks && field === "children") || tag.list?.some((rule) => rule.field === field);
      if (!Object.hasOwn(tag.schema.shape, field) || Object.hasOwn(fields, field) || childField || (tag.body === "inline" && field === "text")) {
        problems.push({ offset: attribute.offset, message: `<${element.name}>: unexpected or repeated attribute "${name}"`, field });
        continue;
      }
      const where = `<${element.name}>.${name}`;
      try {
        fields[field] = attributeValue(attribute, where, formulaField(field));
        if (formulaField(field)) this.formulas.push({ expression: String(fields[field]), field: where, offset: attribute.offset });
      } catch (error) {
        if (!(error instanceof MarkupSyntaxError)) throw error;
        problems.push({ offset: error.offset, message: error.message, field });
      }
    }
    return { fields, problems };
  }

  private schemaProblems(element: MarkupElement, tag: MarkupTag, fields: Fields, brokenFields: Set<string>): Array<{ offset: number; message: string }> {
    const parsed = tag.schema.safeParse(fields);
    if (parsed.success) return [];
    const problems: Array<{ offset: number; message: string }> = [];
    const seen = new Set<string>();
    for (const issue of parsed.error.issues) {
      const key = issue.path.join(".");
      const top = String(issue.path[0] ?? "");
      if (seen.has(key) || (top && brokenFields.has(top))) continue;
      seen.add(key);
      const alias = top === "defaultValue" ? element.attrs.get("default") : top === "column" ? element.attrs.get("key") : undefined;
      const at = element.attrs.get(top) ?? alias;
      const displayPath = issue.path.map((part, index) => (index === 0 && part === "column" && !element.attrs.has("column") ? "key" : String(part))).join(".");
      problems.push({
        offset: at?.offset ?? element.offset,
        message: `<${element.name}>${displayPath ? `.${displayPath}` : ""}: ${issue.message}`,
      });
    }
    return problems;
  }

  private validateElementAttributes(element: MarkupElement, tag: MarkupTag): Fields | undefined {
    const { fields, problems } = this.collectAttributes(element, tag);
    const broken = new Set(problems.map((problem) => problem.field).filter((field): field is string => !!field));
    const all = [...problems, ...this.schemaProblems(element, tag, fields, broken)];
    if (!all.length) return tag.schema.parse(fields);
    const hint = tagUsageHint(element.name, tag);
    return this.record(all[0].offset, `${all.map((item) => item.message).join("; ")}. ${hint}`);
  }

  private element(element: MarkupElement, tag: MarkupTag, usedIds?: Set<string>, index = 0): Fields | undefined {
    if (!element.closed && !tag.blocks && !tag.list) return;
    const { fields, problems } = this.collectAttributes(element, tag);
    const broken = new Set(problems.map((problem) => problem.field).filter((field): field is string => !!field));
    const structural: Array<{ offset: number; message: string }> = [];
    if (tag.body) {
      const body = readBody(element);
      const field = tag.body === "inline" ? "text" : tag.body === "literal" ? "body" : "code";
      if (tag.body === "inline") {
        if (!body.text) structural.push({ offset: element.offset, message: `<${element.name}> needs text between its tags` });
        else {
          this.inline(body.text, body.offset, `<${element.name}> text`);
          fields.text = body.text;
        }
      } else if (body.text) {
        if (Object.hasOwn(fields, field) || (tag.body === "code" && Object.hasOwn(fields, "template"))) {
          structural.push({ offset: body.offset, message: `<${element.name}>: supply either body text or a ${field} attribute` });
        } else {
          fields[field] = decodeInlineEntities(body.text);
        }
      }
    } else if (tag.blocks) {
      fields.children = this.blocks(element.children, tag.blocks);
    } else if (tag.list) {
      this.children(element, fields, tag.list);
    } else {
      const unexpected = element.children.find((node) => node.kind === "element" || node.value.trim());
      if (unexpected) {
        structural.push({
          offset: unexpected.offset,
          message: unexpected.kind === "text"
            ? `<${element.name}> takes attributes only, not inner text; close it with />`
            : `<${element.name}> takes no child tags; close it with />`,
        });
      }
    }
    if (controlTags.has(element.name)) this.controlDefaults(element, fields);
    if (autoIdTags.has(element.name)) this.ensureAutoId(element.name, fields, usedIds, index);
    if (element.name === "row") fields.values ??= {};
    if (element.name === "code" && typeof fields.template === "string") {
      for (const match of fields.template.matchAll(/{{\s*([A-Za-z_]\w*)\s*}}/g)) {
        this.formulas.push({ expression: match[1], field: "<code>.template", offset: element.attrs.get("template")!.offset });
      }
    }
    const all = [...problems, ...structural, ...this.schemaProblems(element, tag, fields, broken)];
    if (!all.length) return tag.schema.parse(fields);
    const hint = tagUsageHint(element.name, tag);
    return this.record(all[0].offset, `${all.map((item) => item.message).join("; ")}. ${hint}`);
  }

  private ensureAutoId(tagName: string, fields: Fields, usedIds: Set<string> | undefined, index: number): void {
    if (typeof fields.id === "string" && fields.id.length) {
      usedIds?.add(fields.id);
      return;
    }
    if (fields.id !== undefined) return;
    const base = slugify(String(fields.label ?? fields.title ?? ""), `${tagName}_${index + 1}`);
    let candidate = base;
    let suffix = 2;
    while (usedIds?.has(candidate)) candidate = `${base}_${suffix++}`;
    usedIds?.add(candidate);
    fields.id = candidate;
  }

  private children(element: MarkupElement, fields: Fields, rules: ChildRule[]): void {
    const localColumns: FormulaSource[] = [];
    const usedIds = new Set<string>();
    let childIndex = 0;
    for (const child of element.children) {
      if (child.kind === "text" && !child.value.trim()) continue;
      this.preview(() => {
        if (child.kind === "text") return fail(child.offset, `<${element.name}> expects child tags, such as <${rules[0].tag}>`);
        const rule = rules.find((candidate) => candidate.tag === child.name);
        if (!rule) return fail(child.offset, `<${element.name}> accepts ${rules.map(({ tag }) => `<${tag}>`).join(", ")}; move or rename <${child.name}>`);
        const firstFormula = this.formulas.length;
        const value = this.element(child, this.definition(child), usedIds, childIndex++);
        if (!value) return;
        const recent = this.formulas.slice(firstFormula);
        if (child.name === "curve") recent.forEach((formula) => { formula.locals = [String(fields.xVariable ?? "x")]; });
        if (child.name === "column") localColumns.push(...recent);
        this.appendChild(child, fields, rule, value);
      });
    }
    if (localColumns.length) {
      const rows = fields.rows as { values: Fields }[] | undefined;
      const keys = [...new Set(rows?.flatMap(({ values }) => Object.keys(values)))];
      localColumns.forEach((formula) => { formula.locals = keys; });
    }
    if (!this.partial && element.name === "graph") this.checkGraph(element, fields);
  }

  private appendChild(element: MarkupElement, fields: Fields, rule: ChildRule, child: Fields): void {
    const value = rule.value === undefined ? child : child[rule.value];
    if (rule.key) {
      const key = String(child[rule.key]);
      const offset = element.attrs.get(rule.key)?.offset ?? element.offset;
      const entries = (fields[rule.field] ??= Object.create(null)) as Fields;
      if (key === "__proto__" || Object.hasOwn(entries, key)) fail(offset, `<${element.name}>.${rule.key}: invalid or repeated key "${key}"`);
      entries[key] = value;
      if (element.name === "set") this.assignments.set(`choices "${fields.id}" setVars.${key}:`, offset);
    } else if (rule.single) {
      if (Object.hasOwn(fields, rule.field)) fail(element.offset, `only one <${rule.tag}> is allowed here`);
      fields[rule.field] = value;
    } else {
      ((fields[rule.field] ??= []) as unknown[]).push(value);
    }
  }

  private controlDefaults(element: MarkupElement, fields: Fields): void {
    const id = fields.id;
    const at = (name: string) => element.attrs.get(name)?.offset ?? element.offset;
    if (typeof id !== "string" || !/^[A-Za-z_]\w*$/.test(id) || ["true", "false", "__proto__"].includes(id)) {
      fail(at("id"), `<${element.name}>.id: use a variable name such as sample_count`);
    }
    if (typeof id === "string" && !this.partial) {
      if (this.controls.has(id)) fail(at("id"), `duplicate control id "${id}"; give this input a unique name`);
      this.controls.add(id);
    }
    if (element.name === "slider") {
      fields.min ??= 0;
      fields.max ??= 100;
      fields.defaultValue ??= fields.min;
      if (typeof fields.min === "number" && typeof fields.max === "number") {
        if (fields.min >= fields.max) fail(at("max"), "<slider>.max must be greater than min");
        if (typeof fields.defaultValue === "number" && (fields.defaultValue < fields.min || fields.defaultValue > fields.max)) {
          fail(at(element.attrs.has("default") ? "default" : "defaultValue"), "<slider>.default must be between min and max");
        }
      }
    } else if (element.name === "toggle") {
      fields.defaultValue ??= false;
    } else {
      const options = fields.options as string[] | undefined;
      fields.defaultValue ??= options?.[0];
      if (options?.length && !options.includes(String(fields.defaultValue))) {
        fail(at(element.attrs.has("default") ? "default" : "defaultValue"), "<select>.default must match one of its <option> values");
      }
    }
  }

  private checkGraph(element: MarkupElement, fields: Fields): void {
    const tagOffsets = (name: string) => element.children.filter(
      (child): child is MarkupElement => child.kind === "element" && child.name === name,
    );
    const nodes = tagOffsets("node");
    const ids = new Set<string>();
    for (const [index, node] of ((fields.nodes ?? []) as Array<{ id: string }>).entries()) {
      if (ids.has(node.id)) {
        const source = nodes[index];
        fail(source.attrs.get("id")?.offset ?? source.offset, `<node>.id: duplicate node id "${node.id}"`);
      }
      ids.add(node.id);
    }
    const edges = tagOffsets("edge");
    for (const [index, edge] of ((fields.edges ?? []) as Array<{ from: string; to: string }>).entries()) {
      for (const endpoint of ["from", "to"] as const) {
        if (!ids.has(edge[endpoint])) {
          const source = edges[index];
          fail(source.attrs.get(endpoint)?.offset ?? source.offset, `<edge>.${endpoint}: unknown node "${edge[endpoint]}"; use a <node> id`);
        }
      }
    }
  }

  private inline(text: string, offset: number, field: string): void {
    for (const part of parseInlineText(text)) {
      if (part.kind !== "formula") continue;
      this.formulas.push({ expression: part.formula, field, offset: offset + part.offset });
    }
  }

  validate(spec: UiSpec): void {
    const scope: VarScope = Object.fromEntries(
      [...declaredControls(spec.blocks)].map(([id, control]) => [id, control.defaultValue]),
    );
    for (const formula of this.formulas) {
      const issue = formulaIssue(formula, scope);
      if (issue) this.record(formula.offset, `${formula.field}: ${issue}`);
    }
    for (const issue of choiceAssignmentIssues(spec.blocks)) {
      const location = [...this.assignments].find(([field]) => issue.startsWith(field));
      this.record(location?.[1] ?? 0, issue);
    }
  }
}

export function compileMarkup(input: MarkupInput): CompileResult {
  try {
    if (input.markup.length > MAX_MARKUP) fail(MAX_MARKUP, `keep markup under ${MAX_MARKUP} characters`);
    const compiler = new MarkupCompiler(false, input.markup);
    const spec = compiler.frame(parseMarkup(input.markup).nodes, input);
    if (compiler.issues.length) return { ok: false, issues: compiler.issues };
    if (!spec.blocks.length) fail(0, "add at least one display block, such as <text>…</text>");
    const actions = input.statePath !== undefined
      ? [{ kind: "save_state" as const, label: "Apply & remember", statePath: input.statePath }, ...compiler.actions]
      : compiler.actions;
    if (actions.length) spec.actions = actions;
    compiler.validate(spec);
    if (compiler.issues.length) return { ok: false, issues: compiler.issues };
    const parsed = UiSpecSchema.safeParse(spec);
    if (!parsed.success) {
      return { ok: false, issues: parsed.error.issues.slice(0, MAX_ISSUES).map((issue) => formatOffset(input.markup, 0, `${issue.path.join(".")}: ${issue.message}`)) };
    }
    return { ok: true, spec: parsed.data };
  } catch (error) {
    if (!(error instanceof MarkupSyntaxError)) throw error;
    return { ok: false, issues: [formatOffset(input.markup, error.offset, error.message)] };
  }
}

export function parsePartialMarkup(input: Partial<MarkupInput>): PartialUiSpecResult {
  const compiler = new MarkupCompiler(true);
  const source = input.markup?.slice(0, MAX_MARKUP) ?? "";
  let parsed: ReturnType<typeof parseMarkup>;
  try {
    parsed = parseMarkup(source, true);
    const spec = compiler.frame(parsed.nodes, input);
    const assignmentsValid = choiceAssignmentIssues(spec.blocks).length === 0;
    walkBlocks(spec.blocks, (block) => {
      if (block.kind !== "choices") return;
      for (const option of block.options) {
        delete option.prompt;
        if (!assignmentsValid) delete option.setVars;
      }
    });
    const incomplete = parsed.incomplete || compiler.pending || !spec.blocks.length;
    return { ...spec, actions: [], pendingBlockCount: incomplete ? 1 : 0, isComplete: !incomplete };
  } catch (error) {
    if (!(error instanceof MarkupSyntaxError)) throw error;
    return { title: input.title || "Building interactive view…", subtitle: input.subtitle, badge: input.badge,
      blocks: [], actions: [], pendingBlockCount: 1, isComplete: false };
  }
}
