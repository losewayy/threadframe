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
import { renderPlot } from "./plot.js";
import { renderSvg } from "./svg.js";
import { renderStats } from "./stats.js";
import { renderTimeline } from "./timeline.js";
import { renderCode } from "./code.js";
import { renderGraph } from "./graph.js";
import { renderTable } from "./table.js";
import { renderActions } from "./actions.js";
import { renderBox, renderDivider, renderIcon, renderInlineAtom } from "./atoms.js";

const registry: { [K in BlockKind]: BlockRenderer<K> } = {
  choices: renderChoices,
  controls: renderControls,
  chart: renderChart,
  compare: renderCompare,
  checklist: renderChecklist,
  architecture: renderArchitecture,
  callout: renderCallout,
  actions: renderActions,
  grid: renderGrid,
  tabs: renderTabs,
  accordion: renderAccordion,
  plot: renderPlot,
  svg: renderSvg,
  stats: renderStats,
  timeline: renderTimeline,
  code: renderCode,
  graph: renderGraph,
  table: renderTable,
  box: renderBox,
  text: renderInlineAtom,
  title: renderInlineAtom,
  caption: renderInlineAtom,
  badge: renderInlineAtom,
  divider: renderDivider,
  icon: renderIcon,
};

export function renderBlock<K extends BlockKind>(
  kind: K, block: BlockByKind[K], context: BlockRenderContext,
): HTMLElement {
  return registry[kind](block, context);
}
