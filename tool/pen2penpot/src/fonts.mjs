// Font families. Both the reference render and the Penpot file use the same
// open fonts, so the comparison measures the conversion and not a font swap:
//
// - Inter and JetBrains Mono: the Segno app's own files (OFL).
// - SF Mono (Apple-licensed) becomes JetBrains Mono, the app's mono font.
// - Arial becomes Arimo, its metric-compatible open counterpart (OFL, from
//   @fontsource/arimo).
//
// bin/upload-fonts.mjs uploads these files to the Penpot team as custom fonts
// and records their ids in out/fonts.json.

import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const SEGNO_FONTS = '/Users/Tomas/Documents/Work/opensource/segno/assets/fonts';
const ARIMO = join(dirname(require.resolve('@fontsource/arimo/package.json')), 'files');

export const FONT_ALIAS = { 'SF Mono': 'JetBrains Mono', Arial: 'Arimo' };

export const canonicalFamily = (family) => FONT_ALIAS[family] ?? family;

// family -> [[weight, file]]
export const FONT_FILES = {
  Inter: [
    [400, join(SEGNO_FONTS, 'Inter-Regular.ttf')],
    [500, join(SEGNO_FONTS, 'Inter-Medium.ttf')],
    [600, join(SEGNO_FONTS, 'Inter-SemiBold.ttf')],
    [700, join(SEGNO_FONTS, 'Inter-Bold.ttf')],
  ],
  'JetBrains Mono': [
    [400, join(SEGNO_FONTS, 'JetBrainsMono-Regular.ttf')],
    [500, join(SEGNO_FONTS, 'JetBrainsMono-Medium.ttf')],
    [600, join(SEGNO_FONTS, 'JetBrainsMono-SemiBold.ttf')],
  ],
  Arimo: [
    [400, join(ARIMO, 'arimo-latin-400-normal.woff')],
    [700, join(ARIMO, 'arimo-latin-700-normal.woff')],
  ],
};

// CSS font matching for a missing weight: above 500 try heavier, then
// lighter; at or below 500 the reverse.
export function nearestWeight(available, weight) {
  const w = Number(weight);
  const sorted = [...available].map(Number).sort((a, b) => a - b);
  if (sorted.includes(w)) return w;
  if (w > 500) {
    const up = sorted.find((x) => x > w);
    if (up !== undefined) return up;
    return sorted.filter((x) => x < w).pop();
  }
  const down = sorted.filter((x) => x < w).pop();
  return down ?? sorted.find((x) => x > w);
}

// Penpot font table from out/fonts.json ({ family: { fontId, weights } }).
export function fontTable(uploaded) {
  const t = {};
  for (const [family, f] of Object.entries(uploaded ?? {})) {
    t[family] = {
      fontId: `custom-${f.fontId}`,
      family,
      weights: f.weights,
      variant(weight) {
        const w = nearestWeight(f.weights, weight);
        return { id: `normal-${w}`, weight: String(w) };
      },
    };
  }
  for (const family of Object.keys(FONT_FILES)) {
    if (!t[family]) throw new Error(`font ${family} is not uploaded; run bin/upload-fonts.mjs`);
  }
  return t;
}
