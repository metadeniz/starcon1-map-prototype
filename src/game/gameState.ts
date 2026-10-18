import type { Connection, Faction, GameState, ImprovementType, Planet, Ship } from '../model/types';
import { getShipDefinition, type ShipRole } from '../model/shipRoster';
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

export interface ReachablePlanet {
  planetId: string;
  cost: number;
  path: string[]; // planet ids from the ship's current planet to this one, inclusive of both ends
}

/** BFS from the ship's current planet, bounded by its remaining movement points (1 point/edge). */
export function reachablePlanets(ship: Ship, state: GameState): Map<string, ReachablePlanet> {
  const adjacency = buildAdjacency(state.planets, state.connections);
  const result = new Map<string, ReachablePlanet>();
  if (ship.movesRemaining <= 0) return result;

  const queue: string[] = [ship.planetId];
  const paths = new Map<string, string[]>([[ship.planetId, [ship.planetId]]]);
  const costs = new Map<string, number>([[ship.planetId, 0]]);

  while (queue.length) {
    const current = queue.shift()!;
    const currentCost = costs.get(current)!;
    if (currentCost >= ship.movesRemaining) continue;
    for (const neighbor of adjacency.get(current) ?? []) {
      if (costs.has(neighbor)) continue;
      const cost = currentCost + 1;
      costs.set(neighbor, cost);
      const path = [...paths.get(current)!, neighbor];
      paths.set(neighbor, path);
      result.set(neighbor, { planetId: neighbor, cost, path });
      queue.push(neighbor);
    }
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

/** Moves a ship to `destinationPlanetId` if reachable within its remaining movement points. */
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
    throw new InvalidMoveError('Destination is not reachable with the remaining movement points');
  }
  const originPlanetId = ship.planetId;
  ship.planetId = destinationPlanetId;
  ship.movesRemaining -= target.cost;

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

/** Relocates the starbase at `planetId` one step to `destinationPlanetId` (its only move this turn). */
export function moveStarbase(planetId: string, destinationPlanetId: string, state: GameState): void {
  const planet = state.planets.find((p) => p.id === planetId);
  if (!planet) throw new InvalidActionError('Unknown planet');
  if (!planet.hasStarbase) throw new InvalidActionError('No starbase at that planet');
  if (planet.owner !== state.currentFaction) {
    throw new InvalidActionError("It's not this side's turn");
  }
  if (planet.starbaseMovesRemaining <= 0) {
    throw new InvalidActionError('This starbase has already moved this turn');
  }
  if (!starbaseDestinations(planet, state).includes(destinationPlanetId)) {
    throw new InvalidActionError('Not a valid destination for the starbase');
  }

  const destination = state.planets.find((p) => p.id === destinationPlanetId)!;
  planet.hasStarbase = false;
  planet.starbaseMovesRemaining = 0;
  destination.hasStarbase = true;
  destination.owner = planet.owner;
  destination.starbaseMovesRemaining = 0; // already used its one move getting here
  destination.explored = true;
}

/** Builds a ship at an owned starbase. */
export function buildShip(owner: Faction, planetId: string, role: ShipRole, state: GameState): void {
  if (owner !== state.currentFaction) {
    throw new InvalidActionError("It's not this side's turn");
  }
  const planet = state.planets.find((p) => p.id === planetId);
  if (!planet) throw new InvalidActionError('Unknown planet');
  if (!planet.hasStarbase || planet.owner !== owner) {
    throw new InvalidActionError('No starbase owned by this side at that planet');
  }
  const def = getShipDefinition(owner, role);
  if (state.starbucks[owner] < def.cost) {
    throw new InvalidActionError('Not enough Starbucks');
  }

  state.starbucks[owner] -= def.cost;
  state.ships.push({
    id: nextId('ship'),
    type: def.name,
    owner,
    crew: def.crew,
    currentCrew: def.crew,
    planetId,
    movesRemaining: state.scenario.movesPerTurn,
  });
}

/**
 * Ends the current side's turn and hands control to the other side, refilling only its ships'
 * movement points. Sides alternate; a new round (turn counter, construction progress, mine
 * income) only advances once control cycles back to `humanFaction`, so a full round still means
 * both sides have acted — matching the original "1-3 turns to build" pacing.
 */
export function endTurn(state: GameState): void {
  state.currentFaction = otherFaction(state.currentFaction);

  for (const ship of state.ships) {
    if (ship.owner === state.currentFaction) {
      ship.movesRemaining = state.scenario.movesPerTurn;
    }
  }
  for (const planet of state.planets) {
    if (planet.hasStarbase && planet.owner === state.currentFaction) {
      planet.starbaseMovesRemaining = 1;
    }
  }

  if (state.currentFaction !== state.humanFaction) return;

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
