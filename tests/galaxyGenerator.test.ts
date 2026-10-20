import { describe, expect, it } from 'vitest';
import { generateGalaxy, worldTotal } from '../src/generation/galaxyGenerator';
import { SC1, clusterFieldSize, generateCluster, type ClusterStar } from '../src/generation/sc1Cluster';
import { DEFAULT_SCENARIO } from '../src/generation/scenarioConfig';
import { mulberry32 } from '../src/generation/rng';
import { LAYOUT } from '../src/generation/layout';
import { SC1_PRESETS } from '../src/generation/sc1Presets';
import { sc1ToScenarioConfig } from '../src/generation/sc1Scenario';
import type { Connection, Faction, GameState, Planet, ScenarioConfig } from '../src/model/types';

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
          expect(stars[0].across).toBe(0);
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

const SCENARIOS: ScenarioConfig[] = [DEFAULT_SCENARIO, ...SC1_PRESETS.map(sc1ToScenarioConfig)];
const FACTIONS: Faction[] = ['alliance', 'hierarchy'];

/** Planets on each side: every Hierarchy star lies above every Alliance star. */
function sides(state: GameState): Record<Faction, Planet[]> {
  const byY = [...state.planets].sort((a, b) => a.y - b.y);
  const h = worldTotal(state.scenario.sides.hierarchy.worlds);
  return { hierarchy: byY.slice(0, h), alliance: byY.slice(h) };
}

describe('generateGalaxy', () => {
  for (const scenario of SCENARIOS) {
    for (const seed of SEEDS) {
      describe(`${scenario.title}, seed ${seed}`, () => {
        const state = generateGalaxy(scenario, 'alliance', seed);
        const bySide = sides(state);

        it('has one star per scenario world, and is fully connected', () => {
          expect(state.planets.length).toBe(worldTotal(scenario.sides.alliance.worlds) + worldTotal(scenario.sides.hierarchy.worlds));
          const adjacency = buildAdjacency(state.planets, state.connections);
          expect(connectedComponent(state.planets[0].id, adjacency).size).toBe(state.planets.length);
        });

        it("deals each side exactly its scenario's worlds", () => {
          for (const faction of FACTIONS) {
            const w = scenario.sides[faction].worlds;
            const planets = bySide[faction];
            const count = (type: Planet['type'], improvement?: string, fortified = false) =>
              planets.filter((p) => p.type === type && p.improvement === improvement && !!p.fortified === fortified).length;
            expect(count('dead')).toBe(w.dead);
            expect(count('mineral')).toBe(w.mineral);
            expect(count('life')).toBe(w.life);
            expect(count('life', 'colony')).toBe(w.colony);
            expect(count('life', 'colony', true)).toBe(w.fortifiedColony);
            expect(count('mineral', 'mine')).toBe(w.mine);
            expect(count('mineral', 'mine', true)).toBe(w.fortifiedMine);
            for (const p of planets.filter((p) => p.improvement)) {
              expect(p.owner).toBe(faction);
              expect(p.explored).toBe(true);
            }
          }
        });

        it('puts a starbase on the far end of each side that has one', () => {
          const top = bySide.hierarchy[0];
          const bottom = bySide.alliance[bySide.alliance.length - 1];
          for (const [faction, end] of [['hierarchy', top], ['alliance', bottom]] as const) {
            const bases = state.planets.filter((p) => p.hasStarbase && p.owner === faction);
            expect(bases).toEqual(scenario.sides[faction].starbase ? [end] : []);
          }
        });

        it('gives each side its ships, on stars the enemy does not own', () => {
          for (const faction of FACTIONS) {
            const ships = state.ships.filter((s) => s.owner === faction);
            expect(ships.length).toBe(scenario.sides[faction].ships.length);
            for (const ship of ships) {
              const planet = state.planets.find((p) => p.id === ship.planetId)!;
              expect(planet.explored).toBe(true);
              expect(planet.owner === faction || planet.owner === 'neutral' || state.ships.some((s) => s.planetId === planet.id && s.owner !== faction)).toBe(true);
              if (scenario.sides[faction].ships.every((s) => s.zone < 2)) expect(bySide[faction]).toContain(planet);
            }
          }
        });

        it("starts with each side's Starbucks, and the scenario's first mover", () => {
          expect(state.starbucks.alliance).toBe(scenario.sides.alliance.starbucks);
          expect(state.starbucks.hierarchy).toBe(scenario.sides.hierarchy.starbucks);
          expect(state.currentFaction).toBe(scenario.firstMove ?? 'alliance');
        });
      });
    }
  }

  it('sends zone 2 ships into enemy space', () => {
    const proving = SCENARIOS.find((s) => s.title === 'Proving Ground')!;
    expect(proving.sides.alliance.ships[0].zone).toBe(2);
    for (const seed of SEEDS) {
      const state = generateGalaxy(proving, 'alliance', seed);
      const enemySide = sides(state).hierarchy.map((p) => p.id);
      const allianceShips = state.ships.filter((s) => s.owner === 'alliance');
      expect(allianceShips.filter((s) => enemySide.includes(s.planetId)).length).toBe(1);
    }
  });

  it('draws the centre star in the middle of the map', () => {
    for (const scenario of SCENARIOS) {
      const state = generateGalaxy(scenario, 'alliance', 11);
      const mid = { x: (LAYOUT.xMin + LAYOUT.xMax) / 2, y: (LAYOUT.yMin + LAYOUT.yMax) / 2 };
      expect(state.planets.some((p) => p.x === mid.x && p.y === mid.y)).toBe(true);
    }
  });

  it('is reproducible from a seed', () => {
    const a = generateGalaxy(DEFAULT_SCENARIO, 'alliance', 5);
    const b = generateGalaxy(DEFAULT_SCENARIO, 'alliance', 5);
    expect(a.planets.map((p) => [p.x, p.y, p.type])).toEqual(b.planets.map((p) => [p.x, p.y, p.type]));
  });

  it('lets the human move first when the scenario does not say', () => {
    expect(generateGalaxy(DEFAULT_SCENARIO, 'hierarchy', 1).currentFaction).toBe('hierarchy');
    expect(generateGalaxy(DEFAULT_SCENARIO, 'alliance', 1).currentFaction).toBe('alliance');
  });
});
