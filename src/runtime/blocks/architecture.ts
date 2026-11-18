import { el, icon } from "../core/dom.js";
import type { BlockRenderer } from "../core/types.js";

export const renderArchitecture: BlockRenderer<"architecture"> = (block, context) => {
  const { state } = context;
  const key = state.containerKey(block);
  const wrap = el("div");
  const layersEl = el("div", "iui-arch-layers");
  const detailBox = el("div", "iui-arch-detail");
  detailBox.setAttribute("role", "status");
  const nodeButtons: Array<{ id: string; btn: HTMLButtonElement; detail: string }> = [];

  const selectNode = (id: string) => {
    state.nodeSelections.set(key, id);
    for (const item of nodeButtons) {
      item.btn.classList.toggle("selected", item.id === id);
      item.btn.setAttribute("aria-pressed", String(item.id === id));
      if (item.id === id) {
        detailBox.textContent = item.detail;
      }
    }
  };

  for (const layer of block.layers) {
    if (layersEl.childElementCount) {
      const connector = el("div", "iui-arch-connector");
      connector.appendChild(icon("arrow"));
      layersEl.appendChild(connector);
    }
    const layerWrap = el("div");
    layerWrap.appendChild(el("div", "iui-arch-layer-title", layer.layer));
    const nodesGrid = el("div", "iui-arch-nodes");
    for (const node of layer.nodes) {
      const btn = el("button", "iui-arch-node");
      btn.type = "button";
      if (node.icon) {
        const pictogram = icon(node.icon);
        pictogram.classList.add("iui-arch-icon");
        btn.appendChild(pictogram);
      }
      btn.appendChild(el("span", "iui-choice-label", node.label));
      btn.appendChild(
        el("span", "iui-choice-desc", node.badge ? `${node.role} · ${node.badge}` : node.role),
      );
      const detailText = `${node.label}: ${node.detail ?? node.role}`;
      btn.addEventListener("click", () => selectNode(node.id));
      nodeButtons.push({ id: node.id, btn, detail: detailText });
      nodesGrid.appendChild(btn);
    }
    layerWrap.appendChild(nodesGrid);
    layersEl.appendChild(layerWrap);
  }

  wrap.appendChild(layersEl);
  wrap.appendChild(detailBox);
  const initial = nodeButtons.find((item) => item.id === state.nodeSelections.get(key)) ?? nodeButtons[0];
  if (initial) selectNode(initial.id);
  return wrap;
};
