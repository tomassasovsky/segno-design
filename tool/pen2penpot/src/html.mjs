// Emits one HTML document per screen that maps pen layout semantics to CSS
// flexbox one to one, so headless Chrome can compute the absolute geometry.

import { existsSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';
import { pathToFileURL } from 'node:url';
import { iconGlyph, iconFit } from './icons.mjs';
import { pathViewBox } from './geometry.mjs';
import { FONT_FILES, canonicalFamily } from './fonts.mjs';

// @font-face rules for the open fonts the converter uses (src/fonts.mjs).
export function fontFaces() {
  return Object.entries(FONT_FILES)
    .flatMap(([fam, list]) =>
      list.map(([w, file]) => `@font-face{font-family:"${fam}";font-weight:${w};src:url("${pathToFileURL(file).href}");}`),
    )
    .join('\n');
}

const SIZE_RE = /^(fit_content|fill_container)(?:\(([-\d.]+)\))?$/;

export function parseSize(v) {
  if (v === undefined || v === null) return { kind: 'auto' };
  if (typeof v === 'number') return { kind: 'fixed', value: v };
  const m = String(v).match(SIZE_RE);
  if (!m) throw new Error(`bad size ${v}`);
  return {
    kind: m[1] === 'fit_content' ? 'fit' : 'fill',
    fallback: m[2] !== undefined ? Number(m[2]) : undefined,
  };
}

const px = (n) => `${+Number(n).toFixed(4)}px`;
const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const JUSTIFY = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
  space_between: 'space-between',
  space_around: 'space-around',
};
const ALIGN = { start: 'flex-start', center: 'center', end: 'flex-end' };

// Pen layout of a node: frames default to horizontal.
export function layoutOf(node) {
  if (node.type !== 'frame') return 'none';
  return node.layout ?? 'horizontal';
}

export function fillsOf(node) {
  const f = node.fill;
  if (f === undefined || f === null) return [];
  return (Array.isArray(f) ? f : [f]).filter((x) => !(typeof x === 'object' && x.enabled === false));
}

// pen blend modes as CSS mix-blend-mode values (also Penpot's names).
// linearBurn and linearDodge have no CSS or Penpot equivalent.
export const BLEND = {
  darken: 'darken',
  multiply: 'multiply',
  colorBurn: 'color-burn',
  light: 'lighten',
  screen: 'screen',
  colorDodge: 'color-dodge',
  overlay: 'overlay',
  softLight: 'soft-light',
  hardLight: 'hard-light',
  difference: 'difference',
  exclusion: 'exclusion',
  hue: 'hue',
  saturation: 'saturation',
  color: 'color',
  luminosity: 'luminosity',
};

// A node whose only fill has a blend mode blends as a layer; Penpot has
// blend modes per layer, not per fill. Returns the pen blend mode or null.
export function fillBlendOf(node) {
  const fills = fillsOf(node);
  const m = fills.length === 1 && typeof fills[0] === 'object' ? fills[0].blendMode : undefined;
  return m && m !== 'normal' ? m : null;
}

export function paddingOf(pen, node) {
  let p = node.padding;
  if (p === undefined) return [0, 0, 0, 0];
  p = pen.resolve(p);
  if (!Array.isArray(p)) return [p, p, p, p].map((x) => pen.resolve(x));
  p = p.map((x) => pen.resolve(x));
  if (p.length === 2) return [p[0], p[1], p[0], p[1]];
  return p;
}

export function radiiOf(pen, node) {
  const r = pen.resolve(node.cornerRadius);
  if (r === undefined) return [0, 0, 0, 0];
  if (Array.isArray(r)) return r.map((x) => pen.resolve(x));
  return [r, r, r, r];
}

export function strokeWidthsOf(pen, node) {
  const w = pen.resolve(node.strokeWidth ?? 1);
  if (typeof w === 'object') {
    return ['top', 'right', 'bottom', 'left'].map((k) => pen.resolve(w[k] ?? 0));
  }
  return [w, w, w, w];
}

export class HtmlBuilder {
  constructor(pen, { imageRoots }) {
    this.pen = pen;
    this.imageRoots = imageRoots;
    this.nodes = [];
    this.notes = [];
    this.missingImages = new Set();
  }

  color(c) {
    const v = this.pen.resolve(c);
    return v;
  }

  imageUrl(url) {
    for (const root of this.imageRoots) {
      const p = resolvePath(root, url);
      if (existsSync(p)) return { file: p, href: pathToFileURL(p).href };
    }
    this.missingImages.add(url);
    return null;
  }

  // CSS background layers for a box's fills. pen paints the first fill at the
  // bottom; CSS paints the first layer on top.
  backgrounds(node) {
    const layers = [];
    for (const f of fillsOf(node)) {
      if (typeof f === 'string') {
        const c = this.color(f);
        layers.push(`linear-gradient(${c},${c})`);
      } else if (f.type === 'color') {
        const c = this.color(f.color);
        layers.push(`linear-gradient(${c},${c})`);
      } else if (f.type === 'gradient') {
        layers.push(this.cssGradient(f));
      } else if (f.type === 'image') {
        const img = this.imageUrl(f.url);
        if (!img) continue;
        const mode = f.mode ?? 'cover';
        const size = mode === 'stretch' ? '100% 100%' : mode === 'cover' ? 'cover' : 'contain';
        layers.push(`url('${img.href}') center/${size} no-repeat`);
      }
    }
    return layers.reverse().join(',');
  }

  cssGradient(f) {
    const stops = (f.colors ?? [])
      .map((s) => `${this.color(s.color)} ${this.pen.resolve(s.position) * 100}%`)
      .join(',');
    const type = f.gradientType ?? 'linear';
    if (type === 'linear') {
      return `linear-gradient(${-(this.pen.resolve(f.rotation ?? 0))}deg,${stops})`;
    }
    const cx = (f.center?.x ?? 0.5) * 100;
    const cy = (f.center?.y ?? 0.5) * 100;
    if (type === 'radial') {
      const w = (this.pen.resolve(f.size?.width ?? 1) * 50).toFixed(3);
      const h = (this.pen.resolve(f.size?.height ?? 1) * 50).toFixed(3);
      return `radial-gradient(${w}% ${h}% at ${cx}% ${cy}%,${stops})`;
    }
    return `conic-gradient(from ${-(this.pen.resolve(f.rotation ?? 0))}deg at ${cx}% ${cy}%,${stops})`;
  }

  shadows(node) {
    const e = node.effect;
    if (!e) return null;
    const list = (Array.isArray(e) ? e : [e]).filter(
      (x) => x.type === 'shadow' && x.enabled !== false,
    );
    if (!list.length) return null;
    return list
      .map((s) => {
        const inset = s.shadowType === 'inner' ? 'inset ' : '';
        return `${inset}${px(this.pen.resolve(s.offset?.x ?? 0))} ${px(this.pen.resolve(s.offset?.y ?? 0))} ${px(this.pen.resolve(s.blur ?? 0))} 0 ${this.color(s.color ?? '#00000040')}`;
      })
      .join(',');
  }

  // Returns the HTML for one screen plus its notes, with the world origin at the
  // screen's top-left corner.
  document(screen, notes, { pad }) {
    const body = this.emit(screen, null);
    const noteHtml = notes
      .map((n) => {
        const copy = { ...n, x: n.x - screen.x, y: n.y - screen.y };
        const html = this.emit(copy, { layout: 'none', note: true });
        n._n = copy._n;
        return html;
      })
      .join('');
    return `<!doctype html><html><head><meta charset="utf-8"><style>
${fontFaces()}
html,body{margin:0;padding:0;background:#ffffff00;}
*{box-sizing:border-box;}
#world{position:absolute;left:${pad}px;top:${pad}px;width:0;height:0;}
.t{white-space:pre;font-kerning:normal;text-rendering:geometricPrecision;}
.tw{white-space:pre-wrap;overflow-wrap:break-word;}
svg{display:block;overflow:visible;}
</style></head><body><div id="world">${body}${noteHtml}</div></body></html>`;
  }

  emit(node, parent) {
    const n = this.nodes.length;
    this.nodes.push(node);
    node._n = n;
    const pen = this.pen;
    const st = [];
    const parentLayout = parent ? parent.layout : null;
    const inFlex =
      parent && parentLayout !== 'none' && node.layoutPosition !== 'absolute';

    if (!parent) {
      st.push('position:absolute;left:0;top:0');
    } else if (!inFlex) {
      st.push(`position:absolute;left:${px(node.x ?? 0)};top:${px(node.y ?? 0)}`);
    } else {
      st.push('position:relative;flex:none');
    }

    const isText = node.type === 'text';
    const growth = isText ? (node.textGrowth ?? 'auto') : null;

    for (const dim of ['width', 'height']) {
      const minDim = dim === 'width' ? 'min-width' : 'min-height';
      let raw = pen.resolve(node[dim]);
      if (isText) {
        if (growth === 'auto') raw = undefined;
        if (growth === 'fixed-width' && dim === 'height') raw = undefined;
      }
      if (node.type === 'icon' && raw === undefined) raw = 24;
      const s = parseSize(raw);
      if (s.kind === 'fixed') {
        st.push(`${dim}:${px(s.value)}`);
      } else if (s.kind === 'fill') {
        if (inFlex) {
          const main =
            (parentLayout === 'horizontal' && dim === 'width') ||
            (parentLayout === 'vertical' && dim === 'height');
          if (main) st.push(`flex-grow:1;flex-basis:0;${minDim}:0`);
          else st.push('align-self:stretch');
        } else if (s.fallback !== undefined) {
          st.push(`${dim}:${px(s.fallback)}`);
        } else {
          st.push(`${dim}:100%`);
        }
      } else if (node.type === 'frame' && layoutOf(node) === 'none') {
        // fit_content on an absolute-layout frame: sized from children after
        // render (see fitAbsolute in layout.mjs).
        const kids = node.children?.length;
        if (!kids) st.push(`${dim}:${px(s.fallback ?? 0)}`);
        else node._fitAbs = (node._fitAbs ?? []).concat(dim);
      } else if (!isText && node.type !== 'frame') {
        st.push(`${dim}:0`);
      }
    }

    const op = pen.resolve(node.opacity);
    if (op !== undefined && op !== 1) st.push(`opacity:${op}`);
    const rot = pen.resolve(node.rotation);
    if (rot) st.push(`transform:rotate(${-rot}deg);transform-origin:0 0`);
    if (node.flipX || node.flipY) {
      st.push(`transform:scale(${node.flipX ? -1 : 1},${node.flipY ? -1 : 1})`);
    }

    let inner = '';
    let cls = '';
    let layoutForKids = 'none';

    if (node.type === 'frame' || node.type === 'rectangle' || node.type === 'ellipse') {
      const bg = this.backgrounds(node);
      if (bg) st.push(`background:${bg}`);
      if (node.type === 'ellipse') st.push('border-radius:50%');
      else {
        const r = radiiOf(pen, node);
        if (r.some(Boolean)) st.push(`border-radius:${r.map(px).join(' ')}`);
      }
      const sh = this.shadows(node);
      if (sh) st.push(`box-shadow:${sh}`);
      const blend = BLEND[fillBlendOf(node)];
      if (blend) st.push(`mix-blend-mode:${blend}`);
      if (pen.resolve(node.clip) === true) st.push('overflow:hidden');
      inner += this.strokeCss(node, st);
    }

    if (node.type === 'frame') {
      const layout = layoutOf(node);
      layoutForKids = layout;
      if (layout !== 'none') {
        st.push(`display:flex;flex-direction:${layout === 'horizontal' ? 'row' : 'column'}`);
        const gap = pen.resolve(node.gap ?? 0);
        if (gap) st.push(`gap:${px(gap)}`);
        st.push(`justify-content:${JUSTIFY[node.justifyContent ?? 'start']}`);
        st.push(`align-items:${ALIGN[node.alignItems ?? 'start']}`);
      }
      const p = paddingOf(pen, node);
      if (p.some(Boolean)) st.push(`padding:${p.map(px).join(' ')}`);
      const kids = (node.children ?? [])
        .map((c) => this.emit(c, { layout: layoutForKids }))
        .join('');
      inner = kids + inner;
    } else if (isText) {
      cls = growth === 'auto' ? 't' : 't tw';
      st.push(this.textCss(node));
      if (growth === 'fixed-width-height' && node.textAlignVertical) {
        const j = { top: 'flex-start', middle: 'center', bottom: 'flex-end' }[node.textAlignVertical];
        st.push(`display:flex;flex-direction:column;justify-content:${j}`);
        inner = `<span>${esc(pen.resolve(node.content ?? ''))}</span>`;
      } else {
        inner = esc(pen.resolve(node.content ?? ''));
      }
    } else if (node.type === 'path') {
      inner = this.pathSvg(node);
    } else if (node.type === 'icon') {
      inner = this.iconSvg(node);
    } else if (node.type === 'group') {
      inner = (node.children ?? []).map((c) => this.emit(c, { layout: 'none' })).join('');
    }

    // Last, so it wins over the display a layout sets.
    if (node._hidden) st.push('display:none');
    const attrs = [`data-n="${n}"`];
    if (cls) attrs.push(`class="${cls}"`);
    return `<div ${attrs.join(' ')} style="${st.join(';')}">${inner}</div>`;
  }

  // Strokes paint above the children, as in pen. Uniform strokes use an
  // outline (it follows the corner radius and is not clipped by the box's own
  // overflow); per-side strokes use an overlay with borders.
  strokeCss(node, st) {
    const pen = this.pen;
    const fills = (Array.isArray(node.stroke) ? node.stroke : node.stroke ? [node.stroke] : []).filter(
      (x) => !(typeof x === 'object' && x.enabled === false),
    );
    if (!fills.length) return '';
    const first = fills[0];
    const color = this.color(typeof first === 'string' ? first : first.color ?? '#000');
    const w = strokeWidthsOf(pen, node);
    if (!w.some((x) => x > 0)) return '';
    const align = node.strokeAlignment ?? (node.type === 'frame' || node.type === 'rectangle' ? 'inner' : 'center');
    const uniform = w.every((x) => x === w[0]);
    if (uniform) {
      const off = align === 'inner' ? -w[0] : align === 'center' ? -w[0] / 2 : 0;
      st.push(`outline:${px(w[0])} solid ${color};outline-offset:${px(off)}`);
      return '';
    }
    const k = align === 'inner' ? 0 : align === 'center' ? 0.5 : 1;
    const r = node.type === 'ellipse' ? ['50%', '50%', '50%', '50%'] : radiiOf(pen, node).map((x) => px(x + k * Math.max(...w)));
    return `<div style="position:absolute;pointer-events:none;top:${px(-k * w[0])};right:${px(-k * w[1])};bottom:${px(-k * w[2])};left:${px(-k * w[3])};border-style:solid;border-color:${color};border-width:${w.map(px).join(' ')};border-radius:${r.join(' ')}"></div>`;
  }

  textCss(node) {
    const pen = this.pen;
    const st = [];
    const fam = canonicalFamily(pen.resolve(node.fontFamily ?? 'Inter'));
    st.push(`font-family:'${fam}'`);
    st.push(`font-size:${px(pen.resolve(node.fontSize ?? 14))}`);
    let w = pen.resolve(node.fontWeight ?? 'normal');
    if (w === 'normal') w = 400;
    if (w === 'bold') w = 700;
    st.push(`font-weight:${w}`);
    if (node.fontStyle) st.push(`font-style:${pen.resolve(node.fontStyle)}`);
    const lh = pen.resolve(node.lineHeight);
    st.push(`line-height:${lh === undefined ? 'normal' : lh}`);
    const ls = pen.resolve(node.letterSpacing);
    if (ls) st.push(`letter-spacing:${px(ls)}`);
    if (node.textAlign) st.push(`text-align:${node.textAlign}`);
    const deco = [];
    if (pen.resolve(node.underline)) deco.push('underline');
    if (pen.resolve(node.strikethrough)) deco.push('line-through');
    if (deco.length) st.push(`text-decoration:${deco.join(' ')}`);
    const f = fillsOf(node)[0];
    const c = f === undefined ? '#000000' : typeof f === 'string' ? this.color(f) : this.color(f.color ?? '#000000');
    st.push(`color:${c}`);
    return st.join(';');
  }

  svgPaint(node, fill, defs, key) {
    if (fill === undefined) return 'none';
    if (typeof fill === 'string') return this.color(fill);
    if (fill.type === 'color') return this.color(fill.color);
    if (fill.type === 'gradient' && (fill.gradientType ?? 'linear') === 'linear') {
      const g = linearEnds(this.pen, fill);
      const id = `g${node._n}${key}`;
      const stops = (fill.colors ?? [])
        .map((s) => `<stop offset="${this.pen.resolve(s.position)}" stop-color="${this.color(s.color)}"/>`)
        .join('');
      defs.push(
        `<linearGradient id="${id}" gradientUnits="objectBoundingBox" x1="${g.x1}" y1="${g.y1}" x2="${g.x2}" y2="${g.y2}">${stops}</linearGradient>`,
      );
      return `url(#${id})`;
    }
    return 'none';
  }

  pathSvg(node) {
    const pen = this.pen;
    const vb = pathViewBox(node);
    node._viewBox = vb;
    const defs = [];
    const fill = this.svgPaint(node, fillsOf(node)[0], defs, 'f');
    const stroke = this.svgPaint(node, Array.isArray(node.stroke) ? node.stroke[0] : node.stroke, defs, 's');
    const sw = node.stroke ? strokeWidthsOf(pen, node)[0] : 0;
    const vbStr = vb.map((v, i) => (i >= 2 && v === 0 ? 1e-6 : v)).join(' ');
    return `<svg width="100%" height="100%" viewBox="${vbStr}" preserveAspectRatio="none"><defs>${defs.join('')}</defs><path d="${node.geometry ?? ''}" fill="${fill}" fill-rule="${node.fillRule ?? 'nonzero'}" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="${node.strokeLinecap ?? 'butt'}" stroke-linejoin="${node.strokeLinejoin ?? 'miter'}" vector-effect="non-scaling-stroke"/></svg>`;
  }

  iconSvg(node) {
    const pen = this.pen;
    const g = iconGlyph(pen.resolve(node.library), pen.resolve(node.icon));
    const w = pen.resolve(node.width ?? 24);
    const h = pen.resolve(node.height ?? 24);
    const fit = iconFit(g, w, h);
    const f = fillsOf(node)[0];
    const c = f === undefined ? '#000000' : typeof f === 'string' ? this.color(f) : this.color(f.color);
    const paint =
      g.mode === 'stroke'
        ? `fill="none" stroke="${c}" stroke-width="${g.strokeWidth}" stroke-linecap="round" stroke-linejoin="round"`
        : `fill="${c}"`;
    return `<svg width="${w}" height="${h}"><g transform="translate(${fit.tx} ${fit.ty}) scale(${fit.s})"><path d="${g.d}" ${paint}/></g></svg>`;
  }
}

// Linear gradient end points in the unit box: pen measures rotation in degrees
// counter-clockwise from "up", with the gradient running from position 0 to 1
// along that direction, centred on `center`, `size.height` long.
export function linearEnds(pen, f) {
  const rot = (pen.resolve(f.rotation ?? 0) * Math.PI) / 180;
  const len = pen.resolve(f.size?.height ?? 1);
  const cx = f.center?.x ?? 0.5;
  const cy = f.center?.y ?? 0.5;
  const dx = -Math.sin(rot);
  const dy = -Math.cos(rot);
  const r = (v) => +v.toFixed(6);
  return {
    x1: r(cx - (dx * len) / 2),
    y1: r(cy - (dy * len) / 2),
    x2: r(cx + (dx * len) / 2),
    y2: r(cy + (dy * len) / 2),
  };
}
