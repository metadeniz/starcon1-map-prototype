import { describe, expect, it } from 'vitest';
import { generateGalaxy, resolveNeckSize } from '../src/generation/galaxyGenerator';
import { DEFAULT_SCENARIO } from '../src/generation/scenarioConfig';
import { LAYOUT } from '../src/generation/layout';
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

function connectedComponent(start: string, adjacency: Map<string, Set<string>>, blocked: Set<string> = new Set()): Set<string> {
  const visited = new Set<string>([start]);
  const queue = [start];
  while (queue.length) {
    const current = queue.shift()!;
    for (const neighbor of adjacency.get(current) ?? []) {
      if (blocked.has(neighbor) || visited.has(neighbor)) continue;
      visited.add(neighbor);
      queue.push(neighbor);
    }
  }
  return visited;
}

/**
 * Classifies a planet by which fixed layout band its y falls in. Generation always places
 * Hierarchy in LAYOUT.topY, the neck in LAYOUT.chokeY, and Alliance in LAYOUT.bottomY, with
 * comfortable gaps between bands, so this is a reliable black-box way to tell them apart
 * without relying on any internal "which region" tag.
 */
function regionOf(y: number): 'top' | 'neck' | 'bottom' {
  const topNeckMid = (LAYOUT.topY[1] + LAYOUT.chokeY[0]) / 2;
  const neckBottomMid = (LAYOUT.chokeY[1] + LAYOUT.bottomY[0]) / 2;
  if (y < topNeckMid) return 'top';
  if (y < neckBottomMid) return 'neck';
  return 'bottom';
}

const SEEDS = [1, 42, 1337, 99991, 2024];

describe('generateGalaxy', () => {
  for (const seed of SEEDS) {
    describe(`seed ${seed}`, () => {
      const state: GameState = generateGalaxy(DEFAULT_SCENARIO, 'alliance', seed);

      it('creates the expected planet count', () => {
        expect(state.planets.length).toBe(DEFAULT_SCENARIO.totalPlanets);
      });

      it('splits planets evenly between the two sides, with the neck absorbing any odd leftover', () => {
        const regions = state.planets.map((p) => regionOf(p.y));
        const topCount = regions.filter((r) => r === 'top').length;
        const bottomCount = regions.filter((r) => r === 'bottom').length;
        const neckCount = regions.filter((r) => r === 'neck').length;

        expect(topCount).toBe(bottomCount);
        expect(topCount * 2 + neckCount).toBe(DEFAULT_SCENARIO.totalPlanets);
        // Default scenario neck is random 2-4, but an odd total-minus-neck bumps it by one.
        expect(neckCount).toBeGreaterThanOrEqual(2);
        expect(neckCount).toBeLessThanOrEqual(5);
      });

      it('is fully connected', () => {
        const adjacency = buildAdjacency(state.planets, state.connections);
        const reached = connectedComponent(state.planets[0].id, adjacency);
        expect(reached.size).toBe(state.planets.length);
      });

      it('has exactly one alliance and one hierarchy homeworld with a starbase', () => {
        const allianceHomes = state.planets.filter((p) => p.owner === 'alliance');
        const hierarchyHomes = state.planets.filter((p) => p.owner === 'hierarchy');
        expect(allianceHomes.length).toBe(1);
        expect(hierarchyHomes.length).toBe(1);
        expect(allianceHomes[0].hasStarbase).toBe(true);
        expect(allianceHomes[0].type).toBe('life');
        expect(hierarchyHomes[0].hasStarbase).toBe(true);
        expect(hierarchyHomes[0].type).toBe('life');
      });

      it('places the Hierarchy on top and the Alliance on the bottom', () => {
        const allianceHome = state.planets.find((p) => p.owner === 'alliance')!;
        const hierarchyHome = state.planets.find((p) => p.owner === 'hierarchy')!;
        expect(hierarchyHome.y).toBeLessThan(allianceHome.y);
      });

      it('never places a homeworld on a planet directly linked to the neck', () => {
        const allianceHome = state.planets.find((p) => p.owner === 'alliance')!;
        const hierarchyHome = state.planets.find((p) => p.owner === 'hierarchy')!;
        const adjacency = buildAdjacency(state.planets, state.connections);
        const neckIds = new Set(state.planets.filter((p) => regionOf(p.y) === 'neck').map((p) => p.id));

        const allianceTouchesNeck = [...adjacency.get(allianceHome.id)!].some((id) => neckIds.has(id));
        const hierarchyTouchesNeck = [...adjacency.get(hierarchyHome.id)!].some((id) => neckIds.has(id));
        expect(allianceTouchesNeck).toBe(false);
        expect(hierarchyTouchesNeck).toBe(false);
      });

      it('disconnects the two sides if the neutral neck is removed', () => {
        const allianceHome = state.planets.find((p) => p.owner === 'alliance')!;
        const hierarchyHome = state.planets.find((p) => p.owner === 'hierarchy')!;

        // The two homeworlds ARE connected in the full graph...
        const adjacency = buildAdjacency(state.planets, state.connections);
        const fullReach = connectedComponent(allianceHome.id, adjacency);
        expect(fullReach.has(hierarchyHome.id)).toBe(true);

        // ...but NOT connected once every neutral planet (only homeworlds are non-neutral
        // at generation time) is removed, proving every path between the two sides passes
        // through the neutral neck.
        const neutralIds = new Set(state.planets.filter((p) => p.owner === 'neutral').map((p) => p.id));
        const reachWithoutNeutral = connectedComponent(allianceHome.id, adjacency, neutralIds);
        expect(reachWithoutNeutral.has(hierarchyHome.id)).toBe(false);
      });

      it('connects the neck to at least 2 planets on each side', () => {
        const regionById = new Map(state.planets.map((p) => [p.id, regionOf(p.y)]));
        let topLinks = 0;
        let bottomLinks = 0;
        for (const c of state.connections) {
          const ra = regionById.get(c.a)!;
          const rb = regionById.get(c.b)!;
          if (ra === 'neck' && rb === 'top') topLinks++;
          if (rb === 'neck' && ra === 'top') topLinks++;
          if (ra === 'neck' && rb === 'bottom') bottomLinks++;
          if (rb === 'neck' && ra === 'bottom') bottomLinks++;
        }
        expect(topLinks).toBeGreaterThanOrEqual(2);
        expect(bottomLinks).toBeGreaterThanOrEqual(2);
      });

      it('has at least 2 distinct planets in each side bridging to the neck (not one planet with two edges)', () => {
        const regionById = new Map(state.planets.map((p) => [p.id, regionOf(p.y)]));
        const topBridgePlanets = new Set<string>();
        const bottomBridgePlanets = new Set<string>();
        for (const c of state.connections) {
          const ra = regionById.get(c.a)!;
          const rb = regionById.get(c.b)!;
          if (ra === 'neck' && rb === 'top') topBridgePlanets.add(c.b);
          if (rb === 'neck' && ra === 'top') topBridgePlanets.add(c.a);
          if (ra === 'neck' && rb === 'bottom') bottomBridgePlanets.add(c.b);
          if (rb === 'neck' && ra === 'bottom') bottomBridgePlanets.add(c.a);
        }
        expect(topBridgePlanets.size).toBeGreaterThanOrEqual(2);
        expect(bottomBridgePlanets.size).toBeGreaterThanOrEqual(2);
      });

      it('connects every neck planet directly to every other neck planet', () => {
        const neckIds = state.planets.filter((p) => regionOf(p.y) === 'neck').map((p) => p.id);
        const adjacency = buildAdjacency(state.planets, state.connections);
        for (let i = 0; i < neckIds.length; i++) {
          for (let j = i + 1; j < neckIds.length; j++) {
            expect(adjacency.get(neckIds[i])!.has(neckIds[j])).toBe(true);
          }
        }
      });

      it('gives each side its starting ships at its homeworld', () => {
        const allianceHome = state.planets.find((p) => p.owner === 'alliance')!;
        const hierarchyHome = state.planets.find((p) => p.owner === 'hierarchy')!;
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

  it('sets the chosen human faction and starts with the human going first', () => {
    const asAlliance = generateGalaxy(DEFAULT_SCENARIO, 'alliance', 1);
    expect(asAlliance.humanFaction).toBe('alliance');
    expect(asAlliance.currentFaction).toBe('alliance');

    const asHierarchy = generateGalaxy(DEFAULT_SCENARIO, 'hierarchy', 1);
    expect(asHierarchy.humanFaction).toBe('hierarchy');
    expect(asHierarchy.currentFaction).toBe('hierarchy');
  });

  describe('neckSize: fixed 0 (no neck)', () => {
    const scenario = { ...DEFAULT_SCENARIO, totalPlanets: 16, neckSize: { type: 'fixed' as const, size: 0 } };
    for (const seed of SEEDS) {
      it(`seed ${seed} splits into two equal sides with a direct bridge`, () => {
        const state = generateGalaxy(scenario, 'alliance', seed);
        expect(state.planets.length).toBe(16);
        const regions = state.planets.map((p) => regionOf(p.y));
        expect(regions.filter((r) => r === 'neck').length).toBe(0);
        expect(regions.filter((r) => r === 'top').length).toBe(8);
        expect(regions.filter((r) => r === 'bottom').length).toBe(8);
      });
    }
  });

  describe('neckSize: fixed 3 (within the 2-4 recommended range)', () => {
    const scenario = { ...DEFAULT_SCENARIO, totalPlanets: 31, neckSize: { type: 'fixed' as const, size: 3 } };
    for (const seed of SEEDS) {
      it(`seed ${seed} gives exactly 3 neck planets and equal sides`, () => {
        const state = generateGalaxy(scenario, 'alliance', seed);
        expect(state.planets.length).toBe(31);
        const regions = state.planets.map((p) => regionOf(p.y));
        expect(regions.filter((r) => r === 'neck').length).toBe(3);
        expect(regions.filter((r) => r === 'top').length).toBe(14);
        expect(regions.filter((r) => r === 'bottom').length).toBe(14);

        const neckIds = state.planets.filter((p) => regionOf(p.y) === 'neck').map((p) => p.id);
        const adjacency = buildAdjacency(state.planets, state.connections);
        for (let i = 0; i < neckIds.length; i++) {
          for (let j = i + 1; j < neckIds.length; j++) {
            expect(adjacency.get(neckIds[i])!.has(neckIds[j])).toBe(true);
          }
        }
      });
    }
  });

  describe('neckSize: custom random range', () => {
    const scenario = { ...DEFAULT_SCENARIO, totalPlanets: 40, neckSize: { type: 'random' as const, min: 5, max: 7 } };
    for (const seed of SEEDS) {
      it(`seed ${seed} keeps the neck within the configured range (± parity fix-up)`, () => {
        const state = generateGalaxy(scenario, 'alliance', seed);
        const regions = state.planets.map((p) => regionOf(p.y));
        const neckCount = regions.filter((r) => r === 'neck').length;
        expect(neckCount).toBeGreaterThanOrEqual(5);
        expect(neckCount).toBeLessThanOrEqual(8);

        const neckIds = state.planets.filter((p) => regionOf(p.y) === 'neck').map((p) => p.id);
        const adjacency = buildAdjacency(state.planets, state.connections);
        for (let i = 0; i < neckIds.length; i++) {
          for (let j = i + 1; j < neckIds.length; j++) {
            expect(adjacency.get(neckIds[i])!.has(neckIds[j])).toBe(true);
          }
        }
      });
    }
  });
});

describe('resolveNeckSize', () => {
  it('returns the fixed size unchanged', () => {
    const rng = mulberry32(1);
    expect(resolveNeckSize(rng, { type: 'fixed', size: 4 })).toBe(4);
  });

  it('returns a value within [min, max] for random config', () => {
    const rng = mulberry32(1);
    for (let i = 0; i < 200; i++) {
      const size = resolveNeckSize(rng, { type: 'random', min: 2, max: 4 });
      expect(size).toBeGreaterThanOrEqual(2);
      expect(size).toBeLessThanOrEqual(4);
    }
  });
});
