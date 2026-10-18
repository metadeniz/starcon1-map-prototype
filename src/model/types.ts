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

/** How many planets make up the neck/chokepoint area between the two sides. */
export type NeckSizeConfig = { type: 'fixed'; size: number } | { type: 'random'; min: number; max: number };

export interface ScenarioConfig {
  /** Total planets in the galaxy. The neck comes out of this total; the rest splits evenly between the two sides. */
  totalPlanets: number;
  neckSize: NeckSizeConfig;
  planetTypeWeights: Record<PlanetType, number>;
  startingShips: Record<Faction, string[]>;
  movesPerTurn: number;
  startingStarbucks: number;
  mineIncomePerTurn: number;
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
