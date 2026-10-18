import type { GameState, Owner, Planet, PlanetType } from '../model/types';
import { LAYOUT } from '../generation/layout';
import type { ReachablePlanet } from '../game/gameState';
import { drawShipIcon } from './shipIcons';

const PLANET_RADIUS = 14;
const SHIP_ICON_RADIUS = 6;
// Roster crew spans roughly 6 (Shofixti Scout/Arilou Skiff) to 42 (Ur-Quan Dreadnought);
// bigger hulls get a slightly bigger icon so ship "weight" reads at a glance.
const MIN_CREW = 6;
const MAX_CREW = 42;

const TYPE_COLORS: Record<PlanetType, string> = {
  life: '#4caf6a',
  mineral: '#c98a3a',
  dead: '#6b7280',
};

const UNEXPLORED_COLOR = '#2f6fb8';
const BACKGROUND_COLOR = '#05070d';

const OWNER_COLORS: Record<Owner, string> = {
  alliance: '#4da3ff',
  hierarchy: '#ff5c5c',
  neutral: '#9aa4b8',
};

export interface ViewTransform {
  scale: number;
  offsetX: number;
  offsetY: number;
}

export function computeViewTransform(canvasWidth: number, canvasHeight: number): ViewTransform {
  const layoutWidth = LAYOUT.xMax - LAYOUT.xMin;
  const layoutHeight = LAYOUT.yMax - LAYOUT.yMin;
  const padding = 40;
  const scale = Math.min(
    (canvasWidth - padding * 2) / layoutWidth,
    (canvasHeight - padding * 2) / layoutHeight,
  );
  const offsetX = (canvasWidth - layoutWidth * scale) / 2 - LAYOUT.xMin * scale;
  const offsetY = (canvasHeight - layoutHeight * scale) / 2 - LAYOUT.yMin * scale;
  return { scale, offsetX, offsetY };
}

export function toScreen(x: number, y: number, view: ViewTransform): { x: number; y: number } {
  return { x: x * view.scale + view.offsetX, y: y * view.scale + view.offsetY };
}

export function toLogical(screenX: number, screenY: number, view: ViewTransform): { x: number; y: number } {
  return { x: (screenX - view.offsetX) / view.scale, y: (screenY - view.offsetY) / view.scale };
}

/** Screen position of every ship's icon, arranged in a ring around its planet. */
export function computeShipIconScreenPositions(state: GameState, view: ViewTransform): Map<string, { x: number; y: number }> {
  const planetsById = new Map(state.planets.map((p) => [p.id, p]));
  const shipsByPlanet = new Map<string, typeof state.ships>();
  for (const ship of state.ships) {
    const list = shipsByPlanet.get(ship.planetId) ?? [];
    list.push(ship);
    shipsByPlanet.set(ship.planetId, list);
  }

  const positions = new Map<string, { x: number; y: number }>();
  for (const [planetId, ships] of shipsByPlanet) {
    const p = planetsById.get(planetId);
    if (!p) continue;
    const base = toScreen(p.x, p.y, view);
    const dist = PLANET_RADIUS + 18;
    ships.forEach((ship, i) => {
      const angle = (i / ships.length) * Math.PI * 2;
      positions.set(ship.id, { x: base.x + Math.cos(angle) * dist, y: base.y + Math.sin(angle) * dist });
    });
  }
  return positions;
}

export function shipAt(screenX: number, screenY: number, state: GameState, view: ViewTransform): string | undefined {
  const positions = computeShipIconScreenPositions(state, view);
  const hitRadius = SHIP_ICON_RADIUS + 4;
  let closest: string | undefined;
  let closestDist = Infinity;
  for (const [shipId, pos] of positions) {
    const dist = Math.hypot(pos.x - screenX, pos.y - screenY);
    if (dist <= hitRadius && dist < closestDist) {
      closest = shipId;
      closestDist = dist;
    }
  }
  return closest;
}

export function planetAt(screenX: number, screenY: number, state: GameState, view: ViewTransform): Planet | undefined {
  const logical = toLogical(screenX, screenY, view);
  const hitRadius = (PLANET_RADIUS + 6) / view.scale;
  let closest: Planet | undefined;
  let closestDist = Infinity;
  for (const p of state.planets) {
    const dist = Math.hypot(p.x - logical.x, p.y - logical.y);
    if (dist <= hitRadius && dist < closestDist) {
      closest = p;
      closestDist = dist;
    }
  }
  return closest;
}

export interface RenderOptions {
  selectedPlanetId?: string;
  selectedShipId?: string;
  reachable?: Map<string, ReachablePlanet>;
}

export function render(ctx: CanvasRenderingContext2D, state: GameState, view: ViewTransform, options: RenderOptions = {}): void {
  const { canvas } = ctx;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const planetsById = new Map(state.planets.map((p) => [p.id, p]));

  // Connections
  ctx.strokeStyle = '#2a3350';
  ctx.lineWidth = 1.5;
  for (const c of state.connections) {
    const a = planetsById.get(c.a);
    const b = planetsById.get(c.b);
    if (!a || !b) continue;
    const sa = toScreen(a.x, a.y, view);
    const sb = toScreen(b.x, b.y, view);
    ctx.beginPath();
    ctx.moveTo(sa.x, sa.y);
    ctx.lineTo(sb.x, sb.y);
    ctx.stroke();
  }

  // Reachable-planet highlights (drawn under planets)
  if (options.reachable) {
    for (const planetId of options.reachable.keys()) {
      const p = planetsById.get(planetId);
      if (!p) continue;
      const s = toScreen(p.x, p.y, view);
      ctx.beginPath();
      ctx.arc(s.x, s.y, PLANET_RADIUS + 7, 0, Math.PI * 2);
      ctx.strokeStyle = '#f4d35e';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  // Planets
  for (const p of state.planets) {
    const s = toScreen(p.x, p.y, view);

    ctx.beginPath();
    ctx.arc(s.x, s.y, PLANET_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = p.explored ? TYPE_COLORS[p.type] : UNEXPLORED_COLOR;
    ctx.fill();
    ctx.lineWidth = p.id === options.selectedPlanetId ? 4 : 2.5;
    ctx.strokeStyle = OWNER_COLORS[p.owner];
    ctx.stroke();

    if (p.hasStarbase) {
      ctx.beginPath();
      ctx.arc(s.x, s.y, PLANET_RADIUS + 4, 0, Math.PI * 2);
      ctx.strokeStyle = '#f4d35e';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  // Ship icons: one per ship, arranged around its planet
  const shipPositions = computeShipIconScreenPositions(state, view);
  for (const ship of state.ships) {
    const pos = shipPositions.get(ship.id);
    if (!pos) continue;

    const crewFraction = Math.min(1, Math.max(0, (ship.crew - MIN_CREW) / (MAX_CREW - MIN_CREW)));
    const size = SHIP_ICON_RADIUS * (0.75 + 0.55 * crewFraction);

    drawShipIcon(ctx, ship.type, pos.x, pos.y, size, OWNER_COLORS[ship.owner], BACKGROUND_COLOR);

    // Selection ring: a fresh circle path, independent of whatever path the icon left behind.
    if (ship.id === options.selectedShipId) {
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, size + 2.5, 0, Math.PI * 2);
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
    }
  }
}
