import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import ts from "typescript";

const root = fileURLToPath(new URL("../", import.meta.url));
const src = path.join(root, "src");
const relative = (file: string) => path.relative(root, file).replaceAll("\\", "/");
const configFile = ts.readConfigFile(path.join(root, "tsconfig.json"), ts.sys.readFile);
assert.equal(configFile.error, undefined);
const config = ts.parseJsonConfigFileContent(configFile.config, ts.sys, root);

function sourceFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(file) : file.endsWith(".ts") ? [file] : [];
  });
}

function imports(source: string, file: string): string[] {
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const result = new Set<string>();
  const add = (node: ts.Node | undefined) => {
    assert.ok(node && ts.isStringLiteralLike(node), `${file}: dependency must be a literal`);
    result.add(node.text);
  };
  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      if (node.moduleSpecifier) add(node.moduleSpecifier);
    } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      add(node.moduleReference.expression);
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
      add(node.argument.literal);
    } else if (ts.isCallExpression(node) && (
      node.expression.kind === ts.SyntaxKind.ImportKeyword ||
      (ts.isIdentifier(node.expression) && node.expression.text === "require")
    )) {
      add(node.arguments[0]);
    }
    ts.forEachChild(node, visit);
  };
  visit(ast);
  return [...result];
}

const files = sourceFiles(src);
const graph = new Map(files.map((file) => {
  const dependencies = imports(fs.readFileSync(file, "utf8"), relative(file)).flatMap((specifier) => {
    const resolved = ts.resolveModuleName(specifier, file, config.options, ts.sys).resolvedModule;
    if (specifier.startsWith(".") && !specifier.endsWith(".css")) {
      assert.ok(resolved, `${relative(file)}: unresolved ${specifier}`);
    }
    if (resolved && !resolved.isExternalLibraryImport) return [relative(resolved.resolvedFileName)];
    if (specifier.startsWith(".")) return [relative(path.resolve(path.dirname(file), specifier))];
    return [`external:${specifier}`];
  });
  return [relative(file), dependencies] as const;
}));

function assertAcyclic(dependencies: ReadonlyMap<string, readonly string[]>): void {
  const visited = new Set<string>();
  const stack: string[] = [];
  const visit = (file: string) => {
    assert.ok(!stack.includes(file), `Circular dependency: ${[...stack, file].join(" -> ")}`);
    if (visited.has(file)) return;
    stack.push(file);
    for (const target of dependencies.get(file) ?? []) visit(target);
    stack.pop();
    visited.add(file);
  };
  for (const file of dependencies.keys()) visit(file);
}

const core = "src/runtime/core/";
const blocks = "src/runtime/blocks/";
const layerZero = new Set([
  "src/schema/uiSpec.ts", "src/schema/fallback.ts", "src/runtime/formula.ts", "src/presets.ts",
  "src/schema/vector.ts", "src/runtime/vector.ts",
  "src/runtime/display.ts",
  "src/schema/content.ts",
  "src/schema/atoms.ts", "src/schema/inlineText.ts",
  "src/schema/graph.ts", "src/schema/table.ts",
  "src/runtime/graphLayout.ts", "src/runtime/curve.ts", "src/runtime/table.ts",
  "src/runtime/summary.ts",
  "src/compile.ts",
  "src/schema/markup.ts", "src/schema/markupSyntax.ts", "src/schema/markupTags.ts",
]);
const blockLeaves = new Set([
  "choices", "controls", "chart", "compare", "checklist", "architecture",
  "callout", "grid", "tabs", "accordion",
  "plot", "svg",
  "stats", "timeline", "code",
  "graph", "table",
  "atoms",
].map((name) => `${blocks}${name}.ts`));
const blockImports = new Set([
  `${core}types.ts`, `${core}dom.ts`, `${core}state.ts`, "src/runtime/formula.ts", "src/schema/uiSpec.ts",
  `${core}svg.ts`, "src/runtime/vector.ts",
  "src/runtime/display.ts",
  "src/schema/inlineText.ts",
  "src/runtime/graphLayout.ts", "src/runtime/table.ts", `${core}plotCurve.ts`,
]);

function assertLayers(dependencies: ReadonlyMap<string, readonly string[]>): void {
  for (const [file, targets] of dependencies) {
    for (const target of targets) {
      if (layerZero.has(file)) {
        assert.ok(layerZero.has(target) || target.startsWith("external:"),
          `${file} must not import higher layer ${target}`);
      } else if (file.startsWith(core)) {
        const corePeers = file === `${core}state.ts` ? ["types.ts", "clipboard.ts"]
          : file === `${core}plotCurve.ts` ? ["dom.ts", "svg.ts", "types.ts"]
          : [];
        assert.ok(layerZero.has(target) || corePeers.some((name) => target === `${core}${name}`),
          `${file} must not import ${target}`);
      } else if (file === `${blocks}registry.ts`) {
        assert.ok(blockLeaves.has(target) || target === `${core}types.ts`, `${file} must not import ${target}`);
      } else if (file.startsWith(blocks)) {
        assert.ok(blockImports.has(target), `${file} must not import sibling or upper layer ${target}`);
      } else if (file === "src/runtime/renderer.ts") {
        assert.ok(target.startsWith(core) || target === `${blocks}registry.ts` || target === "src/schema/uiSpec.ts",
          `${file} must render blocks through the registry, not import ${target}`);
      }
    }
  }
}

test("source import graph is acyclic, including type imports and re-exports", () => {
  assertAcyclic(graph);
});

test("core and block dependencies follow the allowed layers and registry exception", () => {
  assertLayers(graph);
});

test("renderer and block files stay within their line budgets", () => {
  for (const file of files) {
    const name = relative(file);
    if (name !== "src/runtime/renderer.ts" && !name.startsWith(blocks)) continue;
    const limit = name === "src/runtime/renderer.ts" ? 200 : 220;
    const source = fs.readFileSync(file, "utf8");
    const lines = source.split(/\r?\n/).length - (source.endsWith("\n") ? 1 : 0);
    assert.ok(lines <= limit, `${name}: ${lines} lines exceeds ${limit}`);
  }
});
