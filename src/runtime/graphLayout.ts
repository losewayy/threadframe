import type { GraphEdge, GraphNode } from "../schema/graph.js";

export interface GraphNodeBox {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface GraphEdgePath {
  from: string;
  to: string;
  label?: string;
  d: string;
  arrow: string;
  labelX: number;
  labelY: number;
}

export interface GraphLayout {
  width: number;
  height: number;
  nodes: GraphNodeBox[];
  edges: GraphEdgePath[];
}

const PADDING = 16;
const LAYER_GAP = 48;
const NODE_GAP = 22;
const EDGE_INSET = 8;

function charWidth(char: string): number {
  return /[\u2E80-\uFFFF]|[^\u0000-\uFFFF]/u.test(char) ? 14 : 8;
}

function textWidth(text: string | undefined): number {
  if (!text) return 0;
  let width = 0;
  for (const char of text) width += charWidth(char);
  return width;
}

function measureNode(node: GraphNode): { width: number; height: number } {
  const subtitle = [node.group, node.role].filter(Boolean).join(" · ");
  const labelWidth = textWidth(node.label) + (node.icon ? 22 : 0);
  const width = Math.max(106, Math.min(264, Math.max(labelWidth, textWidth(subtitle)) + 26));
  return { width, height: subtitle && node.valueFormula ? 76 : subtitle || node.valueFormula ? 60 : 46 };
}

export function fitGraphLabel(text: string, width: number): string {
  if (textWidth(text) <= width) return text;
  let prefix = "";
  let remaining = width - charWidth("…");
  for (const char of text) {
    remaining -= charWidth(char);
    if (remaining < 0) break;
    prefix += char;
  }
  return `${prefix}…`;
}

function edgeKey(edge: GraphEdge): string {
  return `${edge.from}\u0000${edge.to}`;
}

/** Deterministic DFS that classifies back edges so layering never loops on cycles. */
function findBackEdges(nodes: readonly GraphNode[], edges: readonly GraphEdge[]): Set<string> {
  const outgoing = new Map<string, GraphEdge[]>();
  for (const edge of edges) {
    const list = outgoing.get(edge.from);
    if (list) list.push(edge);
    else outgoing.set(edge.from, [edge]);
  }
  const state = new Map<string, 0 | 1 | 2>();
  const back = new Set<string>();
  const visit = (id: string) => {
    state.set(id, 1);
    for (const edge of outgoing.get(id) ?? []) {
      const target = state.get(edge.to) ?? 0;
      if (target === 1) back.add(edgeKey(edge));
      else if (target === 0) visit(edge.to);
    }
    state.set(id, 2);
  };
  for (const node of nodes) {
    if ((state.get(node.id) ?? 0) === 0) visit(node.id);
  }
  return back;
}

function assignLayers(nodes: readonly GraphNode[], edges: readonly GraphEdge[]): Map<string, number> {
  const outgoing = new Map<string, GraphEdge[]>();
  const indegree = new Map<string, number>(nodes.map((node) => [node.id, 0]));
  for (const edge of edges) {
    const list = outgoing.get(edge.from);
    if (list) list.push(edge);
    else outgoing.set(edge.from, [edge]);
    indegree.set(edge.to, (indegree.get(edge.to) ?? 0) + 1);
  }
  const layer = new Map<string, number>(nodes.map((node) => [node.id, 0]));
  const queue = nodes.filter((node) => indegree.get(node.id) === 0).map((node) => node.id);
  for (let head = 0; head < queue.length; head++) {
    const id = queue[head];
    for (const edge of outgoing.get(id) ?? []) {
      layer.set(edge.to, Math.max(layer.get(edge.to) ?? 0, (layer.get(id) ?? 0) + 1));
      const next = (indegree.get(edge.to) ?? 0) - 1;
      indegree.set(edge.to, next);
      if (next === 0) queue.push(edge.to);
    }
  }
  return layer;
}

function sortLayer(
  ids: string[],
  neighbors: ReadonlyMap<string, string[]>,
  positions: ReadonlyMap<string, number>,
  order: ReadonlyMap<string, number>,
  groups: ReadonlyMap<string, string>,
): string[] {
  const score = (id: string) => {
    const adjacent = neighbors.get(id) ?? [];
    if (!adjacent.length) return order.get(id) ?? 0;
    return adjacent.reduce((sum, other) => sum + (positions.get(other) ?? 0), 0) / adjacent.length;
  };
  const group = (id: string) => groups.get(id) ?? "";
  return [...ids].sort((a, b) => score(a) - score(b)
    || group(a).localeCompare(group(b))
    || (order.get(a) ?? 0) - (order.get(b) ?? 0));
}

function layerGroups(nodes: readonly GraphNode[], edges: readonly GraphEdge[]): string[][] {
  const back = findBackEdges(nodes, edges);
  const dag = edges.filter((edge) => !back.has(edgeKey(edge)));
  const layer = assignLayers(nodes, dag);
  const layers: string[][] = [];
  for (const node of nodes) {
    const index = layer.get(node.id) ?? 0;
    if (!layers[index]) layers[index] = [];
    layers[index].push(node.id);
  }
  const compact = layers.filter((ids) => ids?.length);
  const order = new Map<string, number>();
  nodes.forEach((node, index) => order.set(node.id, index));
  const groups = new Map<string, string>();
  for (const node of nodes) if (node.group) groups.set(node.id, node.group);
  const predecessors = new Map<string, string[]>();
  const successors = new Map<string, string[]>();
  for (const edge of dag) {
    predecessors.set(edge.to, [...(predecessors.get(edge.to) ?? []), edge.from]);
    successors.set(edge.from, [...(successors.get(edge.from) ?? []), edge.to]);
  }
  for (let pass = 0; pass < 2; pass++) {
    const positions = new Map<string, number>();
    compact.forEach((ids) => ids.forEach((id, index) => positions.set(id, index)));
    for (let index = 1; index < compact.length; index++) {
      compact[index] = sortLayer(compact[index], predecessors, positions, order, groups);
    }
    compact.forEach((ids) => ids.forEach((id, index) => positions.set(id, index)));
    for (let index = compact.length - 2; index >= 0; index--) {
      compact[index] = sortLayer(compact[index], successors, positions, order, groups);
    }
  }
  return compact;
}

function routeEdge(
  source: GraphNodeBox,
  target: GraphNodeBox,
  edge: GraphEdge,
  direction: "LR" | "TB",
  backward: boolean,
): GraphEdgePath {
  let d: string;
  let arrow: string;
  let labelX: number;
  let labelY: number;
  if (direction === "LR") {
    if (!backward) {
      const sx = source.x + source.width;
      const sy = source.y + source.height / 2;
      const tx = target.x;
      const ty = target.y + target.height / 2;
      const mid = (sx + tx) / 2;
      d = `M${sx},${sy} C${mid},${sy} ${mid},${ty} ${tx},${ty}`;
      arrow = `${tx},${ty} ${tx - EDGE_INSET},${ty - 4} ${tx - EDGE_INSET},${ty + 4}`;
      labelX = mid;
      labelY = (sy + ty) / 2 - 8;
    } else {
      const sx = source.x + source.width / 2;
      const sy = source.y + source.height;
      const tx = target.x + target.width / 2;
      const ty = target.y + target.height;
      const bottom = Math.max(sy, ty) + 26;
      d = `M${sx},${sy} C${sx},${bottom} ${tx},${bottom} ${tx},${ty}`;
      arrow = `${tx},${ty} ${tx - 4},${ty + EDGE_INSET} ${tx + 4},${ty + EDGE_INSET}`;
      labelX = (sx + tx) / 2;
      labelY = bottom;
    }
  } else if (!backward) {
    const sx = source.x + source.width / 2;
    const sy = source.y + source.height;
    const tx = target.x + target.width / 2;
    const ty = target.y;
    const mid = (sy + ty) / 2;
    d = `M${sx},${sy} C${sx},${mid} ${tx},${mid} ${tx},${ty}`;
    arrow = `${tx},${ty} ${tx - 4},${ty - EDGE_INSET} ${tx + 4},${ty - EDGE_INSET}`;
    labelX = (sx + tx) / 2 + 6;
    labelY = mid;
  } else {
    const sx = source.x + source.width;
    const sy = source.y + source.height / 2;
    const tx = target.x + target.width;
    const ty = target.y + target.height / 2;
    const right = Math.max(sx, tx) + 26;
    d = `M${sx},${sy} C${right},${sy} ${right},${ty} ${tx},${ty}`;
    arrow = `${tx},${ty} ${tx + EDGE_INSET},${ty - 4} ${tx + EDGE_INSET},${ty + 4}`;
    labelX = right;
    labelY = (sy + ty) / 2;
  }
  return { from: edge.from, to: edge.to, ...(edge.label ? { label: edge.label } : {}), d, arrow, labelX, labelY };
}

/**
 * Deterministic layered layout for a directed graph. Cycles are layered by ignoring
 * DFS back edges, while every valid edge is still routed for display.
 */
export function layoutGraph(
  nodes: readonly GraphNode[],
  edges: readonly GraphEdge[],
  direction: "LR" | "TB" = "LR",
): GraphLayout {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const valid = edges.filter((edge) => edge.from !== edge.to && byId.has(edge.from) && byId.has(edge.to));
  const back = findBackEdges(nodes, valid);
  const layers = layerGroups(nodes, valid);
  const sizes = new Map(nodes.map((node) => [node.id, measureNode(node)]));
  const layerExtent = layers.map((ids) => Math.max(...ids.map((id) =>
    direction === "LR" ? sizes.get(id)!.width : sizes.get(id)!.height)));
  const layerCross = layers.map((ids) => ids.reduce((sum, id, index) => {
    const size = sizes.get(id)!;
    return sum + (direction === "LR" ? size.height : size.width) + (index ? NODE_GAP : 0);
  }, 0));
  const main = PADDING * 2 + layerExtent.reduce((sum, value) => sum + value, 0) + LAYER_GAP * Math.max(0, layers.length - 1);
  const cross = PADDING * 2 + Math.max(...layerCross) + 28;
  const boxes = new Map<string, GraphNodeBox>();
  let mainOffset = PADDING;
  layers.forEach((ids, layerIndex) => {
    let crossOffset = PADDING + (cross - PADDING * 2 - layerCross[layerIndex]) / 2;
    for (const id of ids) {
      const size = sizes.get(id)!;
      const box: GraphNodeBox = direction === "LR"
        ? { id, x: mainOffset + (layerExtent[layerIndex] - size.width) / 2, y: crossOffset, width: size.width, height: size.height }
        : { id, x: crossOffset, y: mainOffset + (layerExtent[layerIndex] - size.height) / 2, width: size.width, height: size.height };
      boxes.set(id, box);
      crossOffset += (direction === "LR" ? size.height : size.width) + NODE_GAP;
    }
    mainOffset += layerExtent[layerIndex] + LAYER_GAP;
  });
  const nodeBoxes = nodes.map((node) => boxes.get(node.id)!);
  const edgePaths = valid.map((edge) => {
    const source = boxes.get(edge.from)!;
    const target = boxes.get(edge.to)!;
    const backward = direction === "LR"
      ? target.x <= source.x
      : target.y <= source.y;
    return routeEdge(source, target, edge, direction, backward || back.has(edgeKey(edge)));
  });
  return {
    width: Math.ceil(direction === "LR" ? main : cross),
    height: Math.ceil(direction === "LR" ? cross : main),
    nodes: nodeBoxes,
    edges: edgePaths,
  };
}
