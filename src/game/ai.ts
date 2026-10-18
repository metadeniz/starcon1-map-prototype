import type { Faction, GameState, ImprovementType } from '../model/types';
import { buildShip, moveShip, reachablePlanets, startConstruction } from './gameState';
import { isImprovementAllowed } from '../model/improvements';
import { SHIP_ROSTER } from '../model/shipRoster';

function preferredImprovement(planetType: 'life' | 'mineral' | 'dead'): ImprovementType {
  if (planetType === 'life') return 'colony';
  if (planetType === 'mineral') return 'mine';
  return 'fortification';
}

/**
 * A simple heuristic AI turn: idle ships either start building on eligible unclaimed ground
 * they're already sitting on, or move toward the nearest planet not already theirs to expand
 * the frontier. Any owned starbase spends available Starbucks on the best ship it can afford.
 * Not strategically deep — just enough to keep the opposing side playing a full game.
 */
export function runAiTurn(state: GameState, faction: Faction): void {
  const claimedTargets = new Set<string>();

  for (const ship of state.ships.filter((s) => s.owner === faction)) {
    const planet = state.planets.find((p) => p.id === ship.planetId);
    if (!planet) continue;

    // Already building here itself? Stay and let it finish.
    if (planet.underConstruction?.shipId === ship.id) continue;

    if (!planet.hasStarbase && !planet.improvement && !planet.underConstruction && (planet.owner === 'neutral' || planet.owner === faction)) {
      const type = preferredImprovement(planet.type);
      if (isImprovementAllowed(planet, type)) {
        try {
          startConstruction(ship.id, type, state);
          continue;
        } catch {
          // Fall through to movement if construction couldn't start for some reason.
        }
      }
    }

    if (ship.movesRemaining <= 0) continue;

    const reachable = Array.from(reachablePlanets(ship, state).values()).filter((r) => !claimedTargets.has(r.planetId));
    if (reachable.length === 0) continue;

    const notOurs = reachable
      .map((r) => ({ ...r, planet: state.planets.find((p) => p.id === r.planetId)! }))
      .filter((r) => r.planet.owner !== faction)
      .sort((a, b) => a.cost - b.cost);
    const target = notOurs[0] ?? [...reachable].sort((a, b) => a.cost - b.cost)[0];

    claimedTargets.add(target.planetId);
    moveShip(ship, target.planetId, state);
  }

  for (const planet of state.planets.filter((p) => p.hasStarbase && p.owner === faction)) {
    const affordable = [...SHIP_ROSTER[faction]].sort((a, b) => b.cost - a.cost).find((def) => state.starbucks[faction] >= def.cost);
    if (affordable) {
      buildShip(faction, planet.id, affordable.role, state);
    }
  }
}
