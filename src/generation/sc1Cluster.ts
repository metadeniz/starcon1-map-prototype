// Star Control 1's star cluster generator, ported from STARCON.EXE (0628:216C) together with
// the Microsoft C rand() it calls (214F:0112). The constants and the order of rand() calls
// match the original, so a given seed builds the same cluster the game would.
//
// Stars are points in a cylinder: x runs along it (side B 10-94, side A 96-180, the first star
// at 95), and y/z lie in a disc of radius 118. Stars are placed one at a time by rejection
// sampling, and two stars are linked exactly when they are closer than LINK_MAX.

/** Microsoft C runtime rand(): a 32-bit LCG returning bits 16-30. */
export class MscRand {
  private state: number;
  constructor(seed: number) {
    this.state = seed & 0xffff; // srand() keeps a 16-bit seed
  }
  next(): number {
    this.state = (Math.imul(this.state, 214013) + 2531011) >>> 0;
    return (this.state >>> 16) & 0x7fff;
  }
}

export const SC1 = {
  /** Closer than this to any star: position rejected. */
  MIN_DIST: 20,
  /** At least MIN_DIST and closer than this: the two stars are linked. */
  LINK_MAX: 38,
  /** At least LINK_MAX and closer than this: rejected, so stars are either linked or clearly apart. */
  GAP_MAX: 60,
  /** Only stars within this distance on every axis are checked. */
  WINDOW: 40,
  /** A new star may link to at most this many existing stars... */
  MAX_NEW_LINKS: 3,
  /** ...and no star may ever have more than this many. */
  MAX_LINKS: 4,
  RADIUS: 118,
  /** x of the first star, where the two sides meet. */
  CENTRE: 95,
  /** Stars closer than this to the centre (in x) are a side's front; the rest are its back. */
  FRONT: 47,
} as const;

export type ClusterSide = 'A' | 'B';

export interface ClusterStar {
  /** Placement order. Star 0 is the first, central star. */
  index: number;
  x: number;
  y: number;
  z: number;
  /** A = the high-x half, B = the low-x half. */
  side: ClusterSide;
  links: ClusterStar[];
}

/**
 * Builds a cluster with `countA` stars on the high-x half and `countB` on the low-x half.
 * Sides alternate placements (even placements go to A) until one runs out, as in SC1.
 */
export function generateCluster(rng: MscRand, countA: number, countB: number): ClusterStar[] {
  const total = countA + countB;
  if (total < 2 || total > 50) throw new RangeError(`SC1 clusters need 2-50 stars, got ${total}`);
  const list: ClusterStar[] = []; // kept sorted by x, as the original scans it

  for (let i = 0; i < total; i++) {
    let x = 0;
    let y = 0;
    let z = 0;
    let candidates: ClusterStar[] = [];
    let insertAt = -1;
    let first = i === 0;

    for (;;) {
      if (first) {
        [x, y, z] = [SC1.CENTRE, 10, rng.next() % 20];
        first = false;
      } else {
        x = (rng.next() % 85) + 10;
        if (countA !== 0 && ((i & 1) === 0 || countB === 0)) x += 86;
        do {
          y = (rng.next() % 236) - 118;
          z = (rng.next() % 236) - 118;
        } while ((y === 0 && z === 0) || y * y + z * z > SC1.RADIUS ** 2);
      }

      candidates = [];
      insertAt = -1;
      let ok = true;
      for (let k = 0; k < list.length; k++) {
        const s = list[k];
        const dx = s.x - x;
        if (dx < -SC1.WINDOW) continue;
        if (dx === 0) {
          ok = false; // no two stars share an x
          break;
        }
        if (dx > 0) {
          if (insertAt < 0) insertAt = k;
          if (dx > SC1.WINDOW) break;
        }
        if (Math.abs(s.y - y) > SC1.WINDOW || Math.abs(s.z - z) > SC1.WINDOW) continue;
        const d2 = dx * dx + (s.y - y) ** 2 + (s.z - z) ** 2;
        if (d2 < SC1.MIN_DIST ** 2) {
          ok = false;
          break;
        }
        if (d2 < SC1.LINK_MAX ** 2) {
          if (candidates.length === SC1.MAX_NEW_LINKS || s.links.length === SC1.MAX_LINKS) {
            ok = false;
            break;
          }
          candidates.push(s);
        } else if (d2 < SC1.GAP_MAX ** 2) {
          ok = false; // near miss
          break;
        }
      }
      if (!ok) continue;
      if (i !== 0) {
        if (candidates.length === 0) continue; // must connect to the cluster
        if (i <= 4 && candidates.length < (i + 1) >> 1) continue; // stars 3 and 4 need two links
      }
      break;
    }

    let side: ClusterSide;
    if (countB !== 0 && ((i & 1) !== 0 || countA === 0)) {
      countB--;
      side = 'B';
    } else {
      countA--;
      side = 'A';
    }
    const star: ClusterStar = { index: i, x, y, z, side, links: [] };
    for (const c of candidates) {
      star.links.push(c);
      c.links.push(star);
    }
    if (insertAt < 0) list.push(star);
    else list.splice(insertAt, 0, star);
  }

  // SC1 then rolls three name numbers per star, in x order; keep the rand() sequence in step.
  for (let k = 0; k < list.length * 3; k++) rng.next();
  return list.sort((a, b) => a.index - b.index);
}

export function isFrontStar(star: ClusterStar): boolean {
  return Math.abs(star.x - SC1.CENTRE) < SC1.FRONT;
}
