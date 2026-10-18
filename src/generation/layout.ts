// Logical coordinate space the galaxy is generated in; the renderer scales this to fit the canvas.
// Geography is fixed regardless of who plays which side: Hierarchy of Battle Thralls is always
// on top, Alliance of Free Stars always on the bottom.
export const LAYOUT = {
  xMin: 60,
  xMax: 860,
  yMin: 40,
  yMax: 960,
  topY: [60, 300] as const,
  chokeY: [460, 540] as const,
  chokeX: [360, 560] as const,
  bottomY: [700, 940] as const,
};
