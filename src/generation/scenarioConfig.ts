import type { ScenarioConfig, SideSetup } from '../model/types';

const NO_VICTORY = { enemyHasNoShips: false, enemyHasNoColonies: false, enemyHasNoMines: false };

function side(ships: string[]): SideSetup {
  return {
    starbase: true,
    ships: ships.map((role) => ({ role, zone: 0 })),
    worlds: { dead: 6, mineral: 5, life: 4, colony: 0, fortifiedColony: 0, mine: 0, fortifiedMine: 0 },
    starbucks: 25,
    cannotBuild: [],
    victory: { ...NO_VICTORY },
  };
}

/** The prototype's own setup: 15 unclaimed worlds a side, a starbase and three ships each. */
export const DEFAULT_SCENARIO: ScenarioConfig = {
  title: 'Random cluster',
  menuLine: '15 worlds a side, a starbase and three ships each.',
  sides: {
    alliance: side(['shofixti-scout', 'shofixti-scout', 'earthling-cruiser']),
    hierarchy: side(['umgah-drone', 'umgah-drone', 'ilwrath-avenger']),
  },
  movesPerTurn: 3,
  mineIncomePerTurn: 3,
};
