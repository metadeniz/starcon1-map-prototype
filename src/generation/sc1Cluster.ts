import type { Rng } from './rng';
import { randInt } from './rng';

// A 2D port of Star Control 1's star cluster generator (STARCON.EXE, 0628:216C).
// Stars are placed one at a time by rejection sampling, and links are exactly the pairs
// closer than LINK_MAX. Every distance rule below is SC1's own, in SC1's units.
// The one 2D change is the field size: SC1 fills a 3D cylinder, and a flat field with the
// same rules fills up much sooner, so the field is larger and grows with the star count.
// It is sized so link counts, dead ends and degree spread match the 3D original.
export const SC1 = {
  /** Closer than this to any star: position rejected. */
  MIN_DIST: 20,
  /** At least MIN_DIST and closer than this: the two stars are linked. */
  LINK_MAX: 38,
  /** At least LINK_MAX and closer than this: rejected, so stars are either linked or clearly apart. */
  GAP_MAX: 60,
  /** Only stars within this distance on both axes are checked (SC1's box test). */
  WINDOW: 40,
  /** A new star may link to at most this many existing stars... */
  MAX_NEW_LINKS: 3,
  /** ...and no star may ever have more than this many. */
  MAX_LINKS: 4,
  /** Stars closer than this to the centre are a side's front; the rest are its back. */
  FRONT: 47,
} as const;

// Field size for a 28-star map, in SC1 units. SC1's cylinder is 85 per half by 118 radius;
// a 2D field of 140 per half by 118 matches SC1's 3D link stats. Both grow by sqrt(n / 28).
const HALF_LENGTH_AT_28 = 140;
const HALF_WIDTH_AT_28 = 118;
const EDGE = 10; // SC1 keeps stars 10 units in from the end of each half
const SC1_SPAN = 85; // positions per half in SC1 (x 10-94)
const MAX_TRIES_PER_STAR = 5000;

export type ClusterSide = 'A' | 'B';

export interface ClusterStar {
  /** Placement order. Star 0 sits at the exact centre. */
  index: number;
  /** Position along the split axis. Side A is the high half, side B the low half. */
  along: number;
  /** Position across the field, centred on 0. */
  across: number;
  side: ClusterSide;
  links: ClusterStar[];
}

export interface Cluster {
  stars: ClusterStar[];
  halfLength: number;
  halfWidth: number;
  /** `along` coordinate of the centre star. */
  centre: number;
}

export function clusterFieldSize(total: number): { halfLength: number; halfWidth: number } {
  const k = Math.sqrt(total / 28);
  return { halfLength: Math.round(HALF_LENGTH_AT_28 * k), halfWidth: Math.round(HALF_WIDTH_AT_28 * k) };
}

/**
 * Builds a cluster with `countA` stars on the high half and `countB` on the low half.
 * Sides alternate placements (even placements go to A) until one runs out, as in SC1.
 * SC1 would loop forever if the field filled up; here the whole cluster restarts instead.
 */
export function generateCluster(rng: Rng, countA: number, countB: number): Cluster {
  const total = countA + countB;
  if (total < 2 || total > 50) throw new RangeError(`SC1 clusters need 2-50 stars, got ${total}`);
  for (;;) {
    const cluster = tryGenerate(rng, countA, countB);
    if (cluster) return cluster;
  }
}

function tryGenerate(rng: Rng, countA: number, countB: number): Cluster | null {
  const total = countA + countB;
  const { halfLength, halfWidth } = clusterFieldSize(total);
  const span = halfLength - EDGE; // positions per half
  const centre = EDGE + span;
  const stars: ClusterStar[] = [];

  for (let i = 0; i < total; i++) {
    let placed = false;
    for (let attempt = 0; attempt < MAX_TRIES_PER_STAR && !placed; attempt++) {
      const toA = countA > 0 && (i % 2 === 0 || countB === 0);
      // The first star sits at the exact centre of the map. (SC1 puts it on the middle plane,
      // a few units off the cylinder's axis; on a flat map the true centre is the equivalent.)
      const along = i === 0 ? centre : EDGE + randInt(rng, span) + (toA ? span + 1 : 0);
      const across = i === 0 ? 0 : randInt(rng, 2 * halfWidth + 1) - halfWidth;

      const candidates = linkCandidates(stars, along, across);
      if (!candidates) continue;
      if (i > 0 && candidates.length === 0) continue; // must connect to the cluster
      if (i <= 4 && candidates.length < (i + 1) >> 1) continue; // stars 3 and 4 need two links

      const star: ClusterStar = { index: i, along, across, side: toA ? 'A' : 'B', links: [] };
      for (const other of candidates) {
        star.links.push(other);
        other.links.push(star);
      }
      stars.push(star);
      if (toA) countA--;
      else countB--;
      placed = true;
    }
    if (!placed) return null;
  }
  return { stars, halfLength, halfWidth, centre };
}

/** The stars a new star at (along, across) would link to, or null if the spot breaks a rule. */
function linkCandidates(stars: ClusterStar[], along: number, across: number): ClusterStar[] | null {
  const candidates: ClusterStar[] = [];
  for (const s of stars) {
    const da = s.along - along;
    const dc = s.across - across;
    if (Math.abs(da) > SC1.WINDOW || Math.abs(dc) > SC1.WINDOW) continue;
    if (da === 0) return null; // SC1 never lets two stars share a coordinate on the split axis
    const d2 = da * da + dc * dc;
    if (d2 < SC1.MIN_DIST ** 2) return null;
    if (d2 < SC1.LINK_MAX ** 2) {
      if (candidates.length === SC1.MAX_NEW_LINKS || s.links.length === SC1.MAX_LINKS) return null;
      candidates.push(s);
    } else if (d2 < SC1.GAP_MAX ** 2) {
      return null;
    }
  }
  return candidates;
}

/**
 * SC1 splits each side into back and front at 47 of its 85 units from the centre. The 2D field
 * is longer, so the split is scaled to the same share of each half.
 */
export function isFrontStar(cluster: Cluster, star: ClusterStar): boolean {
  const span = cluster.centre - EDGE;
  return Math.abs(star.along - cluster.centre) < (SC1.FRONT * span) / SC1_SPAN;
}
