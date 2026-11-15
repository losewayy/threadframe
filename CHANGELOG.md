# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-11-16

### Added

- Declarative `UiSpecSchema` covering six interactive primitives (`choices`, `controls`, `chart`, `compare`, `checklist`, `architecture`) with partial JSON stream parsing (`parsePartialUiSpec`).
- CSP-safe recursive-descent formula evaluator (`evaluateFormula`) with zero `eval` or `new Function` usage for reactive client-side calculators and charts.
- MCP Apps (`SEP-1865`, `ui://intelligence-ui/view.html`) server exposing `render_intelligence_ui` and `inspect_preset_ui` over both Streamable HTTP and `--stdio`, with automatic Markdown fallback for terminal/TUI clients.
- Built-in local Stream Simulator Playground (`/`) speaking real MCP Apps JSON-RPC over `postMessage`.
- Standalone single-file HTML exporter (`--export`) for inline agent embeds and offline sharing.
