import type { Connection, Faction, GameState, Planet, PlanetType, ScenarioConfig, Ship } from '../model/types';
import { getShipDefinition } from '../model/shipRoster';
import { mulberry32, shuffle, type Rng } from './rng';
import { makePlanetNamer } from './planetNames';
import { LAYOUT } from './layout';
import { nextId } from '../model/id';
import { generateCluster, type Cluster, type ClusterStar } from './sc1Cluster';

/**
 * Splits `count` worlds into exact per-type counts by largest remainder. Like SC1's scenario
 * decks, each side gets exactly these counts, not a random roll per planet.
 */
export function planetTypeDeck(weights: Record<PlanetType, number>, count: number): Record<PlanetType, number> {
  const entries = Object.entries(weights) as [PlanetType, number][];
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  const exact = entries.map(([type, w]) => ({ type, value: (w / total) * count }));
  const deck = Object.fromEntries(exact.map((e) => [e.type, Math.floor(e.value)])) as Record<PlanetType, number>;
  let left = count - exact.reduce((sum, e) => sum + Math.floor(e.value), 0);
  for (const e of [...exact].sort((a, b) => (b.value % 1) - (a.value % 1))) {
    if (left-- <= 0) break;
    deck[e.type]++;
  }
  return deck;
}

/** Deals one side's planet types: the homeworld takes a life card, the rest are shuffled onto the other stars. */
function dealTypes(rng: Rng, weights: Record<PlanetType, number>, count: number): PlanetType[] {
  const deck = planetTypeDeck(weights, count);
  if (deck.life > 0) deck.life--;
  else if (deck.dead > 0) deck.dead--;
  else deck.mineral--;
  const cards = (Object.entries(deck) as [PlanetType, number][]).flatMap(([type, n]) => Array<PlanetType>(n).fill(type));
  return shuffle(rng, cards);
}

/** Maps SC1 units onto the layout: side A (Hierarchy) on top, side B (Alliance) at the bottom. */
function toLayout(cluster: Cluster, star: ClusterStar): { x: number; y: number } {
  const fieldWidth = 2 * cluster.halfWidth;
  const fieldHeight = 2 * cluster.centre;
  const scale = Math.min((LAYOUT.xMax - LAYOUT.xMin) / fieldWidth, (LAYOUT.yMax - LAYOUT.yMin) / fieldHeight);
  const midX = (LAYOUT.xMin + LAYOUT.xMax) / 2;
  const midY = (LAYOUT.yMin + LAYOUT.yMax) / 2;
  return { x: midX + star.across * scale, y: midY - (star.along - cluster.centre) * scale };
}

function makeStartingShips(scenario: ScenarioConfig, owner: Faction, planetId: string): Ship[] {
  return scenario.startingShips[owner].map((role) => {
    const def = getShipDefinition(owner, role);
    return {
      id: nextId('ship'),
      type: def.name,
      owner,
      crew: def.crew,
      currentCrew: def.crew,
      planetId,
      movesRemaining: scenario.movesPerTurn,
    };
  });
}

export function generateGalaxy(scenario: ScenarioConfig, humanFaction: Faction, seed: number = Date.now()): GameState {
  const rng = mulberry32(seed);
  const namer = makePlanetNamer(rng);

  // Hierarchy of Battle Thralls is always on top (SC1's side A, which also holds the centre
  // star), Alliance of Free Stars always on the bottom. An odd total gives the Hierarchy one extra.
  const hierarchyCount = Math.ceil(scenario.totalPlanets / 2);
  const allianceCount = scenario.totalPlanets - hierarchyCount;
  const cluster = generateCluster(rng, hierarchyCount, allianceCount);

  const ids = new Map(cluster.stars.map((s) => [s, nextId('planet')]));
  const connections: Connection[] = [];
  for (const s of cluster.stars) {
    for (const other of s.links) {
      if (other.index > s.index) connections.push({ a: ids.get(s)!, b: ids.get(other)! });
    }
  }

  const planets: Planet[] = [];
  const homeworldIds = {} as Record<Faction, string>;
  for (const [faction, side] of [
    ['hierarchy', 'A'],
    ['alliance', 'B'],
  ] as const) {
    const sideStars = cluster.stars.filter((s) => s.side === side);
    // SC1 puts each starbase on the star farthest from the centre on its own side.
    const home = sideStars.reduce((far, s) =>
      Math.abs(s.along - cluster.centre) > Math.abs(far.along - cluster.centre) ? s : far,
    );
    homeworldIds[faction] = ids.get(home)!;
    const types = dealTypes(rng, scenario.planetTypeWeights, sideStars.length);
    for (const s of sideStars) {
      const isHome = s === home;
      planets.push({
        id: ids.get(s)!,
        name: namer(),
        ...toLayout(cluster, s),
        type: isHome ? 'life' : types.pop()!,
        owner: isHome ? faction : 'neutral',
        hasStarbase: isHome,
        starbaseMovesRemaining: isHome ? 1 : 0,
        explored: isHome,
      });
    }
  }

  const ships: Ship[] = [
    ...makeStartingShips(scenario, 'alliance', homeworldIds.alliance),
    ...makeStartingShips(scenario, 'hierarchy', homeworldIds.hierarchy),
  ];

  return {
    planets,
    connections,
    ships,
    turn: 1,
    scenario,
    starbucks: { alliance: scenario.startingStarbucks, hierarchy: scenario.startingStarbucks },
    humanFaction,
    currentFaction: humanFaction,
  };
}
