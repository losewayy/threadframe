import { el } from "../core/dom.js";
import type { BlockRenderer } from "../core/types.js";
import { formatNumber } from "../display.js";
import { evaluateFormula, evaluateNumericFormula, evaluateNumericOrNull } from "../formula.js";

function isBarActive(expr: string | undefined, scope: Record<string, number | string | boolean>): boolean {
  if (!expr) return false;
  const val = evaluateFormula(expr, scope);
  if (val === null) return false;
  if (typeof val === "boolean") return val;
  if (typeof val === "number") return val !== 0 && Number.isFinite(val);
  return val.length > 0 && val !== "false" && val !== "0";
}

export const renderChart: BlockRenderer<"chart"> = (block, context) => {
  const { bindings } = context;
  const wrap = el("div");
  const defaultUnit = block.unit ? ` ${block.unit}` : "";

  if (block.mode === "stacked") {
    const ruler = el("div", "iui-chart-ruler");
    ruler.append(el("span", undefined, "0"), el("span", undefined, "25%"), el("span", undefined, "50%"), el("span", undefined, "75%"), el("span", undefined, "100%"));
    wrap.appendChild(ruler);
    const track = el("div", "iui-stacked-track");
    const legend = el("div", "iui-legend");
    const segs: Array<{
      bar: (typeof block.bars)[number];
      seg: HTMLElement;
      valEl: HTMLElement;
    }> = [];

    for (const bar of block.bars) {
      const tone = bar.tone ?? "primary";
      const seg = el("div", `iui-stacked-seg ${tone}`);
      track.appendChild(seg);

      const item = el("span", "iui-legend-item");
      item.appendChild(el("span", `iui-swatch ${tone}`));
      item.appendChild(el("span", undefined, `${bar.label}: `));
      const valEl = el("strong");
      item.appendChild(valEl);
      legend.appendChild(item);

      segs.push({ bar, seg, valEl });
    }

    wrap.appendChild(track);
    wrap.appendChild(legend);

    bindings.push({
      update: (scope) => {
        const rawVals = segs.map((s) =>
          s.bar.formula ? evaluateNumericOrNull(s.bar.formula, scope) : (s.bar.value ?? 0),
        );
        const vals = rawVals.map((v) => v ?? 0);
        const dynamicMax = block.maxFormula
          ? evaluateNumericFormula(block.maxFormula, scope, block.max ?? 100)
          : (block.max ?? Math.max(1, vals.reduce((a, b) => a + b, 0)));

        segs.forEach((s, idx) => {
          s.seg.classList.toggle("active", isBarActive(s.bar.activeFormula, scope));
          const raw = rawVals[idx];
          if (raw === null) {
            s.seg.style.width = "0%";
            s.valEl.textContent = "—";
            return;
          }
          const val = Math.max(0, raw);
          const pct = Math.min(100, (val / Math.max(0.0001, dynamicMax)) * 100);
          s.seg.style.width = `${pct.toFixed(1)}%`;
          s.valEl.textContent = `${formatNumber(val)}${s.bar.unit ? ` ${s.bar.unit}` : defaultUnit}`;
        });
      },
    });
    return wrap;
  }

  const rows: Array<{
    bar: (typeof block.bars)[number];
    row: HTMLElement;
    fill: HTMLElement;
    valEl: HTMLElement;
  }> = [];
  for (const bar of block.bars) {
    const row = el("div", "iui-bar-row");
    const head = el("div", "iui-bar-head");
    head.appendChild(el("span", undefined, bar.label));
    const valEl = el("span", "iui-control-val");
    head.appendChild(valEl);
    row.appendChild(head);

    const track = el("div", "iui-bar-track");
    const fill = el("div", `iui-bar-fill ${bar.tone ?? "primary"}`);
    track.appendChild(fill);
    row.appendChild(track);
    wrap.appendChild(row);
    rows.push({ bar, row, fill, valEl });
  }

  bindings.push({
    update: (scope) => {
      const rawVals = rows.map((r) =>
        r.bar.formula ? evaluateNumericOrNull(r.bar.formula, scope) : (r.bar.value ?? 0),
      );
      const vals = rawVals.map((v) => v ?? 0);
      const maxVal = block.maxFormula
        ? evaluateNumericFormula(block.maxFormula, scope, block.max ?? 100)
        : (block.max ?? Math.max(1, ...vals));

      rows.forEach((r, idx) => {
        r.row.classList.toggle("active", isBarActive(r.bar.activeFormula, scope));
        const raw = rawVals[idx];
        if (raw === null) {
          r.fill.style.width = "0%";
          r.valEl.textContent = "—";
          return;
        }
        const val = Math.max(0, raw);
        const pct = Math.min(100, (val / Math.max(0.0001, maxVal)) * 100);
        r.fill.style.width = `${pct.toFixed(1)}%`;
        r.valEl.textContent = `${formatNumber(val)}${r.bar.unit ? ` ${r.bar.unit}` : defaultUnit}`;
      });
    },
  });

  return wrap;
};
