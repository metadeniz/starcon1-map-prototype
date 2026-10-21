// Pixel-art planet images for explored worlds, one per type, cut from D's planet preview sheet
// at native size into planetTypes.png. They are about 28px tall, a planet circle's diameter.

import type { PlanetType } from '../model/types';

// x, y, w, h: each type's rectangle in planetTypes.png.
const FRAMES: Record<PlanetType, { x: number; y: number; w: number; h: number }> = {
  life: { x: 0, y: 0, w: 32, h: 27 },
  mineral: { x: 33, y: 0, w: 33, h: 28 },
  dead: { x: 67, y: 0, w: 32, h: 27 },
};

const atlas: HTMLImageElement | undefined =
  typeof Image === 'undefined' ? undefined : new Image();
if (atlas) atlas.src = new URL('../assets/planetTypes.png', import.meta.url).href;

/** Calls `callback` once the planet atlas is ready (right away if it already is). */
export function whenPlanetSpritesLoaded(callback: () => void): void {
  if (!atlas || atlas.complete) callback();
  else atlas.addEventListener('load', callback, { once: true });
}

/**
 * Draws the planet's image centred on (cx, cy), scaled so it is `radius * 2` tall. Returns false
 * if the atlas isn't ready yet.
 */
export function drawPlanetSprite(
  ctx: CanvasRenderingContext2D,
  type: PlanetType,
  cx: number,
  cy: number,
  radius: number,
): boolean {
  if (!atlas || !atlas.complete || atlas.naturalWidth === 0) return false;
  const frame = FRAMES[type];
  const scale = (radius * 2) / 28;
  const w = Math.round(frame.w * scale);
  const h = Math.round(frame.h * scale);
  // Round to whole pixels so the pixel art stays crisp.
  const smoothing = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(atlas, frame.x, frame.y, frame.w, frame.h, Math.round(cx - w / 2), Math.round(cy - h / 2), w, h);
  ctx.imageSmoothingEnabled = smoothing;
  return true;
}
