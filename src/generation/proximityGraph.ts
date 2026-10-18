import type { Connection } from '../model/types';
import type { Rng } from './rng';

export interface PositionedNode {
  id: string;
  x: number;
  y: number;
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function edgeKey(e: Connection): string {
  return [e.a, e.b].sort().join('::');
}

/** Prim's algorithm: the shortest set of edges that connects every node, so no line is longer than it needs to be. */
export function buildMST(nodes: PositionedNode[]): Connection[] {
  if (nodes.length <= 1) return [];
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const inTree = new Set([nodes[0].id]);
  const remaining = new Set(nodes.slice(1).map((n) => n.id));
  const edges: Connection[] = [];

  while (remaining.size > 0) {
    let bestDist = Infinity;
    let bestFrom = '';
    let bestTo = '';
    for (const fromId of inTree) {
      const from = byId.get(fromId)!;
      for (const toId of remaining) {
        const d = distance(from, byId.get(toId)!);
        if (d < bestDist) {
          bestDist = d;
          bestFrom = fromId;
          bestTo = toId;
        }
      }
    }
    edges.push({ a: bestFrom, b: bestTo });
    inTree.add(bestTo);
    remaining.delete(bestTo);
  }

  return edges;
}

/** Adds a few short nearest-neighbor edges on top of an existing graph, so it isn't a fragile pure tree. */
export function addNearestNeighborEdges(
  rng: Rng,
  nodes: PositionedNode[],
  existing: Connection[],
  neighborCount: number,
  chance: number,
): Connection[] {
  const existingKeys = new Set(existing.map(edgeKey));
  const extra: Connection[] = [];

  for (const node of nodes) {
    const neighbors = nodes
      .filter((n) => n.id !== node.id)
      .map((n) => ({ id: n.id, d: distance(node, n) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, neighborCount);

    for (const neighbor of neighbors) {
      const key = edgeKey({ a: node.id, b: neighbor.id });
      if (existingKeys.has(key)) continue;
      if (rng() > chance) continue;
      existingKeys.add(key);
      extra.push({ a: node.id, b: neighbor.id });
    }
  }

  return extra;
}

/** Builds a natural-looking connected graph: shortest-possible backbone plus a few short redundancy edges. */
export function buildProximityGraph(rng: Rng, nodes: PositionedNode[], neighborCount = 1, extraChance = 0.5): Connection[] {
  const mst = buildMST(nodes);
  const extra = addNearestNeighborEdges(rng, nodes, mst, neighborCount, extraChance);
  return [...mst, ...extra];
}

/** Returns the id of the node closest to a given point. */
export function nearestNode(nodes: PositionedNode[], point: { x: number; y: number }): string {
  let bestId = nodes[0].id;
  let bestDist = Infinity;
  for (const n of nodes) {
    const d = distance(n, point);
    if (d < bestDist) {
      bestDist = d;
      bestId = n.id;
    }
  }
  return bestId;
}

/** Returns the ids of the `count` nodes closest to a given point, nearest first. */
export function nearestNodes(nodes: PositionedNode[], point: { x: number; y: number }, count: number): string[] {
  return nodes
    .map((n) => ({ id: n.id, d: distance(n, point) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, count)
    .map((n) => n.id);
}
