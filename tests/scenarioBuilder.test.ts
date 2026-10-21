import { describe, expect, it } from 'vitest';
import { defaultCustomScenario, randomTypicalScenario, scenarioProblems } from '../src/generation/scenarioBuilder';
import { DEFAULT_SCENARIO } from '../src/generation/scenarioConfig';
import { generateGalaxy, worldTotal } from '../src/generation/galaxyGenerator';
import { SHIP_ROSTER } from '../src/model/shipRoster';
import { mulberry32 } from '../src/generation/rng';

describe('randomTypicalScenario', () => {
  it('gives both sides the same setup, a starbase and every ship', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const sc = randomTypicalScenario(mulberry32(seed));
      const { alliance, hierarchy } = sc.sides;
      expect(scenarioProblems(sc)).toEqual([]);
      expect(alliance.worlds).toEqual(hierarchy.worlds);
      expect(worldTotal(alliance.worlds)).toBeGreaterThanOrEqual(12);
      expect(worldTotal(alliance.worlds)).toBeLessThanOrEqual(20);
      expect(alliance.worlds.dead).toBeGreaterThanOrEqual(0);
      expect(alliance.starbucks).toBe(hierarchy.starbucks);
      expect(alliance.starbase && hierarchy.starbase).toBe(true);
      expect(alliance.cannotBuild).toEqual([]);
      expect(hierarchy.cannotBuild).toEqual([]);
      expect(sc.firstMove).toBeUndefined();
      const rank = (f: 'alliance' | 'hierarchy', role: string) => SHIP_ROSTER[f].findIndex((d) => d.role === role);
      expect(alliance.ships.map((s) => rank('alliance', s.role))).toEqual(hierarchy.ships.map((s) => rank('hierarchy', s.role)));
      expect(alliance.ships.length).toBeGreaterThanOrEqual(2);
      expect(alliance.ships.length).toBeLessThanOrEqual(4);
    }
  });

  it('starts a game', () => {
    const state = generateGalaxy(randomTypicalScenario(mulberry32(7)), 'alliance', 7);
    expect(state.planets.length).toBe(2 * worldTotal(state.scenario.sides.alliance.worlds));
    expect(state.planets.filter((p) => p.hasStarbase)).toHaveLength(2);
    expect(state.ships).toHaveLength(2 * state.scenario.sides.alliance.ships.length);
  });
});

describe('custom scenarios', () => {
  it('start from the default settings', () => {
    const sc = defaultCustomScenario();
    expect(sc.sides).toEqual(DEFAULT_SCENARIO.sides);
    expect(sc.sides.alliance).not.toBe(DEFAULT_SCENARIO.sides.alliance);
    expect(scenarioProblems(sc)).toEqual([]);
  });

  it('reports settings that cannot be played', () => {
    const sc = defaultCustomScenario();
    sc.sides.alliance.worlds = { dead: 40, mineral: 0, life: 0, colony: 0, fortifiedColony: 0, mine: 0, fortifiedMine: 0 };
    sc.sides.hierarchy.worlds = { dead: 0, mineral: 0, life: 0, colony: 0, fortifiedColony: 0, mine: 0, fortifiedMine: 0 };
    sc.sides.hierarchy.starbase = false;
    sc.sides.hierarchy.ships = [];
    sc.movesPerTurn = 0;
    expect(scenarioProblems(sc)).toEqual([
      'The Hierarchy needs at least 1 world.',
      'The Hierarchy needs a starbase or at least 1 ship.',
      'Moves per turn must be 1 to 9.',
    ]);
    sc.sides.hierarchy.worlds.dead = 11;
    expect(scenarioProblems(sc)[0]).toBe('The map has 51 worlds; the most is 50.');
  });

  it('generate a map at the edges of what is allowed', () => {
    const lopsided = defaultCustomScenario();
    lopsided.sides.alliance.worlds = { dead: 0, mineral: 0, life: 1, colony: 0, fortifiedColony: 0, mine: 0, fortifiedMine: 0 };
    lopsided.sides.hierarchy.worlds = { dead: 10, mineral: 10, life: 10, colony: 5, fortifiedColony: 4, mine: 5, fortifiedMine: 5 };
    lopsided.sides.alliance.ships = Array.from({ length: 7 }, () => ({ role: 'chenjesu-broodhome', zone: 0 as const }));
    expect(scenarioProblems(lopsided)).toEqual([]);
    for (let seed = 1; seed <= 10; seed++) {
      for (const human of ['alliance', 'hierarchy'] as const) {
        const state = generateGalaxy(lopsided, human, seed);
        expect(state.planets).toHaveLength(50);
        expect(state.ships.filter((s) => s.owner === 'alliance')).toHaveLength(7);
      }
    }
  });
});
