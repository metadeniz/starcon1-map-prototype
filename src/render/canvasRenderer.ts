import type { GameState, Owner, Planet, PlanetType } from '../model/types';
import { LAYOUT } from '../generation/layout';
import type { ReachablePlanet } from '../game/gameState';
import { drawMapIcon, iconRadius, starbaseIconKey } from './shipIcons';
import { drawPlanetSprite } from './planetSprites';

const PLANET_RADIUS = 10;
/** Half the width of a planet marker (colony diamond, mine plus, fortification square). */
const MARKER_HALF = 19;
/** Distance from a planet's centre to the ring its starbase and ships sit on, clear of a marker. */
const RING_DISTANCE = MARKER_HALF + 14;
const SHIP_HIT_RADIUS = 12;

const TYPE_COLORS: Record<PlanetType, string> = {
  life: '#4caf6a',
  mineral: '#c98a3a',
  dead: '#6b7280',
};

// Grey rather than blue, so unexplored planets don't read as the Hierarchy's.
const UNEXPLORED_COLOR = '#6b7385';

// SC1's planet markers (setup.pkg package 16, type 3, instance 4) are 5x5 one-colour glyphs: a
// diamond for a colony, a plus for a mine and a square for a fortification. Here they are drawn as
// thin outlines over the planet so it shows through. A fortified colony or mine gets the square
// with the diamond or plus drawn over it, the same way SC1 layers them.
type MarkerShape = 'colony' | 'mine' | 'fortified';
const MARKER_LINE_WIDTH = 3;
// SC1's own marker colours (palette entries the exe picks at linear 0x412E): yellow for the
// Alliance and blue for the Hierarchy, with the fortification square a lighter shade.
const MARKER_COLORS: Record<Owner, { improvement: string; fortified: string }> = {
  alliance: { improvement: '#ffff7f', fortified: '#ffffbb' },
  hierarchy: { improvement: '#2fa7f3', fortified: '#5fbfff' },
  neutral: { improvement: '#eef0f5', fortified: '#eef0f5' },
};

function drawMarker(ctx: CanvasRenderingContext2D, shape: MarkerShape, cx: number, cy: number, color: string): void {
  const h = MARKER_HALF;
  ctx.beginPath();
  if (shape === 'colony') {
    ctx.moveTo(cx, cy - h);
    ctx.lineTo(cx + h, cy);
    ctx.lineTo(cx, cy + h);
    ctx.lineTo(cx - h, cy);
    ctx.closePath();
  } else if (shape === 'mine') {
    ctx.moveTo(cx, cy - h);
    ctx.lineTo(cx, cy + h);
    ctx.moveTo(cx - h, cy);
    ctx.lineTo(cx + h, cy);
  } else {
    ctx.rect(cx - h, cy - h, 2 * h, 2 * h);
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = MARKER_LINE_WIDTH;
  ctx.lineJoin = 'miter';
  ctx.stroke();
}

// SC1's side colours: yellow for the Alliance and blue for the Hierarchy.
const OWNER_COLORS: Record<Owner, string> = {
  alliance: '#ffff7f',
  hierarchy: '#2fa7f3',
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

/**
 * Screen position of every ship's icon, arranged in a ring around its planet. A starbase takes
 * the first slot of its planet's ring (keyed by planet id in `starbases`).
 */
export function computeIconScreenPositions(
  state: GameState,
  view: ViewTransform,
): { ships: Map<string, { x: number; y: number }>; starbases: Map<string, { x: number; y: number }> } {
  const shipsByPlanet = new Map<string, typeof state.ships>();
  for (const ship of state.ships) {
    const list = shipsByPlanet.get(ship.planetId) ?? [];
    list.push(ship);
    shipsByPlanet.set(ship.planetId, list);
  }

  const ships = new Map<string, { x: number; y: number }>();
  const starbases = new Map<string, { x: number; y: number }>();
  for (const p of state.planets) {
    const here = shipsByPlanet.get(p.id) ?? [];
    const slots = here.length + (p.hasStarbase ? 1 : 0);
    if (slots === 0) continue;
    const base = toScreen(p.x, p.y, view);
    // Start at the top-left so a lone starbase or ship sits clear of the links below it.
    const slotPosition = (i: number) => {
      const angle = -Math.PI * 0.75 + (i / slots) * Math.PI * 2;
      return { x: base.x + Math.cos(angle) * RING_DISTANCE, y: base.y + Math.sin(angle) * RING_DISTANCE };
    };
    let slot = 0;
    if (p.hasStarbase) starbases.set(p.id, slotPosition(slot++));
    for (const ship of here) ships.set(ship.id, slotPosition(slot++));
  }
  return { ships, starbases };
}

export function shipAt(screenX: number, screenY: number, state: GameState, view: ViewTransform): string | undefined {
  const positions = computeIconScreenPositions(state, view).ships;
  const hitRadius = SHIP_HIT_RADIUS;
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
      ctx.arc(s.x, s.y, PLANET_RADIUS + 6, 0, Math.PI * 2);
      ctx.strokeStyle = '#f4d35e';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  // Planets. Explored planets show a painted image of their type and the rest stay plain circles.
  // A colony, mine or fortification on an explored planet adds SC1's marker over the top.
  for (const p of state.planets) {
    const s = toScreen(p.x, p.y, view);
    const selected = p.id === options.selectedPlanetId;
    const fortified = p.fortified || p.improvement === 'fortification';
    const marked = p.explored && (fortified || p.improvement !== undefined);

    if (!(p.explored && drawPlanetSprite(ctx, p.type, s.x, s.y, PLANET_RADIUS))) {
      ctx.beginPath();
      ctx.arc(s.x, s.y, PLANET_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = p.explored ? TYPE_COLORS[p.type] : UNEXPLORED_COLOR;
      ctx.fill();
    }
    if (marked) {
      const colors = MARKER_COLORS[p.owner];
      if (fortified) drawMarker(ctx, 'fortified', s.x, s.y, colors.fortified);
      if (p.improvement === 'colony') drawMarker(ctx, 'colony', s.x, s.y, colors.improvement);
      if (p.improvement === 'mine') drawMarker(ctx, 'mine', s.x, s.y, colors.improvement);
    }
    if (selected) {
      ctx.beginPath();
      ctx.arc(s.x, s.y, marked ? MARKER_HALF + 6 : PLANET_RADIUS + 4, 0, Math.PI * 2);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  // Starbases and ships: SC1's own map icons, arranged around their planet
  const icons = computeIconScreenPositions(state, view);
  for (const [planetId, pos] of icons.starbases) {
    const owner = planetsById.get(planetId)?.owner;
    if (owner === 'alliance' || owner === 'hierarchy') {
      drawMapIcon(ctx, starbaseIconKey(owner), pos.x, pos.y, OWNER_COLORS[owner]);
    }
  }
  for (const ship of state.ships) {
    const pos = icons.ships.get(ship.id);
    if (!pos) continue;
    drawMapIcon(ctx, ship.type, pos.x, pos.y, OWNER_COLORS[ship.owner]);

    if (ship.id === options.selectedShipId) {
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, Math.max(iconRadius(ship.type), 8) + 3, 0, Math.PI * 2);
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
    }
  }
}
