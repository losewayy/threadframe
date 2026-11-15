import type { BlockByKind, BlockKind, BlockRenderContext, BlockRenderer } from "../core/types.js";
import { renderChoices } from "./choices.js";
import { renderControls } from "./controls.js";
import { renderChart } from "./chart.js";
import { renderCompare } from "./compare.js";
import { renderChecklist } from "./checklist.js";
import { renderArchitecture } from "./architecture.js";
import { renderCallout } from "./callout.js";
import { renderGrid } from "./grid.js";
import { renderTabs } from "./tabs.js";
import { renderAccordion } from "./accordion.js";

const registry: { [K in BlockKind]: BlockRenderer<K> } = {
  choices: renderChoices,
  controls: renderControls,
  chart: renderChart,
  compare: renderCompare,
  checklist: renderChecklist,
  architecture: renderArchitecture,
  callout: renderCallout,
  grid: renderGrid,
  tabs: renderTabs,
  accordion: renderAccordion,
};

export function renderBlock<K extends BlockKind>(
  kind: K, block: BlockByKind[K], context: BlockRenderContext,
): HTMLElement {
  return registry[kind](block, context);
}
