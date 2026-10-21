import type { Faction, ScenarioConfig, SideSetup, WorldCounts } from '../model/types';
import { SHIP_ROSTER } from '../model/shipRoster';
import { DEFAULT_SCENARIO } from './scenarioConfig';
import { worldTotal } from './galaxyGenerator';
import { randInt, type Rng } from './rng';

const FACTIONS: Faction[] = ['alliance', 'hierarchy'];

/** SC1 refuses fewer than 2 or more than 50 worlds, and a side's block holds 7 starting ships. */
export const MAX_WORLDS = 50;
export const MAX_STARTING_SHIPS = 7;

const between = (rng: Rng, min: number, max: number) => min + randInt(rng, max - min + 1);

/**
 * A typical even game with random numbers: both sides get the same worlds, Starbucks and
 * starting fleet (the same cost ranks from each roster), both have a starbase, every ship
 * can be built, and a side wins by wiping out the enemy.
 */
export function randomTypicalScenario(rng: Rng): ScenarioConfig {
  const perSide = between(rng, 12, 20);
  const life = between(rng, 3, 5);
  const mineral = between(rng, 3, 6);
  const worlds: WorldCounts = {
    dead: perSide - life - mineral,
    mineral,
    life,
    colony: 0,
    fortifiedColony: 0,
    mine: 0,
    fortifiedMine: 0,
  };
  const starbucks = 5 * between(rng, 3, 8);
  // Fleets come from the cheaper half of each roster so nobody starts with a Dreadnought.
  const ranks = Array.from({ length: between(rng, 2, 4) }, () => randInt(rng, 4)).sort((a, b) => a - b);
  const side = (faction: Faction): SideSetup => ({
    starbase: true,
    ships: ranks.map((rank) => ({ role: SHIP_ROSTER[faction][rank].role, zone: 0 })),
    worlds: { ...worlds },
    starbucks,
    cannotBuild: [],
    victory: { enemyHasNoShips: false, enemyHasNoColonies: false, enemyHasNoMines: false },
  });
  return {
    title: 'Random typical game',
    menuLine: `${perSide} worlds a side, a starbase, ${ranks.length} ships and ${starbucks} Starbucks each.`,
    sides: { alliance: side('alliance'), hierarchy: side('hierarchy') },
    movesPerTurn: DEFAULT_SCENARIO.movesPerTurn,
    mineIncomePerTurn: DEFAULT_SCENARIO.mineIncomePerTurn,
  };
}

/** A deep copy of the default scenario, as the starting point for custom settings. */
export function defaultCustomScenario(): ScenarioConfig {
  return { ...structuredClone(DEFAULT_SCENARIO), title: 'Custom game', menuLine: undefined };
}

/** What is wrong with a scenario, in plain words; empty when it can be played. */
export function scenarioProblems(scenario: ScenarioConfig): string[] {
  const problems: string[] = [];
  const total = FACTIONS.reduce((sum, f) => sum + worldTotal(scenario.sides[f].worlds), 0);
  if (total > MAX_WORLDS) problems.push(`The map has ${total} worlds; the most is ${MAX_WORLDS}.`);
  for (const faction of FACTIONS) {
    const side = scenario.sides[faction];
    const name = faction === 'alliance' ? 'The Alliance' : 'The Hierarchy';
    const counts = Object.values(side.worlds);
    if (counts.some((n) => !Number.isInteger(n) || n < 0)) problems.push(`${name}'s world counts must be whole numbers, 0 or more.`);
    else if (worldTotal(side.worlds) < 1) problems.push(`${name} needs at least 1 world.`);
    if (side.ships.length > MAX_STARTING_SHIPS) problems.push(`${name} can start with at most ${MAX_STARTING_SHIPS} ships.`);
    if (!side.starbase && side.ships.length === 0) problems.push(`${name} needs a starbase or at least 1 ship.`);
    if (!Number.isInteger(side.starbucks) || side.starbucks < 0 || side.starbucks > 999)
      problems.push(`${name}'s Starbucks must be 0 to 999.`);
  }
  if (!Number.isInteger(scenario.movesPerTurn) || scenario.movesPerTurn < 1 || scenario.movesPerTurn > 9)
    problems.push('Moves per turn must be 1 to 9.');
  if (!Number.isInteger(scenario.mineIncomePerTurn) || scenario.mineIncomePerTurn < 0 || scenario.mineIncomePerTurn > 99)
    problems.push('Mine income must be 0 to 99.');
  return problems;
}
