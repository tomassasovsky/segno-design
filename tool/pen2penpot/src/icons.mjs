// Icon glyphs from the official open-source packages: lucide-static for
// lucide, @material-symbols/svg-400 for Material Symbols (weight 400, which is
// the default pen.dev uses when a node sets no weight).

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const lucideDir = join(dirname(require.resolve('lucide-static/package.json')), 'icons');
const materialDir = dirname(require.resolve('@material-symbols/svg-400/package.json'));

const attr = (s, name) => {
  const m = s.match(new RegExp(`\\s${name}="([^"]*)"`));
  return m ? m[1] : undefined;
};
const num = (s, name, d = 0) => {
  const v = attr(s, name);
  return v === undefined ? d : Number(v);
};

// Converts the drawing elements of a small SVG into path data strings.
function elementsToPaths(svg) {
  const out = [];
  const re = /<(path|circle|ellipse|line|polyline|polygon|rect)\b([^>]*)\/?>/g;
  let m;
  while ((m = re.exec(svg))) {
    const [, tag, a] = m;
    const s = ` ${a}`;
    switch (tag) {
      case 'path':
        out.push(attr(s, 'd'));
        break;
      case 'circle':
      case 'ellipse': {
        const cx = num(s, 'cx');
        const cy = num(s, 'cy');
        const rx = tag === 'circle' ? num(s, 'r') : num(s, 'rx');
        const ry = tag === 'circle' ? num(s, 'r') : num(s, 'ry');
        out.push(
          `M${cx - rx} ${cy}A${rx} ${ry} 0 1 0 ${cx + rx} ${cy}A${rx} ${ry} 0 1 0 ${cx - rx} ${cy}Z`,
        );
        break;
      }
      case 'line':
        out.push(`M${num(s, 'x1')} ${num(s, 'y1')}L${num(s, 'x2')} ${num(s, 'y2')}`);
        break;
      case 'polyline':
      case 'polygon': {
        const pts = attr(s, 'points').trim().split(/[\s,]+/).map(Number);
        let d = `M${pts[0]} ${pts[1]}`;
        for (let i = 2; i < pts.length; i += 2) d += `L${pts[i]} ${pts[i + 1]}`;
        out.push(tag === 'polygon' ? `${d}Z` : d);
        break;
      }
      case 'rect': {
        const x = num(s, 'x');
        const y = num(s, 'y');
        const w = num(s, 'width');
        const h = num(s, 'height');
        const r = Math.min(num(s, 'rx', num(s, 'ry')), w / 2, h / 2);
        out.push(
          r
            ? `M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + h - r}A${r} ${r} 0 0 1 ${x + w - r} ${y + h}H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`
            : `M${x} ${y}H${x + w}V${y + h}H${x}Z`,
        );
        break;
      }
    }
  }
  return out;
}

const cache = new Map();

// Returns { viewBox: [x,y,w,h], d, mode: 'stroke'|'fill', strokeWidth }.
export function iconGlyph(library, name) {
  const key = `${library}:${name}`;
  if (cache.has(key)) return cache.get(key);
  let file;
  let mode;
  if (library === 'lucide') {
    file = join(lucideDir, `${name}.svg`);
    mode = 'stroke';
  } else if (library === 'Material Symbols Outlined') {
    file = join(materialDir, 'outlined', `${name}.svg`);
    mode = 'fill';
  } else if (library === 'Material Symbols Rounded') {
    file = join(materialDir, 'rounded', `${name}.svg`);
    mode = 'fill';
  } else if (library === 'Material Symbols Sharp') {
    file = join(materialDir, 'sharp', `${name}.svg`);
    mode = 'fill';
  } else {
    throw new Error(`icon library not supported: ${library}`);
  }
  const svg = readFileSync(file, 'utf8');
  const viewBox = attr(svg, 'viewBox').split(/[\s,]+/).map(Number);
  const glyph = {
    viewBox,
    d: elementsToPaths(svg).join(''),
    mode,
    strokeWidth: mode === 'stroke' ? num(svg, 'stroke-width', 2) : 0,
    source: file.slice(file.indexOf('node_modules/') + 13),
  };
  cache.set(key, glyph);
  return glyph;
}

// Uniform scale and offset that fit a glyph's viewBox centred into a w x h box.
export function iconFit(glyph, w, h) {
  const [vx, vy, vw, vh] = glyph.viewBox;
  const s = Math.min(w / vw, h / vh);
  return { s, tx: (w - vw * s) / 2 - vx * s, ty: (h - vh * s) / 2 - vy * s };
}
