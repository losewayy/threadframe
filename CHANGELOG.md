# Changelog

## [0.2.0] - 2026-11-16

### Added

- Bounded grid, tabs and accordion composition with shared bindings and persistent state.
- Semantic callout, reactive stats, selectable timeline and copyable code blocks.
- Line, bar and donut SVG plots with formulas, precision and pointer/keyboard inspection.
- Safe responsive vector canvases with seven whitelisted primitives and numeric/text formulas.
- Workbench, vector lab and launch kit showcases, bringing the preset catalog to seven.
- Playground width switching, server-validated JSON runs/streams and acknowledged message previews.
- Source-graph guards, behavioral tests, Ubuntu/Node 22 CI, package allowlisting and prepack checks.
- Bilingual documentation, an architecture diagram, recorded UI demo and runnable JSON example.

### Fixed

- copy_state bypasses the host; offline actions copy instead of silently using an unavailable message bridge.
- Clipboard denial shows an actionable status rather than false success.
- String operands concatenate with + without changing numeric arithmetic.
- Completed streamed blocks stay mounted, preserving controls and avoiding whole-view flicker.
- Tab, accordion and timeline selections survive streaming; valid partial entries render safely.
- Initial host theme, changed styles and local font faces synchronize with palette fallbacks.
- Preview height follows content, with stable scrollbar gutters preventing horizontal shifts.

### Changed

- Split the runtime into a thin facade, independent blocks, DOM/state foundations and pure models.
- Split CSS by tokens, structure, controls, data, layouts, vectors and content.
- Refined light/dark surfaces, contrast, semantic colors and custom form controls.
- Expanded MCP tool guidance with the full catalog, nesting and formula/template rules.

## [0.1.0]

- Initial MCP Apps server, six leaf blocks, progressive parsing, safe numeric formulas, Markdown fallback and standalone export.
