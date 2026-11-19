import { el, icon } from "../core/dom.js";
import { uiCopy } from "../display.js";
import type { BlockRenderer } from "../core/types.js";
import { evaluateNumericOrNull } from "../formula.js";

export const renderControls: BlockRenderer<"controls"> = (block, context) => {
  const { state, bindings, syncControls } = context;
  const wrap = el("div");
  const grid = el("div", "iui-controls-grid");

  for (const ctrl of block.controls) {
    const box = el("div", "iui-control");
    const top = el("div", "iui-control-top");
    top.appendChild(el("span", undefined, ctrl.label));
    const valEl = el("span", "iui-control-val");
    top.appendChild(valEl);
    box.appendChild(top);

    if (ctrl.kind === "slider") {
      const input = el("input", "iui-range");
      input.type = "range";
      input.setAttribute("aria-label", ctrl.label);
      input.min = String(ctrl.min);
      input.max = String(ctrl.max);
      input.step = String(ctrl.step ?? 1);
      input.value = String(state.scope[ctrl.id] ?? ctrl.defaultValue);

      const sync = () => {
        const cur = Number(state.scope[ctrl.id] ?? ctrl.defaultValue);
        input.value = String(cur);
        input.style.setProperty("--range-progress", `${Math.max(0, Math.min(100, (cur - ctrl.min) / (ctrl.max - ctrl.min || 1) * 100))}%`);
        valEl.textContent = `${cur}${ctrl.unit ? ` ${ctrl.unit}` : ""}`;
      };
      sync();
      syncControls.push(sync);

      input.addEventListener("input", () => {
        state.scope[ctrl.id] = Number(input.value);
        state.notifyScopeChange();
      });
      box.appendChild(input);
    } else if (ctrl.kind === "toggle") {
      const btn = el("button", "iui-toggle-btn");
      btn.type = "button";
      btn.setAttribute("role", "switch");
      btn.setAttribute("aria-label", ctrl.label);
      btn.appendChild(el("span", "iui-toggle-thumb"));
      const sync = () => {
        const on = Boolean(state.scope[ctrl.id]);
        btn.classList.toggle("on", on);
        btn.setAttribute("aria-checked", String(on));
        valEl.textContent = on ? "ON" : "OFF";
      };
      sync();
      syncControls.push(sync);

      btn.addEventListener("click", () => {
        state.scope[ctrl.id] = !Boolean(state.scope[ctrl.id]);
        state.notifyScopeChange();
      });
      box.appendChild(btn);
    } else {
      const seg = el("div", "iui-seg");
      seg.setAttribute("role", "group");
      seg.setAttribute("aria-label", ctrl.label);
      const segButtons: Array<{ opt: string; btn: HTMLButtonElement }> = [];
      for (const opt of ctrl.options) {
        const btn = el("button", "iui-seg-btn", opt);
        btn.type = "button";
        btn.addEventListener("click", () => {
          state.scope[ctrl.id] = opt;
          state.notifyScopeChange();
        });
        segButtons.push({ opt, btn });
        seg.appendChild(btn);
      }

      const sync = () => {
        const cur = String(state.scope[ctrl.id] ?? ctrl.defaultValue);
        valEl.textContent = cur;
        for (const item of segButtons) {
          item.btn.classList.toggle("active", item.opt === cur);
          item.btn.setAttribute("aria-pressed", String(item.opt === cur));
        }
      };
      sync();
      syncControls.push(sync);
      box.appendChild(seg);
    }

    grid.appendChild(box);
  }

  wrap.appendChild(grid);

  if (block.metrics?.length) {
    const copy = uiCopy(Boolean(state.zh));
    const strip = el("div", "iui-metrics-strip");
    for (const metric of block.metrics) {
      const pill = el("div", "iui-metric-pill");
      pill.appendChild(el("div", "iui-metric-label", metric.label));
      const numEl = el("div", "iui-metric-num", "-");
      pill.appendChild(numEl);
      const warning = el("span", "iui-metric-warning", copy.aboveBudget);
      warning.prepend(icon("warning"));
      warning.hidden = true;
      pill.appendChild(warning);
      strip.appendChild(pill);

      bindings.push({
        update: (scope) => {
          const val = evaluateNumericOrNull(metric.formula, scope);
          if (val === null) {
            numEl.textContent = "—";
            numEl.classList.remove("warn");
            pill.classList.remove("warn");
            warning.hidden = true;
            pill.title = "";
            return;
          }
          const txt = metric.precision !== undefined ? val.toFixed(metric.precision) : String(val);
          numEl.textContent = `${txt}${metric.unit ? ` ${metric.unit}` : ""}`;
          const warn = metric.warnAbove !== undefined && val > metric.warnAbove;
          numEl.classList.toggle("warn", warn);
          pill.classList.toggle("warn", warn);
          warning.hidden = !warn;
          pill.title = warn ? `${copy.aboveThreshold}: ${metric.warnAbove}${metric.unit ? ` ${metric.unit}` : ""}` : "";
        },
      });
    }
    wrap.appendChild(strip);
  }

  return wrap;
};
