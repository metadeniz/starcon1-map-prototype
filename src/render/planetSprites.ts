// Painted planet images for explored worlds, one row per type with a few variants each
// (planet-types-v9 sheet, cut into 48x48 tiles in planetTypes.png).

import type { PlanetType } from '../model/types';

const TILE = 48;
// Index of each type's first tile in the atlas, and how many variants it has.
const VARIANTS: Record<PlanetType, { first: number; count: number }> = {
  life: { first: 0, count: 6 },
  mineral: { first: 6, count: 6 },
  dead: { first: 12, count: 3 },
};

const atlas: HTMLImageElement | undefined =
  typeof Image === 'undefined' ? undefined : new Image();
if (atlas) atlas.src = new URL('../assets/planetTypes.png', import.meta.url).href;

/** Calls `callback` once the planet atlas is ready (right away if it already is). */
export function whenPlanetSpritesLoaded(callback: () => void): void {
  if (!atlas || atlas.complete) callback();
  else atlas.addEventListener('load', callback, { once: true });
}

/** Picks a variant from the planet id, so a planet keeps the same look all game. */
function variantFor(planetId: string, count: number): number {
  let h = 0;
  for (let i = 0; i < planetId.length; i++) h = (h * 31 + planetId.charCodeAt(i)) >>> 0;
  return h % count;
}

/** Draws the planet's image centred on (cx, cy). Returns false if the atlas isn't ready yet. */
export function drawPlanetSprite(
  ctx: CanvasRenderingContext2D,
  type: PlanetType,
  planetId: string,
  cx: number,
  cy: number,
  radius: number,
): boolean {
  if (!atlas || !atlas.complete || atlas.naturalWidth === 0) return false;
  const { first, count } = VARIANTS[type];
  const tile = first + variantFor(planetId, count);
  ctx.drawImage(atlas, tile * TILE, 0, TILE, TILE, cx - radius, cy - radius, radius * 2, radius * 2);
  return true;
}
