import type { GameState, Owner, Planet, PlanetType } from '../model/types';
import { LAYOUT } from '../generation/layout';
import type { ReachablePlanet } from '../game/gameState';
import { drawMapIcon, iconRadius, starbaseIconKey } from './shipIcons';

const PLANET_RADIUS = 14;
/** Distance from a planet's centre to the ring its starbase and ships sit on. */
const RING_DISTANCE = PLANET_RADIUS + 16;
const SHIP_HIT_RADIUS = 12;

const TYPE_COLORS: Record<PlanetType, string> = {
  life: '#4caf6a',
  mineral: '#c98a3a',
  dead: '#6b7280',
};

const UNEXPLORED_COLOR = '#2f6fb8';

// SC1's planet markers (setup.pkg package 16, type 3, instance 4): 5x5 one-colour glyphs that the
// strategic map draws on a star. A fortified colony or mine gets the square with the diamond or
// plus drawn over it, the same way SC1 layers them.
const MARKER_GLYPHS = {
  colony: ['..#..', '.#.#.', '#...#', '.#.#.', '..#..'],
  mine: ['..#..', '..#..', '#####', '..#..', '..#..'],
  fortified: ['#####', '#...#', '#...#', '#...#', '#####'],
};
// Drawn about as wide as a planet circle.
const MARKER_SCALE = 6;
const MAP_BACKGROUND = '#05070d';
// SC1's own marker colours (palette entries the exe picks at linear 0x412E): yellow for the
// Alliance and blue for the Hierarchy, with the fortification square a lighter shade.
const MARKER_COLORS: Record<Owner, { improvement: string; fortified: string }> = {
  alliance: { improvement: '#ffff7f', fortified: '#ffffbb' },
  hierarchy: { improvement: '#2fa7f3', fortified: '#5fbfff' },
  neutral: { improvement: '#eef0f5', fortified: '#eef0f5' },
};

function drawMarkerGlyph(ctx: CanvasRenderingContext2D, glyph: string[], cx: number, cy: number, color: string): void {
  const left = Math.round(cx - (glyph[0].length * MARKER_SCALE) / 2);
  const top = Math.round(cy - (glyph.length * MARKER_SCALE) / 2);
  ctx.fillStyle = color;
  glyph.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      if (row[x] === '#') ctx.fillRect(left + x * MARKER_SCALE, top + y * MARKER_SCALE, MARKER_SCALE, MARKER_SCALE);
    }
  });
}

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
      ctx.arc(s.x, s.y, PLANET_RADIUS + 7, 0, Math.PI * 2);
      ctx.strokeStyle = '#f4d35e';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  // Planets. An explored planet with a colony, mine or fortification is drawn as SC1's marker
  // in place of the circle; everything else stays a circle coloured by type.
  for (const p of state.planets) {
    const s = toScreen(p.x, p.y, view);
    const selected = p.id === options.selectedPlanetId;
    const fortified = p.fortified || p.improvement === 'fortification';

    if (p.explored && (fortified || p.improvement)) {
      const colors = MARKER_COLORS[p.owner];
      // Black out the marker's cell so links don't show through its gaps, as on SC1's black map.
      const half = (5 * MARKER_SCALE) / 2;
      ctx.fillStyle = MAP_BACKGROUND;
      ctx.fillRect(Math.round(s.x - half), Math.round(s.y - half), 5 * MARKER_SCALE, 5 * MARKER_SCALE);
      if (fortified) drawMarkerGlyph(ctx, MARKER_GLYPHS.fortified, s.x, s.y, colors.fortified);
      if (p.improvement === 'colony') drawMarkerGlyph(ctx, MARKER_GLYPHS.colony, s.x, s.y, colors.improvement);
      if (p.improvement === 'mine') drawMarkerGlyph(ctx, MARKER_GLYPHS.mine, s.x, s.y, colors.improvement);
      if (selected) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.strokeRect(Math.round(s.x - half) - 4, Math.round(s.y - half) - 4, 5 * MARKER_SCALE + 8, 5 * MARKER_SCALE + 8);
      }
      continue;
    }

    ctx.beginPath();
    ctx.arc(s.x, s.y, PLANET_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = p.explored ? TYPE_COLORS[p.type] : UNEXPLORED_COLOR;
    ctx.fill();
    ctx.lineWidth = selected ? 4 : 2.5;
    ctx.strokeStyle = OWNER_COLORS[p.owner];
    ctx.stroke();
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
