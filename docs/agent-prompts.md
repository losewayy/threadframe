# Agent Prompting Guide

ThreadFrame already ships two layers of built-in prompting over MCP:

1. **Server `instructions`** (sent during MCP `initialize` to compatible hosts such as Codex, Claude, and Cursor).
2. **Tool `description` triggers** on `present_calculator`, `present_decision`, `present_diagram`, and `render_markup`.

Adding a short project or user rule makes models trigger cards much more consistently. Copy the snippet that matches your client.

---

## Codex (`AGENTS.md`) / Claude Code (`CLAUDE.md`)

```md
When explaining tunable trade-offs, comparing 2–4 options, walking through a flow/topology, plotting a parameter-linked curve, or comparing filterable tabular metrics, proactively render one compact ThreadFrame card (~450px height) instead of a wall of static text:
- Use `present_calculator` for sliders/toggles/selects with live metrics or command templates.
- Use `present_decision` for 2–4 option trade-offs with criteria and selectable presets.
- Use `present_diagram` for node/edge flows (never compute SVG coordinates by hand).
- Use `render_markup` for custom tinted box flows, live formula plots (`<plot><curve/></plot>`), or sortable/filterable tables (`<table>`).
- Stay text-only for simple factual Q&A, single command output, or isolated error debugging.
- Do not pass `embedPath` in native MCP Apps hosts. Pass `statePath` only if the user asks to remember selections locally over `--stdio`.
```

---

## Cursor (`.cursor/rules/threadframe.mdc`)

```md
---
description: Trigger ThreadFrame interactive cards when visual tuning, comparison, or diagrams help
alwaysApply: true
---

Prefer rendering one compact ThreadFrame card when the user asks to tune parameters (`present_calculator`), decide among 2–4 options (`present_decision`), understand a pipeline/topology (`present_diagram`), or explore a plotted formula or sortable table (`render_markup`). Keep explanations outside the card concise and skip cards for straightforward factual answers.
```

---

## Antigravity (`threadframe-embed` Skill)

Antigravity embeds standalone single-file HTML widgets via `<agent-embed src="file:///..."></agent-embed>`:

- Always pass a unique `embedPath` under the conversation artifact directory (`.html`).
- Never pass `statePath` or call `read_threadframe_state` in Antigravity (`<agent-embed>` runs without a live MCP Apps bridge).
- Place `<agent-embed src="file:///..."></agent-embed>` on its own line without a `height` attribute after confirming `Embed HTML written: file:///...` in the tool output.
