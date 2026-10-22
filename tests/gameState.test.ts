import { describe, expect, it } from 'vitest';
import {
  buildShip,
  endTurn,
  InvalidActionError,
  moveShip,
  moveStarbase,
  reachablePlanets,
  STARBASE_MOVE_ACTIONS,
  startConstruction,
  starbaseDestinations,
} from '../src/game/gameState';
import type { GameState, Planet, Ship } from '../src/model/types';
import { DEFAULT_SCENARIO } from '../src/generation/scenarioConfig';

function makePlanet(overrides: Partial<Planet> & Pick<Planet, 'id'>): Planet {
  return {
    name: overrides.id,
    type: 'dead',
    owner: 'neutral',
    hasStarbase: false,
    explored: true,
    x: 0,
    y: 0,
    ...overrides,
  };
}

function makeShip(overrides: Partial<Ship> & Pick<Ship, 'id' | 'planetId'>): Ship {
  return {
    type: 'Shofixti Scout',
    owner: 'alliance',
    crew: 6,
    currentCrew: 6,
    ...overrides,
  };
}

function makeState(): GameState {
  // A-B-C-D chain plus a mineral planet M hanging off B.
  const planets: Planet[] = [
    makePlanet({ id: 'A', owner: 'alliance', hasStarbase: true, type: 'life' }),
    makePlanet({ id: 'B' }),
    makePlanet({ id: 'C' }),
    makePlanet({ id: 'D' }),
    makePlanet({ id: 'M', type: 'mineral' }),
  ];
  return {
    planets,
    connections: [
      { a: 'A', b: 'B' },
      { a: 'B', b: 'C' },
      { a: 'C', b: 'D' },
      { a: 'B', b: 'M' },
    ],
    ships: [makeShip({ id: 's1', planetId: 'A' })],
    turn: 1,
    scenario: DEFAULT_SCENARIO,
    starbucks: { alliance: 25, hierarchy: 25 },
    humanFaction: 'alliance',
    currentFaction: 'alliance',
    actionsRemaining: 3,
  };
}

describe('reachablePlanets', () => {
  it('lists only planets one connection away', () => {
    const state = makeState();
    moveShip(state.ships[0], 'B', state);
    const reachable = reachablePlanets(state.ships[0], state);
    expect(new Set(reachable.keys())).toEqual(new Set(['A', 'C', 'M']));
    expect(reachable.get('C')).toEqual({ planetId: 'C', cost: 1, path: ['B', 'C'] });
  });

  it('returns nothing when the side has no actions left', () => {
    const state = makeState();
    state.actionsRemaining = 0;
    expect(reachablePlanets(state.ships[0], state).size).toBe(0);
  });
});

describe('moveShip', () => {
  it('moves one connection for one action', () => {
    const state = makeState();
    moveShip(state.ships[0], 'B', state);
    expect(state.ships[0].planetId).toBe('B');
    expect(state.actionsRemaining).toBe(2);
  });

  it('rejects a move further than one connection', () => {
    const state = makeState();
    expect(() => moveShip(state.ships[0], 'C', state)).toThrow();
    expect(state.ships[0].planetId).toBe('A');
    expect(state.actionsRemaining).toBe(3);
  });

  it('lets a ship move more than once a turn, each move spending an action', () => {
    const state = makeState();
    moveShip(state.ships[0], 'B', state);
    moveShip(state.ships[0], 'C', state);
    moveShip(state.ships[0], 'D', state);
    expect(state.ships[0].planetId).toBe('D');
    expect(state.actionsRemaining).toBe(0);
    expect(() => moveShip(state.ships[0], 'C', state)).toThrow();
  });

  it('marks every planet on the path as explored', () => {
    const state = makeState();
    for (const p of state.planets) p.explored = false;
    state.planets[0].explored = true; // homeworld
    moveShip(state.ships[0], 'B', state);
    moveShip(state.ships[0], 'C', state);
    expect(state.planets.find((p) => p.id === 'B')!.explored).toBe(true);
    expect(state.planets.find((p) => p.id === 'C')!.explored).toBe(true);
    expect(state.planets.find((p) => p.id === 'D')!.explored).toBe(false);
  });

  it('costs nothing when leaving a world with the side\'s own colony', () => {
    const state = makeState();
    Object.assign(state.planets.find((p) => p.id === 'B')!, { owner: 'alliance', improvement: 'colony' });
    moveShip(state.ships[0], 'B', state);
    expect(state.actionsRemaining).toBe(2);
    moveShip(state.ships[0], 'C', state);
    expect(state.actionsRemaining).toBe(2);
    moveShip(state.ships[0], 'B', state);
    moveShip(state.ships[0], 'M', state);
    expect(state.actionsRemaining).toBe(1);
  });

  it('charges for leaving an enemy colony or an own mine', () => {
    const state = makeState();
    Object.assign(state.planets.find((p) => p.id === 'B')!, { owner: 'hierarchy', improvement: 'colony' });
    Object.assign(state.planets.find((p) => p.id === 'C')!, { owner: 'alliance', improvement: 'mine' });
    moveShip(state.ships[0], 'B', state);
    moveShip(state.ships[0], 'C', state);
    moveShip(state.ships[0], 'D', state);
    expect(state.actionsRemaining).toBe(0);
  });

  it('still needs an action left to make a free move', () => {
    const state = makeState();
    Object.assign(state.planets.find((p) => p.id === 'A')!, { improvement: 'colony' });
    state.actionsRemaining = 0;
    expect(() => moveShip(state.ships[0], 'B', state)).toThrow();
  });

  it('shares the action budget between ships', () => {
    const state = makeState();
    state.ships.push(makeShip({ id: 's2', planetId: 'A' }));
    moveShip(state.ships[0], 'B', state);
    moveShip(state.ships[0], 'C', state);
    expect(state.ships[1].planetId).toBe('A');
    moveShip(state.ships[1], 'B', state);
    expect(reachablePlanets(state.ships[0], state).size).toBe(0);
  });
});

describe('startConstruction', () => {
  it('starts a timed build (no cost) using the ordering ship, not owning the planet yet', () => {
    const state = makeState();
    moveShip(state.ships[0], 'B', state); // B -> M is one hop, but the ship must be present at M itself
    moveShip(state.ships[0], 'M', state);
    startConstruction('s1', 'mine', state);
    const m = state.planets.find((p) => p.id === 'M')!;
    expect(m.owner).toBe('neutral');
    expect(m.improvement).toBeUndefined();
    expect(m.underConstruction).toEqual({ type: 'mine', owner: 'alliance', shipId: 's1', turnsRemaining: 3 }); // crew 6 -> 3 turns
    expect(state.starbucks.alliance).toBe(25); // no Starbucks cost
    expect(state.actionsRemaining).toBe(0); // two jumps plus one action to start building
  });

  it('rejects starting construction with no actions left', () => {
    const state = makeState();
    moveShip(state.ships[0], 'B', state);
    moveShip(state.ships[0], 'M', state);
    state.actionsRemaining = 0;
    expect(() => startConstruction('s1', 'mine', state)).toThrow(InvalidActionError);
    expect(state.planets.find((p) => p.id === 'M')!.underConstruction).toBeUndefined();
  });

  it('uses the ordering ship\'s own crew size for duration, not other ships present', () => {
    const state = makeState();
    moveShip(state.ships[0], 'B', state);
    moveShip(state.ships[0], 'M', state);
    state.ships.push(makeShip({ id: 'big', planetId: 'M', type: 'Chenjesu Broodhome', crew: 36, currentCrew: 36 }));
    startConstruction('big', 'mine', state);
    expect(state.planets.find((p) => p.id === 'M')!.underConstruction!.turnsRemaining).toBe(1);
  });

  it('rejects a mine on a non-mineral world', () => {
    const state = makeState();
    moveShip(state.ships[0], 'B', state);
    expect(() => startConstruction('s1', 'mine', state)).toThrow(InvalidActionError);
  });

  it('rejects an unknown ship', () => {
    const state = makeState();
    expect(() => startConstruction('nope', 'mine', state)).toThrow(InvalidActionError);
  });

  it('rejects starting a second construction while one is already underway', () => {
    const state = makeState();
    moveShip(state.ships[0], 'B', state);
    moveShip(state.ships[0], 'M', state);
    startConstruction('s1', 'mine', state);
    state.ships.push(makeShip({ id: 's2', planetId: 'M' }));
    expect(() => startConstruction('s2', 'fortification', state)).toThrow(InvalidActionError);
  });

  it('cancels construction if the builder ship leaves before completion', () => {
    const state = makeState();
    moveShip(state.ships[0], 'B', state);
    moveShip(state.ships[0], 'M', state);
    startConstruction('s1', 'mine', state);
    state.actionsRemaining = 1;
    moveShip(state.ships[0], 'B', state);
    expect(state.planets.find((p) => p.id === 'M')!.underConstruction).toBeUndefined();
  });

  it('does not cancel construction when a different ship leaves the same planet', () => {
    const state = makeState();
    moveShip(state.ships[0], 'B', state);
    moveShip(state.ships[0], 'M', state);
    startConstruction('s1', 'mine', state);
    state.ships.push(makeShip({ id: 's2', planetId: 'M' }));
    state.actionsRemaining = 1;
    moveShip(state.ships[1], 'B', state);
    expect(state.planets.find((p) => p.id === 'M')!.underConstruction).toBeDefined();
  });
});

describe('buildShip', () => {
  it('adds a new independent ship at the starbase', () => {
    const state = makeState();
    buildShip('alliance', 'A', 'shofixti-scout', state);
    expect(state.ships.length).toBe(2);
    expect(state.ships[1].planetId).toBe('A');
    expect(state.starbucks.alliance).toBe(25 - 5);
    expect(state.actionsRemaining).toBe(2);
  });

  it('rejects building with no actions left', () => {
    const state = makeState();
    state.actionsRemaining = 0;
    expect(() => buildShip('alliance', 'A', 'shofixti-scout', state)).toThrow(InvalidActionError);
    expect(state.ships.length).toBe(1);
    expect(state.starbucks.alliance).toBe(25);
  });

  it('rejects building at a planet without an owned starbase', () => {
    const state = makeState();
    expect(() => buildShip('alliance', 'B', 'shofixti-scout', state)).toThrow(InvalidActionError);
  });
});

describe('starbaseDestinations', () => {
  it('lists directly-connected neutral/own-owned planets with nothing already built on them', () => {
    const state = makeState();
    const a = state.planets.find((p) => p.id === 'A')!;
    expect(starbaseDestinations(a, state)).toEqual(['B']);
  });

  it('excludes a neighbor that already has an improvement', () => {
    const state = makeState();
    state.planets.find((p) => p.id === 'B')!.improvement = 'fortification';
    const a = state.planets.find((p) => p.id === 'A')!;
    expect(starbaseDestinations(a, state)).toEqual([]);
  });

  it('excludes a neighbor owned by the other side', () => {
    const state = makeState();
    state.planets.find((p) => p.id === 'B')!.owner = 'hierarchy';
    const a = state.planets.find((p) => p.id === 'A')!;
    expect(starbaseDestinations(a, state)).toEqual([]);
  });
});

describe('moveStarbase', () => {
  it('relocates the starbase one step, claiming a neutral destination', () => {
    const state = makeState();
    moveStarbase('A', 'B', state);
    const a = state.planets.find((p) => p.id === 'A')!;
    const b = state.planets.find((p) => p.id === 'B')!;
    expect(a.hasStarbase).toBe(false);
    expect(b.hasStarbase).toBe(true);
    expect(b.owner).toBe('alliance');
    expect(b.explored).toBe(true);
    expect(state.actionsRemaining).toBe(3 - STARBASE_MOVE_ACTIONS);
  });

  it('rejects moving more than one step (not directly connected)', () => {
    const state = makeState();
    expect(() => moveStarbase('A', 'C', state)).toThrow(InvalidActionError);
  });

  it('rejects moving again after already moving this turn', () => {
    const state = makeState();
    moveStarbase('A', 'B', state);
    // The move used all 3 actions; C is a valid neighbor otherwise.
    expect(() => moveStarbase('B', 'C', state)).toThrow(InvalidActionError);
  });

  it('needs 3 actions, so any other action first rules it out this turn', () => {
    const state = makeState();
    moveShip(state.ships[0], 'B', state);
    moveShip(state.ships[0], 'A', state);
    expect(() => moveStarbase('A', 'B', state)).toThrow(InvalidActionError);
    expect(state.planets.find((p) => p.id === 'A')!.hasStarbase).toBe(true);
    expect(state.actionsRemaining).toBe(1);
  });

  it('rejects moving onto a planet with an improvement, or owned by the other side', () => {
    const state = makeState();
    state.planets.find((p) => p.id === 'B')!.improvement = 'fortification';
    expect(() => moveStarbase('A', 'B', state)).toThrow(InvalidActionError);
  });

  it('rejects acting for a side whose turn it is not', () => {
    const state = makeState();
    endTurn(state); // now hierarchy's turn
    expect(() => moveStarbase('A', 'B', state)).toThrow(InvalidActionError);
  });
});

describe('endTurn (alternating turns)', () => {
  /** One full round is two endTurn calls: alliance's turn ending, then hierarchy's. */
  function endRound(state: GameState): void {
    endTurn(state);
    endTurn(state);
  }

  it('switches currentFaction to the other side and gives it a fresh set of actions', () => {
    const state = makeState();
    moveShip(state.ships[0], 'B', state);
    expect(state.actionsRemaining).toBe(2);

    endTurn(state);
    expect(state.currentFaction).toBe('hierarchy');
    expect(state.turn).toBe(1); // round hasn't completed yet
    expect(state.actionsRemaining).toBe(state.scenario.actionsPerTurn);

    endTurn(state);
    expect(state.currentFaction).toBe('alliance');
    expect(state.turn).toBe(2); // round completed on return to the human's side
    expect(state.actionsRemaining).toBe(state.scenario.actionsPerTurn);
  });

  it('lets an alliance ship reach nothing on the hierarchy\'s turn', () => {
    const state = makeState();
    endTurn(state);
    expect(reachablePlanets(state.ships[0], state).size).toBe(0);
  });

  it('rejects moving, building, or constructing for a side whose turn it is not', () => {
    const state = makeState();
    endTurn(state); // now hierarchy's turn
    expect(() => moveShip(state.ships[0], 'B', state)).toThrow(InvalidActionError);
    expect(() => buildShip('alliance', 'A', 'shofixti-scout', state)).toThrow(InvalidActionError);
    expect(() => startConstruction('s1', 'mine', state)).toThrow(InvalidActionError);
    expect(() => moveStarbase('A', 'B', state)).toThrow(InvalidActionError);
  });

  it('progresses construction once per full round and pays mine income once it completes', () => {
    const state = makeState();
    moveShip(state.ships[0], 'B', state);
    moveShip(state.ships[0], 'M', state);
    startConstruction('s1', 'mine', state); // crew 6 -> 3 turns
    const m = state.planets.find((p) => p.id === 'M')!;

    endRound(state);
    expect(m.underConstruction!.turnsRemaining).toBe(2);
    expect(state.starbucks.alliance).toBe(25);

    endRound(state);
    expect(m.underConstruction!.turnsRemaining).toBe(1);
    expect(state.starbucks.alliance).toBe(25);

    endRound(state);
    expect(m.underConstruction).toBeUndefined();
    expect(m.owner).toBe('alliance');
    expect(m.improvement).toBe('mine');
    expect(state.starbucks.alliance).toBe(25 + state.scenario.mineIncomePerTurn);
  });

  it('cancels construction at round end if the builder ship is gone (defensive check)', () => {
    const state = makeState();
    moveShip(state.ships[0], 'B', state);
    moveShip(state.ships[0], 'M', state);
    startConstruction('s1', 'mine', state);
    const m = state.planets.find((p) => p.id === 'M')!;
    // Simulate the builder ship having vanished without going through moveShip's own cancellation.
    state.ships = [];
    endRound(state);
    expect(m.underConstruction).toBeUndefined();
  });
});
