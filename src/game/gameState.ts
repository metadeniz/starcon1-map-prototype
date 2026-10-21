import type { Connection, Faction, GameState, ImprovementType, Planet, Ship } from '../model/types';
import { getShipDefinition, SHIP_ROSTER, type ShipRole } from '../model/shipRoster';
import { nextId } from '../model/id';
import { buildDurationTurns, isImprovementAllowed } from '../model/improvements';

function buildAdjacency(planets: Planet[], connections: Connection[]): Map<string, string[]> {
  const adjacency = new Map<string, string[]>();
  for (const p of planets) adjacency.set(p.id, []);
  for (const c of connections) {
    adjacency.get(c.a)?.push(c.b);
    adjacency.get(c.b)?.push(c.a);
  }
  return adjacency;
}

/** Actions a starbase move costs: a whole SC1-sized turn. */
export const STARBASE_MOVE_ACTIONS = 3;

export interface ReachablePlanet {
  planetId: string;
  cost: number;
  path: string[]; // planet ids from the ship's current planet to this one, inclusive of both ends
}

/**
 * Planets the ship can move to right now: those one connection away, while its side has an
 * action left. Ships move one connection per action; a longer trip takes several moves.
 */
export function reachablePlanets(ship: Ship, state: GameState): Map<string, ReachablePlanet> {
  const result = new Map<string, ReachablePlanet>();
  if (ship.owner !== state.currentFaction || state.actionsRemaining <= 0) return result;
  const adjacency = buildAdjacency(state.planets, state.connections);
  for (const neighbor of adjacency.get(ship.planetId) ?? []) {
    result.set(neighbor, { planetId: neighbor, cost: 1, path: [ship.planetId, neighbor] });
  }
  return result;
}

function shipPresentAt(state: GameState, planetId: string, shipId: string): boolean {
  return state.ships.some((s) => s.id === shipId && s.planetId === planetId);
}

export function otherFaction(faction: Faction): Faction {
  return faction === 'alliance' ? 'hierarchy' : 'alliance';
}

/** Cancels an in-progress construction if its builder ship is no longer at the planet. */
function cancelConstructionIfBuilderAbsent(state: GameState, planet: Planet): void {
  if (planet.underConstruction && !shipPresentAt(state, planet.id, planet.underConstruction.shipId)) {
    planet.underConstruction = undefined;
  }
}

export class InvalidMoveError extends Error {}
export class InvalidActionError extends Error {}

/** Spends `cost` of the current side's actions, or throws if it doesn't have that many left. */
function spendActions(state: GameState, cost: number): void {
  if (state.actionsRemaining < cost) {
    throw new InvalidActionError(cost === 1 ? 'No actions left this turn' : `That takes ${cost} actions; ${state.actionsRemaining} left this turn`);
  }
  state.actionsRemaining -= cost;
}

/**
 * Moves a ship one connection to `destinationPlanetId`, for one of the side's actions. A ship
 * may move several times a turn as long as the side has actions left.
 */
export function moveShip(ship: Ship, destinationPlanetId: string, state: GameState): void {
  if (ship.owner !== state.currentFaction) {
    throw new InvalidActionError("It's not this side's turn");
  }
  if (destinationPlanetId === ship.planetId) {
    throw new InvalidMoveError('Ship is already at that planet');
  }
  const reachable = reachablePlanets(ship, state);
  const target = reachable.get(destinationPlanetId);
  if (!target) {
    throw new InvalidMoveError('Ships move one connection at a time, and need an action left this turn');
  }
  spendActions(state, target.cost);
  const originPlanetId = ship.planetId;
  ship.planetId = destinationPlanetId;

  const visitedIds = new Set(target.path);
  for (const planet of state.planets) {
    if (visitedIds.has(planet.id)) planet.explored = true;
  }

  // A ship that departs mid-construction leaves the job unfinished.
  const origin = state.planets.find((p) => p.id === originPlanetId);
  if (origin) cancelConstructionIfBuilderAbsent(state, origin);
}

/** Orders `shipId` to start building an improvement (colony/mine/fortification) at its current planet. */
export function startConstruction(shipId: string, type: ImprovementType, state: GameState): void {
  const ship = state.ships.find((s) => s.id === shipId);
  if (!ship) throw new InvalidActionError('Unknown ship');
  if (ship.owner !== state.currentFaction) {
    throw new InvalidActionError("It's not this side's turn");
  }
  const planet = state.planets.find((p) => p.id === ship.planetId);
  if (!planet) throw new InvalidActionError('Unknown planet');
  if (planet.hasStarbase || planet.improvement) {
    throw new InvalidActionError('This planet already has an improvement or starbase');
  }
  if (planet.underConstruction) {
    throw new InvalidActionError('This planet already has construction underway');
  }
  if (!isImprovementAllowed(planet, type)) {
    throw new InvalidActionError(`${type} cannot be built on a ${planet.type} world`);
  }
  spendActions(state, 1);

  planet.underConstruction = {
    type,
    owner: ship.owner,
    shipId: ship.id,
    turnsRemaining: buildDurationTurns(ship.crew),
  };
}

/** Planets directly connected to `planet` that are valid destinations for its starbase to relocate to. */
export function starbaseDestinations(planet: Planet, state: GameState): string[] {
  const neighborIds = state.connections
    .filter((c) => c.a === planet.id || c.b === planet.id)
    .map((c) => (c.a === planet.id ? c.b : c.a));

  return neighborIds.filter((id) => {
    const dest = state.planets.find((p) => p.id === id);
    if (!dest) return false;
    if (dest.hasStarbase || dest.improvement || dest.underConstruction) return false;
    if (dest.owner !== 'neutral' && dest.owner !== planet.owner) return false;
    return true;
  });
}

/** Relocates the starbase at `planetId` one step to `destinationPlanetId`, for `STARBASE_MOVE_ACTIONS` actions. */
export function moveStarbase(planetId: string, destinationPlanetId: string, state: GameState): void {
  const planet = state.planets.find((p) => p.id === planetId);
  if (!planet) throw new InvalidActionError('Unknown planet');
  if (!planet.hasStarbase) throw new InvalidActionError('No starbase at that planet');
  if (planet.owner !== state.currentFaction) {
    throw new InvalidActionError("It's not this side's turn");
  }
  if (!starbaseDestinations(planet, state).includes(destinationPlanetId)) {
    throw new InvalidActionError('Not a valid destination for the starbase');
  }
  spendActions(state, STARBASE_MOVE_ACTIONS);

  const destination = state.planets.find((p) => p.id === destinationPlanetId)!;
  planet.hasStarbase = false;
  destination.hasStarbase = true;
  destination.owner = planet.owner;
  destination.explored = true;
}

/** Builds a ship at an owned starbase. As in SC1, this is one action. */
export function buildShip(owner: Faction, planetId: string, role: ShipRole, state: GameState): void {
  if (owner !== state.currentFaction) {
    throw new InvalidActionError("It's not this side's turn");
  }
  const planet = state.planets.find((p) => p.id === planetId);
  if (!planet) throw new InvalidActionError('Unknown planet');
  if (!planet.hasStarbase || planet.owner !== owner) {
    throw new InvalidActionError('No starbase owned by this side at that planet');
  }
  if (state.scenario.sides[owner].cannotBuild.includes(role)) {
    throw new InvalidActionError('This scenario does not let this side build that ship');
  }
  const def = getShipDefinition(owner, role);
  if (state.starbucks[owner] < def.cost) {
    throw new InvalidActionError('Not enough Starbucks');
  }
  spendActions(state, 1);

  state.starbucks[owner] -= def.cost;
  state.ships.push({
    id: nextId('ship'),
    type: def.name,
    owner,
    crew: def.crew,
    currentCrew: def.crew,
    planetId,
  });
}

/** The side that opens each round: the scenario's first mover, or the human. */
export function firstMover(state: GameState): Faction {
  return state.scenario.firstMove ?? state.humanFaction;
}

/** Ship roles `owner` may build in this scenario. */
export function buildableRoles(state: GameState, owner: Faction): ShipRole[] {
  return SHIP_ROSTER[owner].map((d) => d.role).filter((role) => !state.scenario.sides[owner].cannotBuild.includes(role));
}

/**
 * The side that has won, if any. As in SC1, a side with no ships and no starbase left has lost;
 * a scenario's victory conditions add earlier ways to win.
 */
export function winner(state: GameState): Faction | null {
  for (const faction of ['alliance', 'hierarchy'] as const) {
    const enemy = otherFaction(faction);
    const enemyHasShips = state.ships.some((s) => s.owner === enemy);
    const enemyHasStarbase = state.planets.some((p) => p.owner === enemy && p.hasStarbase);
    if (!enemyHasShips && !enemyHasStarbase) return faction;

    const v = state.scenario.sides[faction].victory;
    if (!v.enemyHasNoShips && !v.enemyHasNoColonies && !v.enemyHasNoMines) continue;
    const has = (improvement: 'colony' | 'mine') => state.planets.some((p) => p.owner === enemy && p.improvement === improvement);
    if (v.enemyHasNoShips && enemyHasShips) continue;
    if (v.enemyHasNoColonies && has('colony')) continue;
    if (v.enemyHasNoMines && has('mine')) continue;
    return faction;
  }
  return null;
}

/**
 * Ends the current side's turn and hands control to the other side with a fresh set of
 * actions. Sides alternate; a new round (turn counter, construction progress, mine income)
 * only advances once control cycles back to the side that moves first, so a full round still means both sides have acted — matching the original "1-3 turns to build" pacing.
 */
export function endTurn(state: GameState): void {
  state.currentFaction = otherFaction(state.currentFaction);
  state.actionsRemaining = state.scenario.actionsPerTurn;

  if (state.currentFaction !== firstMover(state)) return;

  state.turn += 1;
  for (const planet of state.planets) {
    if (planet.underConstruction) {
      cancelConstructionIfBuilderAbsent(state, planet);
    }
    if (planet.underConstruction) {
      planet.underConstruction.turnsRemaining -= 1;
      if (planet.underConstruction.turnsRemaining <= 0) {
        planet.owner = planet.underConstruction.owner;
        planet.improvement = planet.underConstruction.type;
        planet.underConstruction = undefined;
      }
    }
    if (planet.improvement === 'mine' && planet.owner !== 'neutral') {
      state.starbucks[planet.owner] += state.scenario.mineIncomePerTurn;
    }
  }
}
