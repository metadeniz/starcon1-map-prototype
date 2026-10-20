// Star Control 1's own strategic-map icons: one per ship class plus a starbase for each side,
// extracted from the game's setup.pkg into sc1MapIcons.png (see sc1MapIconFrames.ts).

import type { Faction } from '../model/types';
import { SC1_MAP_ICON_FRAMES } from './sc1MapIconFrames';

/** SC1 drew these on a 320x200 screen; scale them up so they read at the map's size. */
export const ICON_SCALE = 2;

const atlas: HTMLImageElement | undefined =
  typeof Image === 'undefined' ? undefined : new Image();
if (atlas) atlas.src = new URL('../assets/sc1MapIcons.png', import.meta.url).href;

/** Calls `callback` once the icon atlas is ready (right away if it already is). */
export function whenIconsLoaded(callback: () => void): void {
  if (!atlas || atlas.complete) callback();
  else atlas.addEventListener('load', callback, { once: true });
}

export function starbaseIconKey(owner: Faction): string {
  return `${owner}-starbase`;
}

/** Half the drawn width/height of an icon, for hit-testing and selection rings. */
export function iconRadius(key: string): number {
  const frame = SC1_MAP_ICON_FRAMES[key];
  if (!frame) return 6;
  return (Math.max(frame.w, frame.h) * ICON_SCALE) / 2;
}

/**
 * Draws an SC1 map icon centred on (cx, cy). Falls back to a plain dot in `fallbackColor` while
 * the atlas is loading or if the key is unknown.
 */
export function drawMapIcon(
  ctx: CanvasRenderingContext2D,
  key: string,
  cx: number,
  cy: number,
  fallbackColor: string,
): void {
  const frame = SC1_MAP_ICON_FRAMES[key];
  if (!frame || !atlas || !atlas.complete || atlas.naturalWidth === 0) {
    ctx.beginPath();
    ctx.arc(cx, cy, 5, 0, Math.PI * 2);
    ctx.fillStyle = fallbackColor;
    ctx.fill();
    return;
  }
  // Round to whole pixels so the scaled-up pixel art stays crisp.
  const left = Math.round(cx - (frame.w / 2) * ICON_SCALE);
  const top = Math.round(cy - (frame.h / 2) * ICON_SCALE);
  const smoothing = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(atlas, frame.x, frame.y, frame.w, frame.h, left, top, frame.w * ICON_SCALE, frame.h * ICON_SCALE);
  ctx.imageSmoothingEnabled = smoothing;
}
