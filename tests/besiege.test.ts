import { describe, expect, it } from 'vitest';
import { besiege, besiegeOdds, canBesiege, endTurn, InvalidActionError, isPinned, moveShip, reachablePlanets } from '../src/game/gameState';
import type { GameState, Planet, Ship } from '../src/model/types';
import { DEFAULT_SCENARIO } from '../src/generation/scenarioConfig';

function makePlanet(overrides: Partial<Planet> & Pick<Planet, 'id'>): Planet {
  return { name: overrides.id, type: 'dead', owner: 'neutral', hasStarbase: false, explored: true, x: 0, y: 0, ...overrides };
}

function makeShip(overrides: Partial<Ship> & Pick<Ship, 'id'>): Ship {
  return { type: 'Earthling Cruiser', owner: 'alliance', crew: 18, currentCrew: 18, planetId: 'F', ...overrides };
}

/** A-F-B chain; F is a Hierarchy fortification with an Alliance cruiser sitting on it. */
function makeState(fort: Partial<Planet> = { improvement: 'fortification' }): GameState {
  return {
    planets: [makePlanet({ id: 'A' }), makePlanet({ id: 'F', owner: 'hierarchy', ...fort }), makePlanet({ id: 'B' })],
    connections: [
      { a: 'A', b: 'F' },
      { a: 'F', b: 'B' },
    ],
    ships: [makeShip({ id: 's1' })],
    turn: 1,
    scenario: DEFAULT_SCENARIO,
    starbucks: { alliance: 25, hierarchy: 25 },
    humanFaction: 'alliance',
    currentFaction: 'alliance',
    actionsRemaining: 3,
  };
}

const planet = (state: GameState, id: string) => state.planets.find((p) => p.id === id)!;

describe('pinning', () => {
  it('holds a ship at an enemy fortification', () => {
    const state = makeState();
    expect(isPinned(state.ships[0], state)).toBe(true);
    expect(reachablePlanets(state.ships[0], state).size).toBe(0);
    expect(() => moveShip(state.ships[0], 'B', state)).toThrow();
    expect(state.actionsRemaining).toBe(3);
  });

  it('also holds it at a fortified enemy colony', () => {
    const state = makeState({ improvement: 'colony', type: 'life', fortified: true });
    expect(isPinned(state.ships[0], state)).toBe(true);
  });

  it('lets an Arilou Skiff slip past', () => {
    const state = makeState();
    state.ships[0] = makeShip({ id: 's1', type: 'Arilou Skiff', crew: 6, currentCrew: 6 });
    expect(isPinned(state.ships[0], state)).toBe(false);
    moveShip(state.ships[0], 'B', state);
    expect(state.ships[0].planetId).toBe('B');
  });

  it('does not hold a ship at its own side\'s fortification', () => {
    const state = makeState({ improvement: 'fortification', owner: 'alliance' });
    expect(isPinned(state.ships[0], state)).toBe(false);
  });
});

describe('besiege', () => {
  it('costs one action and fails on a high roll', () => {
    const state = makeState();
    expect(besiege('s1', state, () => 0.5)).toBe(false);
    expect(state.actionsRemaining).toBe(2);
    expect(planet(state, 'F').improvement).toBe('fortification');
  });

  it('on success, takes a bare fortification and frees the ship', () => {
    const state = makeState();
    expect(besiege('s1', state, () => 0)).toBe(true);
    expect(planet(state, 'F').improvement).toBeUndefined();
    expect(planet(state, 'F').owner).toBe('alliance');
    moveShip(state.ships[0], 'B', state);
    expect(state.ships[0].planetId).toBe('B');
  });

  it('on success, only strips the fortification from an enemy colony', () => {
    const state = makeState({ improvement: 'colony', type: 'life', fortified: true });
    expect(besiege('s1', state, () => 0)).toBe(true);
    expect(planet(state, 'F').improvement).toBe('colony');
    expect(planet(state, 'F').owner).toBe('hierarchy');
    expect(planet(state, 'F').fortified).toBeFalsy();
    expect(isPinned(state.ships[0], state)).toBe(false);
  });

  it('succeeds on 13 of 128 rolls, or 42 for an Ur-Quan Dreadnought', () => {
    const state = makeState();
    expect(besiegeOdds(state.ships[0])).toBe(13);
    expect(besiege('s1', state, () => 12.99 / 128)).toBe(true);
    const again = makeState();
    expect(besiege('s1', again, () => 13 / 128)).toBe(false);

    const urQuan = makeState();
    urQuan.ships[0] = makeShip({ id: 's1', owner: 'hierarchy', type: 'Ur-Quan Dreadnought', crew: 42, currentCrew: 42 });
    planet(urQuan, 'F').owner = 'alliance';
    urQuan.currentFaction = 'hierarchy';
    expect(besiegeOdds(urQuan.ships[0])).toBe(42);
    expect(besiege('s1', urQuan, () => 41.99 / 128)).toBe(true);
  });

  it('is not allowed with enemy ships present, away from a fortification, or with no actions', () => {
    const guarded = makeState();
    guarded.ships.push(makeShip({ id: 'h1', owner: 'hierarchy', type: 'Umgah Drone' }));
    expect(canBesiege(guarded.ships[0], guarded)).toBe(false);
    expect(() => besiege('s1', guarded, () => 0)).toThrow(InvalidActionError);

    const open = makeState();
    open.ships[0].planetId = 'A';
    expect(() => besiege('s1', open, () => 0)).toThrow(InvalidActionError);

    const tired = makeState();
    tired.actionsRemaining = 0;
    expect(() => besiege('s1', tired, () => 0)).toThrow(InvalidActionError);
  });
});

describe('assaulting fortifications at the end of a turn', () => {
  it('two ships smash an enemy fortification', () => {
    const state = makeState();
    state.ships.push(makeShip({ id: 's2' }));
    endTurn(state);
    expect(planet(state, 'F').improvement).toBeUndefined();
    expect(planet(state, 'F').owner).toBe('alliance');
  });

  it('one ship alone does not', () => {
    const state = makeState();
    endTurn(state);
    expect(planet(state, 'F').improvement).toBe('fortification');
  });

  it('a lone Ur-Quan Dreadnought does', () => {
    const state = makeState({ improvement: 'mine', type: 'mineral', fortified: true, owner: 'alliance' });
    state.ships[0] = makeShip({ id: 's1', owner: 'hierarchy', type: 'Ur-Quan Dreadnought', crew: 42, currentCrew: 42 });
    state.currentFaction = 'hierarchy';
    endTurn(state);
    expect(planet(state, 'F').fortified).toBeFalsy();
    expect(planet(state, 'F').improvement).toBe('mine');
  });

  it('not while defending ships are there', () => {
    const state = makeState();
    state.ships.push(makeShip({ id: 's2' }), makeShip({ id: 'h1', owner: 'hierarchy', type: 'Umgah Drone' }));
    endTurn(state);
    expect(planet(state, 'F').improvement).toBe('fortification');
  });
});
