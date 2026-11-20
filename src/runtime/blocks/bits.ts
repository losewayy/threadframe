import { el } from "../core/dom.js";
import type { BlockRenderer } from "../core/types.js";
import { formatNumber } from "../display.js";
import { evaluateFormula } from "../formula.js";

const tones = ["primary", "accent", "success", "warn"] as const;

export const renderBits: BlockRenderer<"bits"> = (block, context) => {
  const { state, bindings, syncControls } = context;
  const total = block.fields.reduce((sum, field) => sum + field.bits, 0);
  const wrap = el("div", "iui-bits");
  const strip = el("div", "iui-bits-strip");
  const detail = el("div", "iui-bits-detail");
  detail.setAttribute("role", "status");

  let cursor = block.lsbFirst ? 0 : total - 1;
  const cells = block.fields.map((field, index) => {
    const start = cursor;
    const end = block.lsbFirst ? cursor + field.bits - 1 : cursor - field.bits + 1;
    cursor = block.lsbFirst ? end + 1 : end - 1;
    const range = field.bits === 1 ? `${start}` : `${start}:${end}`;
    const tone = field.tone ?? tones[index % tones.length];

    const btn = el("button", `iui-bit-field ${tone}`);
    btn.type = "button";
    btn.style.flex = `${Math.max(1, Math.min(8, Math.round(Math.sqrt(field.bits) * 1.6)))} 1 ${field.bits === 1 ? 48 : 64}px`;
    const head = el("span", "iui-bit-head");
    head.append(el("span", "iui-bit-range", range), el("span", "iui-bit-width", `${field.bits}b`));
    const nameEl = el("span", "iui-bit-label", field.label);
    const valEl = el("span", "iui-bit-value", field.value !== undefined ? String(field.value) : "");
    btn.append(head, nameEl, valEl);
    btn.addEventListener("click", () => selectField(field.id, true));
    strip.appendChild(btn);
    return { field, btn, valEl, range };
  });

  const selectField = (id: string, emit = false) => {
    let shown = false;
    for (const cell of cells) {
      const on = cell.field.id === id;
      cell.btn.classList.toggle("selected", on);
      cell.btn.setAttribute("aria-pressed", String(on));
      if (on) {
        const note = cell.field.detail ?? `${cell.field.bits} bit${cell.field.bits > 1 ? "s" : ""} [${cell.range}]`;
        detail.textContent = `${cell.field.label}: ${note}`;
        shown = true;
      }
    }
    detail.hidden = !shown;
    if (emit && block.selectVar) {
      state.scope[block.selectVar] = id;
      state.notifyScopeChange();
    }
  };

  const initialId = (block.selectVar ? String(state.scope[block.selectVar] ?? "") : "") || cells[0]?.field.id;
  if (initialId) selectField(initialId);
  else detail.hidden = true;

  if (block.selectVar) {
    const varName = block.selectVar;
    syncControls.push((scope) => {
      const target = String(scope[varName] ?? "");
      if (target && cells.some((cell) => cell.field.id === target)) selectField(target);
    });
  }

  bindings.push({
    update: (scope) => {
      for (const { field, valEl } of cells) {
        if (field.formula) {
          const val = evaluateFormula(field.formula, scope);
          valEl.textContent = val === null ? "—" : typeof val === "number" ? formatNumber(val) : String(val);
        } else {
          valEl.textContent = field.value !== undefined ? String(field.value) : "";
        }
      }
    },
  });

  wrap.append(strip, detail);
  if (block.caption) wrap.appendChild(el("p", "iui-vector-caption", block.caption));
  return wrap;
};
