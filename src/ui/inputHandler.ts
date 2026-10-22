import type { GameState } from '../model/types';
import { planetAt, shipAt, type ViewTransform } from '../render/canvasRenderer';
import { moveShip, moveStarbase, reachablePlanets, STARBASE_MOVE_ACTIONS, starbaseDestinations, type ReachablePlanet } from '../game/gameState';

export interface Selection {
  selectedPlanetId?: string;
  selectedShipId?: string;
  /** Set while the player is choosing a destination to relocate a starbase to. */
  movingStarbaseFromPlanetId?: string;
  reachable?: Map<string, ReachablePlanet>;
}

function recomputeReachable(state: GameState, selection: Selection): void {
  if (selection.movingStarbaseFromPlanetId) {
    const planet = state.planets.find((p) => p.id === selection.movingStarbaseFromPlanetId);
    if (!planet || !planet.hasStarbase || state.actionsRemaining < STARBASE_MOVE_ACTIONS) {
      selection.movingStarbaseFromPlanetId = undefined;
      selection.reachable = undefined;
      return;
    }
    const reachable = new Map<string, ReachablePlanet>();
    for (const id of starbaseDestinations(planet, state)) {
      reachable.set(id, { planetId: id, cost: STARBASE_MOVE_ACTIONS, path: [planet.id, id] });
    }
    selection.reachable = reachable;
    return;
  }

  if (!selection.selectedShipId) {
    selection.reachable = undefined;
    return;
  }
  const ship = state.ships.find((s) => s.id === selection.selectedShipId);
  selection.reachable = ship ? reachablePlanets(ship, state) : undefined;
}

/** Selects a ship (by id), also focusing the planet it's at. Used by both map clicks and the info panel's Select button. */
export function selectShip(shipId: string, state: GameState, selection: Selection): void {
  const ship = state.ships.find((s) => s.id === shipId);
  if (!ship) return;
  selection.movingStarbaseFromPlanetId = undefined;
  selection.selectedShipId = shipId;
  selection.selectedPlanetId = ship.planetId;
  recomputeReachable(state, selection);
}

/** Puts a starbase into "choose a destination" mode. Used by the info panel's Move Starbase button. */
export function startMovingStarbase(planetId: string, state: GameState, selection: Selection): void {
  const planet = state.planets.find((p) => p.id === planetId);
  if (!planet || !planet.hasStarbase) return;
  selection.selectedShipId = undefined;
  selection.movingStarbaseFromPlanetId = planetId;
  selection.selectedPlanetId = planetId;
  recomputeReachable(state, selection);
}

/** Handles a click on the galaxy canvas, mutating `selection` and `state` in place. */
export function handleCanvasClick(screenX: number, screenY: number, state: GameState, view: ViewTransform, selection: Selection): void {
  const clickedShipId = shipAt(screenX, screenY, state, view);
  if (clickedShipId) {
    selectShip(clickedShipId, state, selection);
    return;
  }

  const clickedPlanet = planetAt(screenX, screenY, state, view);
  if (!clickedPlanet) {
    selection.selectedPlanetId = undefined;
    selection.selectedShipId = undefined;
    selection.movingStarbaseFromPlanetId = undefined;
    selection.reachable = undefined;
    return;
  }

  if (selection.movingStarbaseFromPlanetId && selection.reachable?.has(clickedPlanet.id)) {
    moveStarbase(selection.movingStarbaseFromPlanetId, clickedPlanet.id, state);
    selection.selectedPlanetId = clickedPlanet.id;
    selection.movingStarbaseFromPlanetId = undefined;
    recomputeReachable(state, selection);
    return;
  }

  if (selection.selectedShipId && selection.reachable?.has(clickedPlanet.id)) {
    const ship = state.ships.find((s) => s.id === selection.selectedShipId)!;
    moveShip(ship, clickedPlanet.id, state);
    selection.selectedPlanetId = clickedPlanet.id;
    recomputeReachable(state, selection);
    return;
  }

  selection.selectedPlanetId = clickedPlanet.id;
  selection.selectedShipId = undefined;
  selection.movingStarbaseFromPlanetId = undefined;
  selection.reachable = undefined;
}

export function refreshAfterEndTurn(state: GameState, selection: Selection): void {
  recomputeReachable(state, selection);
}
