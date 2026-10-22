import { describe, expect, it } from 'vitest';
import { generateGalaxy } from '../src/generation/galaxyGenerator';
import { DEFAULT_SCENARIO } from '../src/generation/scenarioConfig';
import { runAiTurn } from '../src/game/ai';
import { endTurn } from '../src/game/gameState';

describe('runAiTurn', () => {
  it('runs several rounds without throwing and takes some action', () => {
    const state = generateGalaxy(DEFAULT_SCENARIO, 'alliance', 42);
    const startingHierarchyPlanetIds = new Set(state.ships.filter((s) => s.owner === 'hierarchy').map((s) => s.planetId));

    for (let i = 0; i < 6; i++) {
      endTurn(state); // hand control to hierarchy (the AI)
      expect(state.currentFaction).toBe('hierarchy');
      expect(() => runAiTurn(state, 'hierarchy')).not.toThrow();
      endTurn(state); // back to the human
      expect(state.currentFaction).toBe('alliance');
    }

    // Some ship moved somewhere other than its exact starting planet, i.e. the AI actually acted.
    const movedAtLeastOne = state.ships.some((s) => s.owner === 'hierarchy' && !startingHierarchyPlanetIds.has(s.planetId));
    const hierarchyBuiltOrClaimed = state.planets.some((p) => p.owner === 'hierarchy' && p.improvement);
    expect(movedAtLeastOne || hierarchyBuiltOrClaimed).toBe(true);

  });

  it('never spends more actions than the side has', () => {
    const state = generateGalaxy(DEFAULT_SCENARIO, 'alliance', 42);
    for (let i = 0; i < 10; i++) {
      endTurn(state);
      runAiTurn(state, 'hierarchy');
      expect(state.actionsRemaining).toBeGreaterThanOrEqual(0);
      expect(state.actionsRemaining).toBeLessThanOrEqual(state.scenario.actionsPerTurn);
      endTurn(state);
    }
  });

  it('never spends more Starbucks than it has', () => {
    const state = generateGalaxy(DEFAULT_SCENARIO, 'alliance', 7);
    for (let i = 0; i < 10; i++) {
      endTurn(state);
      runAiTurn(state, 'hierarchy');
      endTurn(state);
    }
    expect(state.starbucks.hierarchy).toBeGreaterThanOrEqual(0);
  });
});
