import { describe, expect, it } from 'vitest';
import {
  buildShip,
  endTurn,
  InvalidActionError,
  moveShip,
  moveStarbase,
  reachablePlanets,
  startConstruction,
  starbaseDestinations,
} from '../src/game/gameState';
import type { GameState, Planet, Ship } from '../src/model/types';

function makePlanet(overrides: Partial<Planet> & Pick<Planet, 'id'>): Planet {
  return {
    name: overrides.id,
    type: 'dead',
    owner: 'neutral',
    hasStarbase: false,
    starbaseMovesRemaining: 0,
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
    movesRemaining: 3,
    ...overrides,
  };
}

function makeState(): GameState {
  // A-B-C-D chain plus a mineral planet M hanging off B.
  const planets: Planet[] = [
    makePlanet({ id: 'A', owner: 'alliance', hasStarbase: true, starbaseMovesRemaining: 1, type: 'life' }),
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
    scenario: {
      totalPlanets: 15,
      neckSize: { type: 'fixed', size: 3 },
      planetTypeWeights: { life: 0.25, mineral: 0.35, dead: 0.4 },
      startingShips: { alliance: ['shofixti-scout'], hierarchy: ['umgah-drone'] },
      movesPerTurn: 3,
      startingStarbucks: 25,
      mineIncomePerTurn: 3,
    },
    starbucks: { alliance: 25, hierarchy: 25 },
    humanFaction: 'alliance',
    currentFaction: 'alliance',
  };
}

describe('reachablePlanets', () => {
  it('finds planets within the movement budget via BFS', () => {
    const state = makeState();
    const reachable = reachablePlanets(state.ships[0], state);
    expect(new Set(reachable.keys())).toEqual(new Set(['B', 'C', 'M', 'D']));
    expect(reachable.get('D')!.cost).toBe(3);
    expect(reachable.get('D')!.path).toEqual(['A', 'B', 'C', 'D']);
  });

  it('returns nothing when the ship has no moves left', () => {
    const state = makeState();
    state.ships[0].movesRemaining = 0;
    expect(reachablePlanets(state.ships[0], state).size).toBe(0);
  });
});

describe('moveShip', () => {
  it('moves along the shortest path and deducts the correct cost', () => {
    const state = makeState();
    moveShip(state.ships[0], 'C', state);
    expect(state.ships[0].planetId).toBe('C');
    expect(state.ships[0].movesRemaining).toBe(1);
  });

  it('marks every planet on the path as explored', () => {
    const state = makeState();
    for (const p of state.planets) p.explored = false;
    state.planets[0].explored = true; // homeworld
    moveShip(state.ships[0], 'C', state);
    expect(state.planets.find((p) => p.id === 'B')!.explored).toBe(true);
    expect(state.planets.find((p) => p.id === 'C')!.explored).toBe(true);
    expect(state.planets.find((p) => p.id === 'D')!.explored).toBe(false);
  });

  it('throws if the destination is beyond the movement budget', () => {
    const state = makeState();
    state.ships[0].movesRemaining = 1;
    expect(() => moveShip(state.ships[0], 'D', state)).toThrow();
  });

  it('does not affect other ships at the same planet', () => {
    const state = makeState();
    state.ships.push(makeShip({ id: 's2', planetId: 'A' }));
    moveShip(state.ships[0], 'B', state);
    expect(state.ships[0].planetId).toBe('B');
    expect(state.ships[1].planetId).toBe('A');
    expect(state.ships[1].movesRemaining).toBe(3);
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
    expect(state.starbucks.alliance).toBe(25); // no cost
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
    moveShip(state.ships[0], 'B', state);
    expect(state.planets.find((p) => p.id === 'M')!.underConstruction).toBeUndefined();
  });

  it('does not cancel construction when a different ship leaves the same planet', () => {
    const state = makeState();
    moveShip(state.ships[0], 'B', state);
    moveShip(state.ships[0], 'M', state);
    startConstruction('s1', 'mine', state);
    state.ships.push(makeShip({ id: 's2', planetId: 'M', movesRemaining: 3 }));
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
    expect(state.ships[1].movesRemaining).toBe(3);
    expect(state.starbucks.alliance).toBe(25 - 5);
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
    expect(a.starbaseMovesRemaining).toBe(0);
    expect(b.hasStarbase).toBe(true);
    expect(b.owner).toBe('alliance');
    expect(b.starbaseMovesRemaining).toBe(0);
    expect(b.explored).toBe(true);
  });

  it('rejects moving more than one step (not directly connected)', () => {
    const state = makeState();
    expect(() => moveStarbase('A', 'C', state)).toThrow(InvalidActionError);
  });

  it('rejects moving again after already moving this turn', () => {
    const state = makeState();
    moveStarbase('A', 'B', state);
    // B now has the starbase but used its move; C is a valid neighbor otherwise.
    expect(() => moveStarbase('B', 'C', state)).toThrow(InvalidActionError);
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

  it('switches currentFaction to the other side and refills only its ships\' moves', () => {
    const state = makeState();
    moveShip(state.ships[0], 'B', state);
    expect(state.ships[0].movesRemaining).toBe(2);

    endTurn(state);
    expect(state.currentFaction).toBe('hierarchy');
    expect(state.turn).toBe(1); // round hasn't completed yet
    expect(state.ships[0].movesRemaining).toBe(2); // alliance ship untouched, it's not their turn

    endTurn(state);
    expect(state.currentFaction).toBe('alliance');
    expect(state.turn).toBe(2); // round completed on return to the human's side
    expect(state.ships[0].movesRemaining).toBe(state.scenario.movesPerTurn); // refilled
  });

  it('refills the starbase\'s one move only when its own side\'s turn comes back around', () => {
    const state = makeState();
    moveStarbase('A', 'B', state);
    const b = state.planets.find((p) => p.id === 'B')!;
    expect(b.starbaseMovesRemaining).toBe(0);

    endTurn(state); // hierarchy's turn; alliance's starbase untouched
    expect(b.starbaseMovesRemaining).toBe(0);

    endTurn(state); // back to alliance
    expect(b.starbaseMovesRemaining).toBe(1);
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
