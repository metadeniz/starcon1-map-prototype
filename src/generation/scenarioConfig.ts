import type { ScenarioConfig } from '../model/types';

export const DEFAULT_SCENARIO: ScenarioConfig = {
  totalPlanets: 30,
  neckSize: { type: 'random', min: 2, max: 4 },
  planetTypeWeights: { life: 0.25, mineral: 0.35, dead: 0.4 },
  startingShips: {
    alliance: ['shofixti-scout', 'shofixti-scout', 'earthling-cruiser'],
    hierarchy: ['umgah-drone', 'umgah-drone', 'ilwrath-avenger'],
  },
  movesPerTurn: 3,
  startingStarbucks: 25,
  mineIncomePerTurn: 3,
};
