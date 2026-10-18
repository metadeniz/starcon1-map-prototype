import type { Connection, Faction, GameState, NeckSizeConfig, Planet, ScenarioConfig, Ship } from '../model/types';
import { getShipDefinition } from '../model/shipRoster';
import { mulberry32, pick, randInt, shuffle, weightedPick, type Rng } from './rng';
import { makePlanetNamer } from './planetNames';
import { LAYOUT } from './layout';
import { nextId } from '../model/id';
import { buildProximityGraph, nearestNode, nearestNodes } from './proximityGraph';

function scatterPositions(
  rng: Rng,
  count: number,
  yRange: readonly [number, number],
  xRange: readonly [number, number] = [LAYOUT.xMin, LAYOUT.xMax],
): { x: number; y: number }[] {
  const cols = Math.max(1, Math.ceil(Math.sqrt(count)));
  const rows = Math.max(1, Math.ceil(count / cols));
  const cellW = (xRange[1] - xRange[0]) / cols;
  const cellH = (yRange[1] - yRange[0]) / rows;
  const cells = shuffle(
    rng,
    Array.from({ length: cols * rows }, (_, i) => i),
  ).slice(0, count);

  return cells.map((cellIndex) => {
    const col = cellIndex % cols;
    const row = Math.floor(cellIndex / cols);
    const cx = xRange[0] + cellW * (col + 0.5);
    const cy = yRange[0] + cellH * (row + 0.5);
    const jitterX = (rng() - 0.5) * cellW * 0.7;
    const jitterY = (rng() - 0.5) * cellH * 0.7;
    return { x: cx + jitterX, y: cy + jitterY };
  });
}

type BasePlanet = Omit<Planet, 'owner' | 'type' | 'hasStarbase' | 'starbaseMovesRemaining' | 'explored'>;

// Fixed reference point for the gap between the two sides, used to pick each side's bridge
// planet even when there's no actual planet generated in the middle to target.
const CHOKE_REFERENCE_POINT = {
  x: (LAYOUT.chokeX[0] + LAYOUT.chokeX[1]) / 2,
  y: (LAYOUT.chokeY[0] + LAYOUT.chokeY[1]) / 2,
};

function buildSide(
  rng: Rng,
  size: number,
  yRange: readonly [number, number],
  namer: () => string,
): { planets: BasePlanet[]; connections: Connection[]; rootId: string } {
  const ids = Array.from({ length: size }, () => nextId('planet'));
  const positions = scatterPositions(rng, size, yRange);
  const planets = ids.map((id, i) => ({ id, name: namer(), x: positions[i].x, y: positions[i].y }));

  const connections = buildProximityGraph(rng, planets, 1, 0.5);

  // The nearest-to-the-gap planet, used as the bridge anchor when there's no neck at all.
  const rootId = nearestNode(planets, CHOKE_REFERENCE_POINT);

  return { planets, connections, rootId };
}

/** Picks a homeworld anywhere in the side except planets directly bridged to the neck. */
function pickHomeworld(rng: Rng, planets: BasePlanet[], bridgePlanetIds: Set<string>): string {
  const eligible = planets.filter((p) => !bridgePlanetIds.has(p.id));
  const pool = eligible.length > 0 ? eligible : planets;
  return pick(rng, pool).id;
}

export function resolveNeckSize(rng: Rng, config: NeckSizeConfig): number {
  if (config.type === 'fixed') return config.size;
  return config.min + randInt(rng, config.max - config.min + 1);
}

/** The neck/chokepoint area: a small cluster of planets bridging the two sides, all directly
 * connected to each other (a clique) so the whole neck reads as one dense contested pocket. */
function buildNeck(rng: Rng, size: number, namer: () => string): { planets: BasePlanet[]; connections: Connection[] } {
  if (size === 0) return { planets: [], connections: [] };
  const ids = Array.from({ length: size }, () => nextId('planet'));
  const positions = scatterPositions(rng, size, LAYOUT.chokeY, LAYOUT.chokeX);
  const planets = ids.map((id, i) => ({ id, name: namer(), x: positions[i].x, y: positions[i].y }));
  const connections: Connection[] = [];
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      connections.push({ a: ids[i], b: ids[j] });
    }
  }
  return { planets, connections };
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

  // Resolve the neck size first; any leftover planet needed to keep both sides equal-sized
  // gets absorbed into the neck rather than favoring one side over the other.
  let neckCount = Math.max(0, Math.min(resolveNeckSize(rng, scenario.neckSize), scenario.totalPlanets));
  let remaining = scenario.totalPlanets - neckCount;
  if (remaining % 2 !== 0) {
    neckCount += 1;
    remaining -= 1;
  }
  const sideCount = remaining / 2;

  // Hierarchy of Battle Thralls is always on top, Alliance of Free Stars always on the bottom.
  const hierarchy = buildSide(rng, sideCount, LAYOUT.topY, namer);
  const alliance = buildSide(rng, sideCount, LAYOUT.bottomY, namer);
  const neck = buildNeck(rng, neckCount, namer);

  const bridgeConnections: Connection[] = [];
  const allianceBridgeIds = new Set<string>();
  const hierarchyBridgeIds = new Set<string>();
  if (neck.planets.length === 0) {
    bridgeConnections.push({ a: alliance.rootId, b: hierarchy.rootId });
    allianceBridgeIds.add(alliance.rootId);
    hierarchyBridgeIds.add(hierarchy.rootId);
  } else {
    // At least 2 distinct planets in EACH side's cluster (capped by cluster size) each get their
    // own bridge into the neck, so the frontier isn't a single choke planet acting as sole gatekeeper.
    for (const [side, bridgeIds] of [
      [alliance, allianceBridgeIds],
      [hierarchy, hierarchyBridgeIds],
    ] as const) {
      const bridgeSidePlanetIds = nearestNodes(side.planets, CHOKE_REFERENCE_POINT, Math.min(2, side.planets.length));
      for (const sidePlanetId of bridgeSidePlanetIds) {
        bridgeIds.add(sidePlanetId);
        const sidePlanet = side.planets.find((p) => p.id === sidePlanetId)!;
        const neckPlanetId = nearestNode(neck.planets, sidePlanet);
        bridgeConnections.push({ a: sidePlanetId, b: neckPlanetId });
      }
    }
  }

  const allConnections = [...alliance.connections, ...hierarchy.connections, ...neck.connections, ...bridgeConnections];

  // The homeworld can be anywhere in the cluster — it just can't be one of the planets directly
  // bridged to the neck, so a starbase never sits right at the contested frontier.
  const allianceHomeworldId = pickHomeworld(rng, alliance.planets, allianceBridgeIds);
  const hierarchyHomeworldId = pickHomeworld(rng, hierarchy.planets, hierarchyBridgeIds);

  const planets: Planet[] = [];
  for (const p of alliance.planets) {
    const isHome = p.id === allianceHomeworldId;
    planets.push({
      ...p,
      type: isHome ? 'life' : weightedPick(rng, scenario.planetTypeWeights),
      owner: isHome ? 'alliance' : 'neutral',
      hasStarbase: isHome,
      starbaseMovesRemaining: isHome ? 1 : 0,
      explored: isHome,
    });
  }
  for (const p of hierarchy.planets) {
    const isHome = p.id === hierarchyHomeworldId;
    planets.push({
      ...p,
      type: isHome ? 'life' : weightedPick(rng, scenario.planetTypeWeights),
      owner: isHome ? 'hierarchy' : 'neutral',
      hasStarbase: isHome,
      starbaseMovesRemaining: isHome ? 1 : 0,
      explored: isHome,
    });
  }
  for (const p of neck.planets) {
    planets.push({
      ...p,
      type: weightedPick(rng, scenario.planetTypeWeights),
      owner: 'neutral',
      hasStarbase: false,
      starbaseMovesRemaining: 0,
      explored: false,
    });
  }

  const ships: Ship[] = [
    ...makeStartingShips(scenario, 'alliance', allianceHomeworldId),
    ...makeStartingShips(scenario, 'hierarchy', hierarchyHomeworldId),
  ];

  return {
    planets,
    connections: allConnections,
    ships,
    turn: 1,
    scenario,
    starbucks: { alliance: scenario.startingStarbucks, hierarchy: scenario.startingStarbucks },
    humanFaction,
    currentFaction: humanFaction,
  };
}
