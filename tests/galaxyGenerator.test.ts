import { describe, expect, it } from 'vitest';
import { generateGalaxy, planetTypeDeck } from '../src/generation/galaxyGenerator';
import { SC1, clusterFieldSize, generateCluster, type ClusterStar } from '../src/generation/sc1Cluster';
import { DEFAULT_SCENARIO } from '../src/generation/scenarioConfig';
import { mulberry32 } from '../src/generation/rng';
import type { Connection, GameState, Planet } from '../src/model/types';

function buildAdjacency(planets: Planet[], connections: Connection[]): Map<string, Set<string>> {
  const adjacency = new Map<string, Set<string>>();
  for (const p of planets) adjacency.set(p.id, new Set());
  for (const c of connections) {
    adjacency.get(c.a)!.add(c.b);
    adjacency.get(c.b)!.add(c.a);
  }
  return adjacency;
}

function connectedComponent(start: string, adjacency: Map<string, Set<string>>): Set<string> {
  const visited = new Set<string>([start]);
  const queue = [start];
  while (queue.length) {
    const current = queue.shift()!;
    for (const neighbor of adjacency.get(current) ?? []) {
      if (visited.has(neighbor)) continue;
      visited.add(neighbor);
      queue.push(neighbor);
    }
  }
  return visited;
}

const dist2 = (a: ClusterStar, b: ClusterStar) => (a.along - b.along) ** 2 + (a.across - b.across) ** 2;

const SEEDS = [1, 42, 1337, 99991, 2024];

describe('generateCluster (SC1 rules in 2D)', () => {
  for (const [countA, countB] of [
    [1, 1],
    [6, 6],
    [15, 15],
    [25, 25],
  ]) {
    for (const seed of SEEDS) {
      describe(`${countA}+${countB} stars, seed ${seed}`, () => {
        const cluster = generateCluster(mulberry32(seed), countA, countB);
        const { stars } = cluster;

        it('places the requested number of stars on each side', () => {
          expect(stars.filter((s) => s.side === 'A').length).toBe(countA);
          expect(stars.filter((s) => s.side === 'B').length).toBe(countB);
        });

        it('puts the first star at the centre and each side in its own half', () => {
          expect(stars[0].along).toBe(cluster.centre);
          for (const s of stars.slice(1)) {
            if (s.side === 'A') expect(s.along).toBeGreaterThan(cluster.centre);
            else expect(s.along).toBeLessThan(cluster.centre);
            expect(Math.abs(s.across)).toBeLessThanOrEqual(cluster.halfWidth);
          }
        });

        it('links exactly the pairs closer than LINK_MAX, and keeps every pair at least MIN_DIST apart', () => {
          for (let i = 0; i < stars.length; i++) {
            for (let j = i + 1; j < stars.length; j++) {
              const a = stars[i];
              const b = stars[j];
              const d2 = dist2(a, b);
              expect(d2).toBeGreaterThanOrEqual(SC1.MIN_DIST ** 2);
              expect(a.links.includes(b)).toBe(d2 < SC1.LINK_MAX ** 2);
            }
          }
        });

        it('has no near misses: no unlinked pair inside the window closer than GAP_MAX', () => {
          for (const a of stars) {
            for (const b of stars) {
              if (a === b || a.links.includes(b)) continue;
              const inWindow = Math.abs(a.along - b.along) <= SC1.WINDOW && Math.abs(a.across - b.across) <= SC1.WINDOW;
              if (inWindow) expect(dist2(a, b)).toBeGreaterThanOrEqual(SC1.GAP_MAX ** 2);
            }
          }
        });

        it('caps links at 4 per star and is fully connected', () => {
          for (const s of stars) expect(s.links.length).toBeLessThanOrEqual(SC1.MAX_LINKS);
          const seen = new Set([stars[0]]);
          const queue = [stars[0]];
          while (queue.length) for (const n of queue.shift()!.links) if (!seen.has(n)) seen.add(n), queue.push(n);
          expect(seen.size).toBe(stars.length);
        });
      });
    }
  }

  it('matches SC1’s 3D link stats for a 28-star map (37.8 links, 4.5 dead ends on average)', () => {
    let links = 0;
    let deadEnds = 0;
    const runs = 100;
    for (let seed = 1; seed <= runs; seed++) {
      const { stars } = generateCluster(mulberry32(seed), 14, 14);
      for (const s of stars) {
        links += s.links.length;
        if (s.links.length === 1) deadEnds++;
      }
    }
    expect(links / 2 / runs).toBeGreaterThan(35);
    expect(links / 2 / runs).toBeLessThan(40);
    expect(deadEnds / runs).toBeGreaterThan(3.5);
    expect(deadEnds / runs).toBeLessThan(5.5);
  });

  it('grows the field with the star count', () => {
    expect(clusterFieldSize(28)).toEqual({ halfLength: 140, halfWidth: 118 });
    expect(clusterFieldSize(50).halfWidth).toBeGreaterThan(clusterFieldSize(30).halfWidth);
  });

  it('rejects counts outside SC1’s 2-50 range', () => {
    expect(() => generateCluster(mulberry32(1), 1, 0)).toThrow(RangeError);
    expect(() => generateCluster(mulberry32(1), 26, 25)).toThrow(RangeError);
  });
});

describe('planetTypeDeck', () => {
  it('splits a side into exact counts by largest remainder', () => {
    expect(planetTypeDeck({ life: 0.25, mineral: 0.35, dead: 0.4 }, 15)).toEqual({ life: 4, mineral: 5, dead: 6 });
    expect(planetTypeDeck({ life: 1, mineral: 1, dead: 1 }, 10)).toEqual({ life: 4, mineral: 3, dead: 3 });
  });
});

describe('generateGalaxy', () => {
  for (const seed of SEEDS) {
    describe(`seed ${seed}`, () => {
      const state: GameState = generateGalaxy(DEFAULT_SCENARIO, 'alliance', seed);
      const allianceHome = state.planets.find((p) => p.owner === 'alliance')!;
      const hierarchyHome = state.planets.find((p) => p.owner === 'hierarchy')!;

      it('creates the expected planet count', () => {
        expect(state.planets.length).toBe(DEFAULT_SCENARIO.totalPlanets);
      });

      it('is fully connected', () => {
        const adjacency = buildAdjacency(state.planets, state.connections);
        expect(connectedComponent(state.planets[0].id, adjacency).size).toBe(state.planets.length);
      });

      it('has exactly one homeworld per side, a life world with a starbase', () => {
        for (const owner of ['alliance', 'hierarchy'] as const) {
          const homes = state.planets.filter((p) => p.owner === owner);
          expect(homes.length).toBe(1);
          expect(homes[0].hasStarbase).toBe(true);
          expect(homes[0].type).toBe('life');
          expect(homes[0].explored).toBe(true);
        }
      });

      it('puts each homeworld at the far end of its side, Hierarchy on top', () => {
        expect(hierarchyHome.y).toBe(Math.min(...state.planets.map((p) => p.y)));
        expect(allianceHome.y).toBe(Math.max(...state.planets.map((p) => p.y)));
      });

      it('deals each side exactly its share of planet types', () => {
        // Every Hierarchy star (including the centre star) lies above every Alliance star.
        const byY = [...state.planets].sort((a, b) => a.y - b.y);
        const sides = [byY.slice(0, 15), byY.slice(15)];
        const deck = planetTypeDeck(DEFAULT_SCENARIO.planetTypeWeights, 15);
        for (const side of sides) {
          for (const type of ['life', 'mineral', 'dead'] as const) {
            expect(side.filter((p) => p.type === type).length).toBe(deck[type]);
          }
        }
      });

      it('gives each side its starting ships at its homeworld', () => {
        const allianceShips = state.ships.filter((s) => s.owner === 'alliance');
        const hierarchyShips = state.ships.filter((s) => s.owner === 'hierarchy');
        expect(allianceShips.every((s) => s.planetId === allianceHome.id)).toBe(true);
        expect(hierarchyShips.every((s) => s.planetId === hierarchyHome.id)).toBe(true);
        expect(allianceShips.length).toBe(DEFAULT_SCENARIO.startingShips.alliance.length);
        expect(hierarchyShips.length).toBe(DEFAULT_SCENARIO.startingShips.hierarchy.length);
        expect(allianceShips.every((s) => s.movesRemaining === DEFAULT_SCENARIO.movesPerTurn)).toBe(true);
        expect(allianceShips.every((s) => s.currentCrew === s.crew)).toBe(true);
      });
    });
  }

  it('gives the Hierarchy the extra planet when the total is odd', () => {
    const state = generateGalaxy({ ...DEFAULT_SCENARIO, totalPlanets: 31 }, 'alliance', 7);
    expect(state.planets.length).toBe(31);
  });

  it('is reproducible from a seed', () => {
    const a = generateGalaxy(DEFAULT_SCENARIO, 'alliance', 5);
    const b = generateGalaxy(DEFAULT_SCENARIO, 'alliance', 5);
    expect(a.planets.map((p) => [p.x, p.y, p.type])).toEqual(b.planets.map((p) => [p.x, p.y, p.type]));
  });

  it('sets the chosen human faction and starts with the human going first', () => {
    const asAlliance = generateGalaxy(DEFAULT_SCENARIO, 'alliance', 1);
    expect(asAlliance.humanFaction).toBe('alliance');
    expect(asAlliance.currentFaction).toBe('alliance');

    const asHierarchy = generateGalaxy(DEFAULT_SCENARIO, 'hierarchy', 1);
    expect(asHierarchy.humanFaction).toBe('hierarchy');
    expect(asHierarchy.currentFaction).toBe('hierarchy');
  });
});
