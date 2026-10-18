// Original, simple silhouette icons — one per ship in the roster, loosely themed off each
// ship's name/role (e.g. a spiky shape for the Ilwrath, a crystalline hex for the Chenjesu).
// These are hand-drawn shapes, not reproductions of any copyrighted game artwork.

type Point = [number, number];

function polygon(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, points: Point[]): void {
  ctx.beginPath();
  points.forEach(([x, y], i) => {
    const px = cx + x * size;
    const py = cy + y * size;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.closePath();
}

function starPoints(spikes: number, outer: number, inner: number, rotation = -Math.PI / 2): Point[] {
  const points: Point[] = [];
  for (let i = 0; i < spikes * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const angle = rotation + (i * Math.PI) / spikes;
    points.push([Math.cos(angle) * r, Math.sin(angle) * r]);
  }
  return points;
}

// --- Alliance of Free Stars ---

function drawShofixtiScout(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number): void {
  // Small aggressive dart.
  polygon(ctx, cx, cy, size, [
    [0, -1],
    [0.75, 0.9],
    [0, 0.5],
    [-0.75, 0.9],
  ]);
}

function drawEarthlingCruiser(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number): void {
  // Plain, utilitarian elongated hull.
  polygon(ctx, cx, cy, size, [
    [-1, -0.3],
    [-0.5, -0.6],
    [0.5, -0.6],
    [1, -0.3],
    [1, 0.3],
    [0.5, 0.6],
    [-0.5, 0.6],
    [-1, 0.3],
  ]);
}

function drawSyreenPenetrator(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number): void {
  // Sleek needle.
  polygon(ctx, cx, cy, size, [
    [0, -1],
    [0.32, 0],
    [0, 1],
    [-0.32, 0],
  ]);
}

function drawArilouSkiff(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number): void {
  // Flattened saucer.
  polygon(ctx, cx, cy, size, [
    [-1, 0],
    [-0.4, -0.45],
    [0.4, -0.45],
    [1, 0],
    [0.4, 0.45],
    [-0.4, 0.45],
  ]);
}

function drawMmrnmhrmXForm(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number): void {
  // Angular 4-point "X" star — a transforming, robotic feel.
  polygon(ctx, cx, cy, size, starPoints(4, 1, 0.32));
}

function drawYehatTerminator(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number): void {
  // Swept wings, forward-pointed — avian warrior culture.
  polygon(ctx, cx, cy, size, [
    [0, -1],
    [1, 0.7],
    [0.28, 0.35],
    [0, 1],
    [-0.28, 0.35],
    [-1, 0.7],
  ]);
}

function drawChenjesuBroodhome(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number): void {
  // Crystalline hexagonal cluster.
  const points: Point[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = -Math.PI / 2 + (i * Math.PI) / 3;
    points.push([Math.cos(angle), Math.sin(angle)]);
  }
  polygon(ctx, cx, cy, size, points);
}

// --- Hierarchy of Battle Thralls ---

function drawUmgahDrone(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, strokeColor: string): void {
  // Small round pod with two side antennae.
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.65, 0, Math.PI * 2);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = Math.max(1, size * 0.12);
  ctx.beginPath();
  ctx.moveTo(cx - size * 0.55, cy);
  ctx.lineTo(cx - size * 1, cy - size * 0.35);
  ctx.moveTo(cx + size * 0.55, cy);
  ctx.lineTo(cx + size * 1, cy - size * 0.35);
  ctx.stroke();
}

function drawIlwrathAvenger(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number): void {
  // Jagged spider-legged silhouette.
  polygon(ctx, cx, cy, size, starPoints(6, 1, 0.3));
}

function drawVuxIntruder(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, bgColor: string): void {
  // Cyclopean single "eye".
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.85, 0, Math.PI * 2);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = bgColor;
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.32, 0, Math.PI * 2);
  ctx.closePath();
  ctx.fill();
}

function drawAndrosynthGuardian(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number): void {
  // Shield-shaped guardian.
  polygon(ctx, cx, cy, size, [
    [0, -1],
    [0.8, -0.35],
    [0.6, 0.9],
    [-0.6, 0.9],
    [-0.8, -0.35],
  ]);
}

function drawSpathiEluder(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number): void {
  // Crab-like body with side fins, evasive posture.
  polygon(ctx, cx, cy, size, [
    [0, -0.65],
    [0.4, 0],
    [0, 0.65],
    [-0.4, 0],
  ]);
  ctx.fill();
  polygon(ctx, cx, cy, size, [
    [0.35, -0.15],
    [1, -0.5],
    [0.55, 0.15],
  ]);
  ctx.fill();
  polygon(ctx, cx, cy, size, [
    [-0.35, -0.15],
    [-1, -0.5],
    [-0.55, 0.15],
  ]);
}

function drawMyconPodship(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number): void {
  // Soft organic pod — round contrast against the angular tech shapes.
  ctx.beginPath();
  ctx.ellipse(cx, cy, size * 1, size * 0.72, 0, 0, Math.PI * 2);
  ctx.closePath();
}

function drawUrQuanDreadnought(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number): void {
  // Broad, heavy wedge — the biggest hull in the roster.
  polygon(ctx, cx, cy, size, [
    [0, -1],
    [1, 0.25],
    [0.6, 1],
    [-0.6, 1],
    [-1, 0.25],
  ]);
}

function drawDefault(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number): void {
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.75, 0, Math.PI * 2);
  ctx.closePath();
}

type SimpleIconFn = (ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number) => void;
type ColorAwareIconFn = (ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, colorArg: string) => void;

const SIMPLE_ICONS: Record<string, SimpleIconFn> = {
  'Shofixti Scout': drawShofixtiScout,
  'Earthling Cruiser': drawEarthlingCruiser,
  'Syreen Penetrator': drawSyreenPenetrator,
  'Arilou Skiff': drawArilouSkiff,
  'Mmrnmhrm X-Form': drawMmrnmhrmXForm,
  'Yehat Terminator': drawYehatTerminator,
  'Chenjesu Broodhome': drawChenjesuBroodhome,
  'Ilwrath Avenger': drawIlwrathAvenger,
  'Androsynth Guardian': drawAndrosynthGuardian,
  'Spathi Eluder': drawSpathiEluder,
  'Mycon Podship': drawMyconPodship,
  'Ur-Quan Dreadnought': drawUrQuanDreadnought,
};

// These two need an extra color (background or stroke) to draw an inner detail.
const COLOR_AWARE_ICONS: Record<string, ColorAwareIconFn> = {
  'Umgah Drone': drawUmgahDrone,
  'VUX Intruder': drawVuxIntruder,
};

/** Draws a ship's silhouette, filled with `fillColor`, centered at (cx, cy). */
export function drawShipIcon(
  ctx: CanvasRenderingContext2D,
  shipName: string,
  cx: number,
  cy: number,
  size: number,
  fillColor: string,
  backgroundColor: string,
): void {
  ctx.fillStyle = fillColor;

  const colorAware = COLOR_AWARE_ICONS[shipName];
  if (colorAware) {
    colorAware(ctx, cx, cy, size, shipName === 'Umgah Drone' ? fillColor : backgroundColor);
    return;
  }

  const simple = SIMPLE_ICONS[shipName] ?? drawDefault;
  simple(ctx, cx, cy, size);
  ctx.fill();
}
