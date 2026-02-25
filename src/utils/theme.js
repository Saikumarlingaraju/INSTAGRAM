// ═══════════════════════════════════════════════════════════════
//  Color theme utilities — shared across renderers and server
// ═══════════════════════════════════════════════════════════════

const rgb = (c) => `${c[0]}, ${c[1]}, ${c[2]}`;

export const createTheme = (dominant, palette) => {
  const vibrancy = (c) =>
    Math.max(c[0], c[1], c[2]) - Math.min(c[0], c[1], c[2]);
  const sorted = [...palette].sort((a, b) => vibrancy(b) - vibrancy(a));

  const primary = sorted[0] || dominant;
  const accent = sorted[1] || [140, 80, 255];
  const warm =
    sorted.find((c) => c[0] > 130 && c[0] > c[2]) || [255, 80, 60];
  const cool =
    sorted.find((c) => c[2] > 130 && c[2] > c[0]) || primary;

  return {
    primary,
    accent,
    warm,
    cool,
    dominant,
    primaryRgb: rgb(primary),
    accentRgb: rgb(accent),
    warmRgb: rgb(warm),
    coolRgb: rgb(cool),
    dominantRgb: rgb(dominant),
  };
};

export const DEFAULT_THEME = createTheme(
  [0, 180, 255],
  [
    [0, 180, 255],
    [140, 80, 255],
    [255, 60, 120],
    [255, 200, 50],
    [50, 200, 150],
    [255, 120, 50],
  ]
);
