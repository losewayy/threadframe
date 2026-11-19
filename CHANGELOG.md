# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.5.0] - 2026-11-19

### Added

- `render_markup` compiles concise tags, live text formulas, and bounded layouts to UiSpec. Closed components can appear while the host streams arguments.
- `box`, `text`, `title`, `caption`, `badge`, `divider`, and `icon` blocks, with semantic tints and a shared icon set for diagrams and choices.
- Tinted flow, linked curve, and sortable table examples at `threadframe://examples/markup`, live markup compilation in the Playground (`/compile-markup`), server-level MCP `instructions`, and cross-client prompting snippets in `docs/agent-prompts.md`.

### Changed

- Light, dark, and embedded cards use softer surfaces, clearer type hierarchy, and more compact controls. Tables wrap text, range sliders render keyboard focus rings around the thumb instead of the outer track box, and large graph canvases scroll within their own region.
- Focused the MCP tool list on 4 non-overlapping card entry points (`present_calculator`, `present_decision`, `present_diagram`, `render_markup`) plus `read_threadframe_state`, retired redundant `render_threadframe` / `inspect_preset_frame` from default MCP registration, and scoped `save_threadframe_state` with `visibility: ["app"]`.

### Fixed

- Chart labels use the same rounded number display in the card and its Markdown fallback.

## [0.4.0] - 2026-11-19

### Added

- Shortcut tools `present_calculator`, `present_decision`, and `present_diagram` backed by a pure compiler that expands flat input into a standard UiSpec.
- `graph` block with deterministic layered auto-layout, cycle-safe routing, live node values, and conditional edge highlighting.
- Parameterized `plot` curves with domain sampling, undefined-point breaks, keyboard/pointer inspection, and Markdown sample tables.
- `table` block with sortable columns, keyword and status filtering, derived formula cells, and constrained internal scrolling.
- Opt-in local `--stdio` state snapshots (`statePath`, `save_threadframe_state`, `read_threadframe_state`) with HTTP writes disabled.
- Labeled intent summaries that separate changed values from untouched defaults.
- Shared path guard for embed and snapshot files, now rejecting symlink components.

### Changed

- Shortcut and preset tool descriptions now state when to call them and when to stay text-only.

## [0.3.0] - 2026-11-16

### Changed

- Rebranded package, server, and CLI binary to **ThreadFrame** (`threadframe`), exposing `render_threadframe`, `inspect_preset_frame`, `ui://threadframe/view.html`, and `threadframe://examples/svg` with `THREADFRAME_HOST` override support.
- Simplified `README.md` and `README.zh-CN.md` around quick installation, visual demo, client auto-adaptation, and security boundaries.

### Added

- Capability-based native MCP Apps, Antigravity, and Markdown response adapters (`detectClientAdapter`).
- Explicit local-stdio HTML artifact export (`embedPath` with path safety validation), CLI `stdin` (`-`) input, and compact transparent `--embed` output.
- Safe vector example resource (`threadframe://examples/svg`), inline tool usage example, and non-blocking `threadframe:render` diagnostics.

### Fixed

- Added synchronous `<textarea>` clipboard fallback in `copyText` when `navigator.clipboard` is blocked inside sandboxed or `file://` iframes.
- Exported and embedded standalone pages skip MCP Apps host handshakes and route footer actions directly to clipboard copy.
- Embedded pages synchronize host light/dark classes and `themechange` events cleanly.
- Source-mode servers resolve the compiled inline bundle reliably regardless of working directory.

## [0.2.0] - 2026-11-16

### Added

- Bounded `grid`, `tabs`, and `accordion` composition with shared bindings and persistent state.
- Semantic `callout`, reactive `stats`, selectable `timeline`, and copyable `code` blocks.
- `line`, `bar`, and `donut` SVG plots with formulas, precision, and pointer/keyboard inspection.
- Safe responsive vector canvases (`svg`) with seven whitelisted primitives and numeric/text formulas.
- Workbench, vector lab, and launch kit showcases, bringing the preset catalog to seven.
- Playground width switching (`760px` / `420px`), server-validated Custom JSON Spec drawer, and acknowledged `ui/message` previews.
- Source-graph AST guards, behavioral contract tests, Ubuntu/Node 22 CI, package allowlisting, and prepack checks.

### Fixed

- `copy_state` bypasses the host; offline actions copy instead of silently using an unavailable message bridge.
- String operands concatenate with `+` without altering numeric arithmetic.
- Completed streamed blocks, tab selections, accordion toggles, and timeline selections survive progressive updates.
- Initial and changed host themes, style variables, and local font faces synchronize cleanly, with stable scrollbar gutters preventing horizontal shifts.

## [0.1.0] - 2026-11-16

- Initial MCP Apps server, six core leaf blocks, progressive partial JSON parsing, safe numeric formulas, Markdown fallback, and standalone HTML export.
