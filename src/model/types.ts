export type Faction = 'alliance' | 'hierarchy';
export type PlanetType = 'life' | 'mineral' | 'dead';
export type Owner = Faction | 'neutral';
export type ImprovementType = 'colony' | 'mine' | 'fortification';

export interface UnderConstruction {
  type: ImprovementType;
  owner: Faction;
  shipId: string;
  turnsRemaining: number;
}

export interface Planet {
  id: string;
  name: string;
  type: PlanetType;
  owner: Owner;
  hasStarbase: boolean;
  /** Moves left this turn for the starbase here (0 when there's no starbase). Refills to 1 each turn. */
  starbaseMovesRemaining: number;
  improvement?: ImprovementType;
  /** A fortified colony or mine, as SC1 scenarios can start with. */
  fortified?: boolean;
  underConstruction?: UnderConstruction;
  explored: boolean;
  x: number;
  y: number;
}

export interface Connection {
  a: string;
  b: string;
}

export interface Ship {
  id: string;
  type: string;
  owner: Faction;
  /** Design crew capacity — fixed for the ship's class. */
  crew: number;
  /** Crew currently aboard; starts equal to `crew`, reduced by future combat damage. */
  currentCrew: number;
  planetId: string;
  movesRemaining: number;
}

/** One side's worlds, in SC1's scenario order. The side's half of the map has exactly these. */
export interface WorldCounts {
  dead: number;
  mineral: number;
  life: number;
  colony: number;
  fortifiedColony: number;
  mine: number;
  fortifiedMine: number;
}

/**
 * Where a starting ship is placed, as in SC1: 0 = own back half, 1 = own front half,
 * 2 = the enemy's nearest unclaimed stars, 3 = anywhere.
 */
export type StartZone = 0 | 1 | 2 | 3;

export interface StartingShip {
  role: string;
  zone: StartZone;
}

/** A side wins when the enemy has none of each thing that is set. */
export interface VictoryConditions {
  enemyHasNoShips: boolean;
  enemyHasNoColonies: boolean;
  enemyHasNoMines: boolean;
}

export interface SideSetup {
  /** Starts with a starbase on the star farthest from the centre. */
  starbase: boolean;
  ships: StartingShip[];
  worlds: WorldCounts;
  starbucks: number;
  /** Ship roles this side may not build. */
  cannotBuild: string[];
  victory: VictoryConditions;
}

export interface ScenarioConfig {
  title: string;
  /** One-line summary (SC1's menu line). */
  menuLine?: string;
  description?: string;
  sides: Record<Faction, SideSetup>;
  /** Who moves first. Unset means the human does. */
  firstMove?: Faction;
  movesPerTurn: number;
  mineIncomePerTurn: number;
  /** SC1's "random events off" flag. The prototype has no random events, but SC1 files keep it. */
  randomEventsOff?: boolean;
}

export interface GameState {
  planets: Planet[];
  connections: Connection[];
  ships: Ship[];
  turn: number;
  scenario: ScenarioConfig;
  starbucks: Record<Faction, number>;
  /** The side the human is playing; the other side is AI-controlled. */
  humanFaction: Faction;
  /** Whose turn it currently is. Sides alternate; a new round starts when this cycles back to `humanFaction`. */
  currentFaction: Faction;
}
