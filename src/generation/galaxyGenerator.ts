import type { Connection, Faction, GameState, ImprovementType, Planet, PlanetType, ScenarioConfig, Ship, StartingShip, WorldCounts } from '../model/types';
import { getShipDefinition } from '../model/shipRoster';
import { mulberry32, randInt } from './rng';
import { makePlanetNamer } from './planetNames';
import { LAYOUT } from './layout';
import { nextId } from '../model/id';
import { generateCluster, isFrontStar, type Cluster, type ClusterStar } from './sc1Cluster';

const FACTIONS: Faction[] = ['alliance', 'hierarchy'];
const enemyOf = (f: Faction): Faction => (f === 'alliance' ? 'hierarchy' : 'alliance');

/** SC1's world deck, in the order it subtracts the counts when drawing a card. */
const WORLD_DECK: { key: keyof WorldCounts; type: PlanetType; improvement?: ImprovementType; fortified?: boolean }[] = [
  { key: 'dead', type: 'dead' },
  { key: 'life', type: 'life' },
  { key: 'mineral', type: 'mineral' },
  { key: 'colony', type: 'life', improvement: 'colony' },
  { key: 'mine', type: 'mineral', improvement: 'mine' },
  { key: 'fortifiedColony', type: 'life', improvement: 'colony', fortified: true },
  { key: 'fortifiedMine', type: 'mineral', improvement: 'mine', fortified: true },
];

export function worldTotal(worlds: WorldCounts): number {
  return WORLD_DECK.reduce((sum, card) => sum + worlds[card.key], 0);
}

/** Maps SC1 units onto the layout: side B (Hierarchy) on top, side A (Alliance) at the bottom. */
function toLayout(cluster: Cluster, star: ClusterStar): { x: number; y: number } {
  const fieldWidth = 2 * cluster.halfWidth;
  const fieldHeight = 2 * cluster.centre;
  const scale = Math.min((LAYOUT.xMax - LAYOUT.xMin) / fieldWidth, (LAYOUT.yMax - LAYOUT.yMin) / fieldHeight);
  const midX = (LAYOUT.xMin + LAYOUT.xMax) / 2;
  const midY = (LAYOUT.yMin + LAYOUT.yMax) / 2;
  return { x: midX + star.across * scale, y: midY + (star.along - cluster.centre) * scale };
}

function makeShip(scenario: ScenarioConfig, owner: Faction, role: string, planetId: string): Ship {
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
}

/**
 * Builds the starting map the way SC1's scenario setup does (STARCON.EXE 014C:01FE):
 * each side gets one star per world in its scenario, the cluster is generated with those
 * counts, each side's worlds are dealt onto its half from a shuffled deck, and the starbase
 * and ships are placed by start zone.
 */
export function generateGalaxy(scenario: ScenarioConfig, humanFaction: Faction, seed: number = Date.now()): GameState {
  const rng = mulberry32(seed);
  const namer = makePlanetNamer(rng);
  const counts = {
    alliance: worldTotal(scenario.sides.alliance.worlds),
    hierarchy: worldTotal(scenario.sides.hierarchy.worlds),
  };

  // SC1's side 0 (the Alliance block) takes the high half and the centre star.
  // It is drawn at the bottom so the Hierarchy stays on top.
  const cluster = generateCluster(rng, counts.alliance, counts.hierarchy);

  const planetOf = new Map<ClusterStar, Planet>();
  for (const star of cluster.stars) {
    planetOf.set(star, {
      id: nextId('planet'),
      name: namer(),
      ...toLayout(cluster, star),
      type: 'dead',
      owner: 'neutral',
      hasStarbase: false,
      starbaseMovesRemaining: 0,
      explored: false,
    });
  }
  const connections: Connection[] = [];
  for (const s of cluster.stars) {
    for (const other of s.links) {
      if (other.index > s.index) connections.push({ a: planetOf.get(s)!.id, b: planetOf.get(other)!.id });
    }
  }

  // Every star, counted from each side's own far end toward the enemy's.
  const walk: Record<Faction, Planet[]> = {
    alliance: [...cluster.stars].sort((a, b) => b.along - a.along).map((s) => planetOf.get(s)!),
    hierarchy: [...cluster.stars].sort((a, b) => a.along - b.along).map((s) => planetOf.get(s)!),
  };
  const isFront = new Set(cluster.stars.filter((s) => isFrontStar(cluster, s)).map((s) => planetOf.get(s)!));

  // Deal worlds: one card per star, drawn at random from the side's deck.
  const back = { alliance: 0, hierarchy: 0 };
  const front = { alliance: 0, hierarchy: 0 };
  const unowned = { alliance: 0, hierarchy: 0 };
  for (const faction of FACTIONS) {
    const deck = { ...scenario.sides[faction].worlds };
    let left = counts[faction];
    unowned[faction] = left;
    for (const planet of walk[faction].slice(0, counts[faction])) {
      if (isFront.has(planet)) front[faction]++;
      else back[faction]++;
      let r = randInt(rng, left--);
      const card = WORLD_DECK.find((c) => (r -= deck[c.key]) < 0)!;
      deck[card.key]--;
      planet.type = card.type;
      if (card.improvement) {
        planet.improvement = card.improvement;
        if (card.fortified) planet.fortified = true;
        planet.owner = faction;
        planet.explored = true;
        unowned[faction]--;
      }
    }
  }

  // Place the starbase and ships. A ship alone at a world nobody has improved claims it.
  const ships: Ship[] = [];
  // Returns the star and whether this side already owned it. SC1 rerolls picks the enemy owns.
  const place = (faction: Faction, base: number, range: number): [Planet, boolean] => {
    const options = walk[faction].slice(base, base + Math.max(range, 1)).filter((p) => p.owner !== enemyOf(faction));
    const planet = options.length > 0 ? options[randInt(rng, options.length)] : walk[faction][0];
    const wasOwn = planet.owner === faction;
    const enemyHere = ships.some((s) => s.planetId === planet.id && s.owner !== faction);
    if (!enemyHere && !planet.improvement) planet.owner = faction;
    planet.explored = true;
    return [planet, wasOwn];
  };
  const placeShip = (faction: Faction, ship: StartingShip, planet: Planet) =>
    ships.push(makeShip(scenario, faction, ship.role, planet.id));

  for (const faction of FACTIONS) {
    const side = scenario.sides[faction];
    if (side.starbase) {
      // SC1 always puts the starbase on the star farthest from the centre.
      const [planet, wasOwn] = place(faction, 0, 1);
      if (!wasOwn) unowned[faction]--;
      planet.hasStarbase = true;
      planet.starbaseMovesRemaining = 1;
    }
    for (const ship of side.ships) {
      if (ship.zone > 1) continue;
      let [base, range] = ship.zone === 0 ? [0, back[faction]] : [back[faction], front[faction]];
      if (range === 0) [base, range] = [0, back[faction] || front[faction]];
      const [planet, wasOwn] = place(faction, base, range);
      if (!wasOwn) unowned[faction]--;
      placeShip(faction, ship, planet);
    }
  }
  for (const faction of FACTIONS) {
    const own = counts[faction];
    for (const ship of scenario.sides[faction].ships) {
      if (ship.zone < 2) continue;
      let base = 0;
      let range = cluster.stars.length;
      if (ship.zone === 2) {
        // The enemy stars nearest the middle, as many as the enemy has unclaimed.
        [base, range] = [own, unowned[enemyOf(faction)]];
        if (range === 0) {
          range = front[faction] || back[faction];
          base = own - range;
        }
      }
      placeShip(faction, ship, place(faction, base, range)[0]);
    }
  }

  const planets = walk.hierarchy;
  return {
    planets,
    connections,
    ships,
    turn: 1,
    scenario,
    starbucks: { alliance: scenario.sides.alliance.starbucks, hierarchy: scenario.sides.hierarchy.starbucks },
    humanFaction,
    currentFaction: scenario.firstMove ?? humanFaction,
  };
}
