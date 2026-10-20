import { SC1, type ClusterStar } from './sc1Cluster';

// Lays SC1's 3D cluster out on a flat map. The links are SC1's and never change; only where the
// stars are drawn does. Each star keeps to its own side of the centre line and stays roughly as
// near to or far from the middle as SC1 put it. Links keep SC1's own lengths (20-38 units), and
// stars that aren't linked are kept apart, so the drawing reads like SC1's spacing.

/** A flat position in SC1 units: `along` is SC1's x axis (side A high), `across` is centred on 0. */
export interface FlatPoint {
  along: number;
  across: number;
}

const ANGLES = 36; // views around the long axis tried as starting points
const TRIES = 4; // best starting views relaxed in full
const SIDE_GAP = 6; // stars stay at least this far from the centre line, on their own side
const APART = 32; // stars that aren't linked stay at least this far apart
const LINK_CLEARANCE = 14; // and at least this far from a link they aren't part of
const LONG_LINK = 42;

type Edge = [ClusterStar, ClusterStar];
type Layout = Map<ClusterStar, FlatPoint>;

const dist = (a: FlatPoint, b: FlatPoint) => Math.hypot(a.along - b.along, a.across - b.across);
const length3d = (a: ClusterStar, b: ClusterStar) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

function nearestOnSegment(p: FlatPoint, a: FlatPoint, b: FlatPoint): FlatPoint {
  const dAlong = b.along - a.along;
  const dAcross = b.across - a.across;
  const len2 = dAlong * dAlong + dAcross * dAcross || 1;
  const t = Math.max(0, Math.min(1, ((p.along - a.along) * dAlong + (p.across - a.across) * dAcross) / len2));
  return { along: a.along + t * dAlong, across: a.across + t * dAcross };
}

function orientation(p: FlatPoint, q: FlatPoint, r: FlatPoint): number {
  return Math.sign((q.along - p.along) * (r.across - p.across) - (q.across - p.across) * (r.along - p.along));
}

function crosses(a: FlatPoint, b: FlatPoint, c: FlatPoint, d: FlatPoint): boolean {
  return orientation(a, b, c) * orientation(a, b, d) < 0 && orientation(c, d, a) * orientation(c, d, b) < 0;
}

function edgesOf(stars: ClusterStar[]): Edge[] {
  return stars.flatMap((s) => s.links.filter((t) => t.index > s.index).map((t): Edge => [s, t]));
}

/** Drawing problems in a layout, worst first: overly long links, stars on links or on each other, crossings. */
export function layoutFlaws(stars: ClusterStar[], pos: Layout) {
  const edges = edgesOf(stars);
  let crossings = 0;
  for (let i = 0; i < edges.length; i++) {
    for (let j = i + 1; j < edges.length; j++) {
      const [a, b] = edges[i];
      const [c, d] = edges[j];
      if (a === c || a === d || b === c || b === d) continue;
      if (crosses(pos.get(a)!, pos.get(b)!, pos.get(c)!, pos.get(d)!)) crossings++;
    }
  }
  let crowded = 0;
  for (let i = 0; i < stars.length; i++) {
    for (let j = i + 1; j < stars.length; j++) {
      if (!stars[i].links.includes(stars[j]) && dist(pos.get(stars[i])!, pos.get(stars[j])!) < 25) crowded++;
    }
  }
  let onLink = 0;
  for (const s of stars) {
    for (const [a, b] of edges) {
      if (s === a || s === b) continue;
      const p = pos.get(s)!;
      if (dist(p, nearestOnSegment(p, pos.get(a)!, pos.get(b)!)) < 10) onLink++;
    }
  }
  const longLinks = edges.filter(([a, b]) => dist(pos.get(a)!, pos.get(b)!) > LONG_LINK).length;
  return { longLinks, onLink, crowded, crossings };
}

function score(stars: ClusterStar[], pos: Layout): number {
  const f = layoutFlaws(stars, pos);
  return f.longLinks * 5 + f.onLink * 4 + f.crowded * 4 + f.crossings;
}

/** SC1's cluster seen from one angle around its long axis. */
function view(stars: ClusterStar[], step: number): Layout {
  const angle = (step * Math.PI) / ANGLES;
  const [c, s] = [Math.cos(angle), Math.sin(angle)];
  return new Map(stars.map((t) => [t, { along: t.x - SC1.CENTRE, across: t.y * c - t.z * s }]));
}

function relax(stars: ClusterStar[], start: Layout): Layout {
  // Works on plain arrays indexed like `stars`; this runs thousands of rounds.
  const n = stars.length;
  const along = Float64Array.from(stars, (s) => start.get(s)!.along);
  const across = Float64Array.from(stars, (s) => start.get(s)!.across);
  const home = Float64Array.from(stars, (s) => s.x - SC1.CENTRE);
  const sideA = stars.map((s) => s.side === 'A');
  const fixed = stars.map((s) => s.index === 0);
  const slot = new Map(stars.map((s, i) => [s, i]));
  const linked = new Uint8Array(n * n);
  const target = new Float64Array(n * n);
  const edges: [number, number][] = [];
  for (const [a, b] of edgesOf(stars)) {
    const [i, j] = [slot.get(a)!, slot.get(b)!];
    linked[i * n + j] = linked[j * n + i] = 1;
    target[i * n + j] = target[j * n + i] = length3d(a, b);
    edges.push([i, j]);
  }
  for (let i = 0; i < n; i++) if (fixed[i]) along[i] = across[i] = 0;

  const keepToSide = (i: number) => {
    along[i] = sideA[i] ? Math.max(along[i], SIDE_GAP) : Math.min(along[i], -SIDE_GAP);
  };
  /** Nearest point to star k on link (i, j), as [along, across]. */
  const nearest = (k: number, i: number, j: number): [number, number] => {
    const da = along[j] - along[i];
    const dc = across[j] - across[i];
    const t = Math.max(0, Math.min(1, ((along[k] - along[i]) * da + (across[k] - across[i]) * dc) / (da * da + dc * dc || 1)));
    return [along[i] + t * da, across[i] + t * dc];
  };

  // 1. Spring layout: links pull toward their SC1 length, other stars push apart, and every
  //    star is drawn gently back toward its SC1 distance from the centre.
  const ROUNDS = 150;
  const fa = new Float64Array(n);
  const fc = new Float64Array(n);
  for (let round = 0; round < ROUNDS; round++) {
    const step = 1 - round / ROUNDS + 0.1;
    fa.fill(0);
    fc.fill(0);
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const d = Math.hypot(along[j] - along[i], across[j] - across[i]) || 0.01;
        const k = linked[i * n + j] ? (d - target[i * n + j]) * 0.5 : d < 48 ? -(48 - d) * 0.3 : 0;
        if (k === 0) continue;
        const ua = ((along[j] - along[i]) / d) * k;
        const uc = ((across[j] - across[i]) / d) * k;
        fa[i] += ua;
        fc[i] += uc;
        fa[j] -= ua;
        fc[j] -= uc;
      }
    }
    for (let k = 0; k < n; k++) {
      for (const [i, j] of edges) {
        if (k === i || k === j) continue;
        const [qa, qc] = nearest(k, i, j);
        const d = Math.hypot(along[k] - qa, across[k] - qc) || 0.01;
        if (d >= 16) continue;
        const ua = ((along[k] - qa) / d) * (16 - d) * 0.3;
        const uc = ((across[k] - qc) / d) * (16 - d) * 0.3;
        fa[k] += ua;
        fc[k] += uc;
        fa[i] -= ua / 2;
        fc[i] -= uc / 2;
        fa[j] -= ua / 2;
        fc[j] -= uc / 2;
      }
    }
    for (let i = 0; i < n; i++) {
      if (fixed[i]) continue;
      fa[i] += (home[i] - along[i]) * 0.02;
      const size = Math.hypot(fa[i], fc[i]);
      const scale = (size > 6 ? 6 / size : 1) * step;
      along[i] += fa[i] * scale;
      across[i] += fc[i] * scale;
      keepToSide(i);
    }
  }

  // 2. Hard limits: stars apart and off other links, then links back within SC1's 20-38.
  const move = (i: number, da: number, dc: number) => {
    if (fixed[i]) return;
    along[i] += da;
    across[i] += dc;
    keepToSide(i);
  };
  const holdDistance = (i: number, j: number, min: number, max: number) => {
    const d = Math.hypot(along[j] - along[i], across[j] - across[i]) || 0.01;
    const goal = Math.min(Math.max(d, min), max);
    if (goal === d) return;
    const share = (d - goal) / d / (fixed[i] || fixed[j] ? 1 : 2);
    const [da, dc] = [(along[j] - along[i]) * share, (across[j] - across[i]) * share];
    move(i, da, dc);
    move(j, -da, -dc);
  };
  for (let round = 0; round < 80; round++) {
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (!linked[i * n + j]) holdDistance(i, j, APART, Infinity);
    for (let k = 0; k < n; k++) {
      for (const [i, j] of edges) {
        if (k === i || k === j) continue;
        const [qa, qc] = nearest(k, i, j);
        const d = Math.hypot(along[k] - qa, across[k] - qc) || 0.01;
        if (d >= LINK_CLEARANCE) continue;
        const f = (LINK_CLEARANCE - d) / d / 2;
        const [da, dc] = [(along[k] - qa) * f, (across[k] - qc) * f];
        move(k, da, dc);
        move(i, -da / 2, -dc / 2);
        move(j, -da / 2, -dc / 2);
      }
    }
    for (const [i, j] of edges) holdDistance(i, j, SC1.MIN_DIST, SC1.LINK_MAX);
  }
  return new Map(stars.map((s, i) => [s, { along: along[i], across: across[i] }]));
}

/** Flat positions for SC1's cluster, in SC1 units with the centre star at (0, 0). */
export function flattenCluster(stars: ClusterStar[]): Layout {
  const starts = Array.from({ length: ANGLES }, (_, step) => step)
    .map((step) => ({ step, flaws: layoutFlaws(stars, view(stars, step)) }))
    .sort((a, b) => a.flaws.crossings * 3 + a.flaws.crowded + a.flaws.onLink - (b.flaws.crossings * 3 + b.flaws.crowded + b.flaws.onLink))
    .slice(0, TRIES);
  let best: Layout | null = null;
  let bestScore = Infinity;
  for (const { step } of starts) {
    const pos = relax(stars, view(stars, step));
    const s = score(stars, pos);
    if (s < bestScore) [best, bestScore] = [pos, s];
  }
  return best!;
}
