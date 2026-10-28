// Writes a Penpot file with @penpot/library from expanded pen trees and the
// geometry the browser computed for them.

import * as penpot from '@penpot/library';
import { readFileSync, existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import svgpath from 'svgpath';
import { PenDoc, walk } from './pen.mjs';
import {
  layoutOf,
  fillsOf,
  paddingOf,
  radiiOf,
  strokeWidthsOf,
  parseSize,
  linearEnds,
  BLEND,
  fillBlendOf,
} from './html.mjs';
import { iconGlyph, iconFit } from './icons.mjs';
import { mapPath, placePath } from './geometry.mjs';
import { imageSize } from './image-size.mjs';
import { canonicalFamily } from './fonts.mjs';

const round = (v, d = 3) => +Number(v).toFixed(d);

// Splits #RGB, #RRGGBB or #RRGGBBAA into a Penpot color and opacity.
export function splitHex(hex) {
  let h = String(hex).replace('#', '').toLowerCase();
  if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join('');
  const color = `#${h.slice(0, 6)}`;
  const opacity = h.length === 8 ? round(parseInt(h.slice(6, 8), 16) / 255, 4) : 1;
  return { color, opacity };
}

const JUSTIFY = { start: 'start', center: 'center', end: 'end', space_between: 'space-between', space_around: 'space-around' };
const ALIGN = { start: 'start', center: 'center', end: 'end' };

// Penpot attributes compared for override (touched) flags, mapped to their
// sync group as in app.common.types.component/sync-attrs. Text content, size
// and name are handled separately in touched().
const TOUCH_GROUPS = {
  fills: 'fill-group',
  strokes: 'stroke-group',
  hidden: 'visibility-group',
  opacity: 'layer-effects-group',
  shadow: 'shadow-group',
  r1: 'radius-group',
  r2: 'radius-group',
  r3: 'radius-group',
  r4: 'radius-group',
  rotation: 'geometry-group',
  blendMode: 'layer-effects-group',
  growType: 'text-font-group',
  layout: 'layout-container',
  layoutFlexDir: 'layout-flex-dir',
  layoutGap: 'layout-gap',
  layoutGapType: 'layout-gap',
  layoutPadding: 'layout-padding',
  layoutPaddingType: 'layout-padding',
  layoutJustifyContent: 'layout-justify-content',
  layoutAlignItems: 'layout-align-items',
  layoutAlignContent: 'layout-align-content',
  layoutWrapType: 'layout-wrap-type',
  layoutItemHSizing: 'layout-item-h-sizing',
  layoutItemVSizing: 'layout-item-v-sizing',
  layoutItemAbsolute: 'layout-item-absolute',
  layoutItemZIndex: 'layout-item-z-index',
};

// Sync group of each applied-token attribute (token.cljc token-attr->shape-attr
// then sync-attrs). Text shapes keep fill and font tokens in their content.
const TOKEN_GROUPS = {
  fill: 'fill-group',
  strokeColor: 'stroke-group',
  r1: 'radius-group',
  r2: 'radius-group',
  r3: 'radius-group',
  r4: 'radius-group',
  rowGap: 'layout-gap',
  columnGap: 'layout-gap',
  p1: 'layout-padding',
  p2: 'layout-padding',
  p3: 'layout-padding',
  p4: 'layout-padding',
  opacity: 'layer-effects-group',
  fontSize: 'text-font-group',
  fontFamily: 'text-font-group',
};

// Layer names that only repeat the HTML tag the pen node was drawn from.
const GENERIC_NAMES = new Set(
  'div span i b strong em small p a button label svg g path rect circle section header footer nav main article aside ul ol li img input form kbd code h1 h2 h3 h4 h5 h6 table tr td frame rectangle ellipse text'.split(' '),
);

// Penpot 2.18 blends the first drop shadow of a shape with itself (its
// feBlend has no in2), so a shadow of opacity a renders as 1-(1-a*g)^2 where g
// is the blurred coverage. This picks the opacity whose rendering is closest
// to the intended a*g over the whole falloff.
const shadowOpacityCache = new Map();
export function penpotShadowOpacity(a) {
  if (shadowOpacityCache.has(a)) return shadowOpacityCache.get(a);
  let best = a;
  let bestErr = Infinity;
  for (let o = 0; o <= a; o += 0.0005) {
    let err = 0;
    for (let g = 0.01; g <= 1; g += 0.01) {
      const d = 1 - (1 - o * g) ** 2 - a * g;
      err += d * d;
    }
    if (err < bestErr) {
      bestErr = err;
      best = o;
    }
  }
  const r = round(best, 4);
  shadowOpacityCache.set(a, r);
  return r;
}

// Port of app.common.types.text/compare-text-content: the kinds of
// difference between two text contents, which Penpot records as touched
// groups next to :content-group.
export function textDiff(a, b) {
  const out = new Set();
  const rec = (x, y) => {
    if (JSON.stringify(x) === JSON.stringify(y)) return;
    if (Array.isArray(x) !== Array.isArray(y) || typeof x !== typeof y) {
      out.add('text-content-structure');
      return;
    }
    if (x && typeof x === 'object' && !Array.isArray(x)) {
      const keys = new Set([...Object.keys(x), ...Object.keys(y)]);
      keys.delete('key');
      for (const k of keys) {
        if (k === 'children') {
          if ((x.children ?? []).length !== (y.children ?? []).length) out.add('text-content-structure');
          else x.children.forEach((c, i) => rec(c, y.children[i]));
        } else if (k === 'text') {
          if (x.text !== y.text) out.add('text-content-text');
        } else if (JSON.stringify(x[k] ?? null) !== JSON.stringify(y[k] ?? null)) {
          out.add('text-content-attribute');
        }
      }
    }
  };
  rec(a, b);
  return out;
}

// Affine helpers, SVG convention: x' = a x + c y + e, y' = b x + d y + f.
const apply = (m, x, y) => [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f];
const linearOf = (m) => ({ a: m.a, b: m.b, c: m.c, d: m.d, e: 0, f: 0 });
function invert(m) {
  const det = m.a * m.d - m.b * m.c;
  return {
    a: m.d / det,
    b: -m.b / det,
    c: -m.c / det,
    d: m.a / det,
    e: (m.c * m.f - m.d * m.e) / det,
    f: (m.b * m.e - m.a * m.f) / det,
  };
}
const multiply = (m, n) => ({
  a: m.a * n.a + m.c * n.b,
  b: m.b * n.a + m.d * n.b,
  c: m.a * n.c + m.c * n.d,
  d: m.b * n.c + m.d * n.d,
  e: m.a * n.e + m.c * n.f + m.e,
  f: m.b * n.e + m.d * n.f + m.f,
});
// pen rotation: degrees counter-clockwise around the top-left corner.
function penRotation(deg, x, y) {
  const t = (deg * Math.PI) / 180;
  const cos = Math.cos(t);
  const sin = Math.sin(t);
  const lin = { a: cos, b: -sin, c: sin, d: cos, e: 0, f: 0 };
  // translate(x,y) * lin * translate(-x,-y)
  const [ex, ey] = apply(lin, -x, -y);
  return { ...lin, e: ex + x, f: ey + y };
}

export class PenpotWriter {
  constructor(pen, { fonts, imageRoots, report }) {
    this.pen = pen;
    this.fonts = fonts;
    this.imageRoots = imageRoots;
    this.report = report;
    this.ctx = penpot.createBuildContext({ referer: 'pen2penpot' });
    this.colorIds = new Map();
    this.media = new Map();
    this.mainRel = new Map();
    this.attrsById = new Map();
    this.components = [];
  }

  bump(key, n = 1) {
    if (this.silent) return;
    this.report.counts[key] = (this.report.counts[key] ?? 0) + n;
  }

  lossy(key, detail) {
    if (this.silent) return;
    const l = (this.report.lossy[key] ??= { count: 0, examples: [] });
    l.count++;
    if (l.examples.length < 5 && detail) l.examples.push(detail);
  }

  begin(name) {
    this.fileId = this.ctx.addFile({ name });
    for (const [vname, v] of Object.entries(this.pen.variables)) {
      if (v.type !== 'color') continue;
      const { color, opacity } = splitHex(this.pen.varValue(vname));
      this.colorIds.set(vname, this.ctx.addLibraryColor({ name: vname, color, opacity }));
    }
    this.bump('libraryColors', this.colorIds.size);
    this.ctx.addTokensLib(JSON.stringify(this.tokenSets()));
  }

  // All variables as one Penpot token set (DTCG). Colours are library colours
  // as well; shapes carry both bindings.
  tokenSets() {
    const set = {};
    this.tokenTypes = new Map();
    const typeOf = (name, v) => {
      if (v.type === 'color') return 'color';
      if (v.type === 'string') return name.startsWith('font') ? 'fontFamilies' : null;
      if (name.startsWith('radius')) return 'borderRadius';
      if (name.startsWith('space') || name === 'hairline') return 'spacing';
      if (name.startsWith('text-')) return 'fontSizes';
      if (name.startsWith('opacity')) return 'opacity';
      return 'number';
    };
    for (const [name, v] of Object.entries(this.pen.variables)) {
      const t = typeOf(name, v);
      if (!t) continue;
      let value = this.pen.varValue(name);
      if (t === 'fontFamilies') value = [canonicalFamily(value)];
      else if (t !== 'color') value = String(value);
      set[name] = { $type: t, $value: value };
      this.tokenTypes.set(name, t);
    }
    this.bump('tokens', Object.keys(set).length);
    return { segno: set, $themes: [], $metadata: { tokenSetOrder: ['segno'], activeSets: ['segno'] } };
  }

  // Token name bound by a pen value, if it is one of the given token types.
  token(value, ...types) {
    const name = PenDoc.varName(value);
    if (!name || !this.tokenTypes.has(name)) return undefined;
    if (types.length && !types.includes(this.tokenTypes.get(name))) return undefined;
    return name;
  }

  // ---- paints --------------------------------------------------------------

  colorFill(value) {
    const name = PenDoc.varName(value);
    const { color, opacity } = splitHex(this.pen.resolve(value));
    const f = { fillColor: color, fillOpacity: opacity };
    if (name && this.colorIds.has(name)) {
      f.fillColorRefId = this.colorIds.get(name);
      f.fillColorRefFile = this.fileId;
      this.bump('boundFills');
    }
    return f;
  }

  gradient(f) {
    const g = linearEnds(this.pen, f);
    if ((f.gradientType ?? 'linear') !== 'linear') this.lossy('non-linear gradient');
    return {
      type: (f.gradientType ?? 'linear') === 'radial' ? 'radial' : 'linear',
      startX: g.x1,
      startY: g.y1,
      endX: g.x2,
      endY: g.y2,
      width: 1,
      stops: (f.colors ?? []).map((s) => {
        const { color, opacity } = splitHex(this.pen.resolve(s.color));
        return { color, opacity, offset: this.pen.resolve(s.position) };
      }),
    };
  }

  // Penpot lists fills top first; pen paints its first fill at the bottom.
  fills(node) {
    const out = [];
    for (const f of fillsOf(node)) {
      if (typeof f === 'string') out.push(this.colorFill(f));
      else if (f.type === 'color') out.push(this.colorFill(f.color));
      else if (f.type === 'gradient') {
        out.push({ fillColorGradient: this.gradient(f), fillOpacity: this.pen.resolve(f.opacity ?? 1) });
        this.bump('gradients');
      } else if (f.type === 'image') {
        // A fitted image whose box has the image's proportions is a plain
        // image fill; otherwise the image goes into a child (see #emit).
        const img = this.media.get(f.url);
        if (img && node._imageDirect) {
          out.push({ fillImage: { ...img, keepAspectRatio: true }, fillOpacity: this.pen.resolve(f.opacity ?? 1) });
        }
      } else {
        this.lossy(`fill type ${f.type}`);
      }
    }
    return out.reverse();
  }

  strokes(node) {
    const list = (Array.isArray(node.stroke) ? node.stroke : node.stroke ? [node.stroke] : []).filter(
      (x) => !(typeof x === 'object' && x.enabled === false),
    );
    if (!list.length) return [];
    const w = strokeWidthsOf(this.pen, node);
    if (!w.every((x) => x === w[0])) return [];
    if (!w[0]) return [];
    const first = list[0];
    const value = typeof first === 'string' ? first : first.color;
    const name = PenDoc.varName(value);
    const { color, opacity } = splitHex(this.pen.resolve(value ?? '#000000'));
    const align =
      node.strokeAlignment ?? (node.type === 'frame' || node.type === 'rectangle' ? 'inner' : 'center');
    const s = {
      strokeColor: color,
      strokeOpacity: opacity,
      strokeWidth: w[0],
      strokeAlignment: align,
      strokeStyle: 'solid',
    };
    if (name && this.colorIds.has(name)) {
      s.strokeColorRefId = this.colorIds.get(name);
      s.strokeColorRefFile = this.fileId;
      this.bump('boundStrokes');
    }
    if (node.type === 'path') {
      const cap = { round: 'round', square: 'square' }[node.strokeLinecap];
      if (cap) {
        s.strokeCapStart = cap;
        s.strokeCapEnd = cap;
      }
      if (node.strokeLinejoin && node.strokeLinejoin !== 'miter') this.lossy('path stroke line join', node.strokeLinejoin);
    }
    if (list.length > 1) this.lossy('multiple stroke fills');
    return [s];
  }

  shadow(node) {
    const e = node.effect;
    if (!e) return undefined;
    const list = (Array.isArray(e) ? e : [e]).filter((x) => x.enabled !== false);
    const out = [];
    for (const s of list) {
      if (s.type !== 'shadow') {
        this.lossy(`effect ${s.type}`);
        continue;
      }
      let { color, opacity } = splitHex(this.pen.resolve(s.color ?? '#00000040'));
      const drop = s.shadowType !== 'inner';
      if (drop && !out.some((x) => x.style === 'drop-shadow')) {
        opacity = penpotShadowOpacity(opacity);
        this.bump('shadowsCompensated');
      }
      out.push({
        id: randomUUID(),
        style: drop ? 'drop-shadow' : 'inner-shadow',
        offsetX: this.pen.resolve(s.offset?.x ?? 0),
        offsetY: this.pen.resolve(s.offset?.y ?? 0),
        blur: this.pen.resolve(s.blur ?? 0),
        spread: 0,
        hidden: false,
        color: { color, opacity },
      });
      this.bump('shadows');
    }
    return out.length ? out : undefined;
  }

  // Loads every image the trees use into the file once, before emission.
  loadMedia(trees) {
    for (const tree of trees) {
      for (const [n] of walk(tree)) {
        for (const f of fillsOf(n)) {
          if (typeof f !== 'object' || f.type !== 'image' || this.media.has(f.url)) continue;
          const file = this.imageRoots.map((r) => `${r}/${f.url}`).find((p) => existsSync(p));
          if (!file) {
            this.media.set(f.url, null);
            continue;
          }
          const buf = readFileSync(file);
          const { width, height } = imageSize(buf);
          const mtype = file.endsWith('.png') ? 'image/png' : 'image/jpeg';
          const id = this.ctx.addFileMedia({ name: f.url.split('/').pop(), width, height }, new Blob([buf], { type: mtype }));
          this.media.set(f.url, { ...this.ctx.getMediaAsImage(id) });
          this.bump('images');
        }
      }
    }
  }

  // ---- naming --------------------------------------------------------------

  // Layer name: the pen name, unless it only repeats the HTML tag ("div"),
  // in which case the role plus the first text inside, or the pen id.
  layerName(node) {
    const raw = node.name;
    const generic = !raw || GENERIC_NAMES.has(raw.toLowerCase()) || raw === node.context;
    if (!generic) return raw;
    const snippet = (t) => {
      const s = String(this.pen.resolve(t.content ?? '')).replace(/\s+/g, ' ').trim();
      return s.length > 40 ? `${s.slice(0, 39)}…` : s;
    };
    const role = (raw ?? node.context ?? node.type).toLowerCase();
    if (node.type === 'text') return snippet(node) || `text ${node.id}`;
    if (node.type === 'ellipse') return `dot ${node.id}`;
    const queue = [...(node.children ?? [])];
    while (queue.length) {
      const c = queue.shift();
      if (c.type === 'text' && !c._hidden && snippet(c)) return `${role}: ${snippet(c)}`;
      queue.push(...(c.children ?? []));
    }
    return `${role} ${node.id}`;
  }

  // ---- text ----------------------------------------------------------------

  textStyle(node, measured) {
    const pen = this.pen;
    const fam = canonicalFamily(pen.resolve(node.fontFamily ?? 'Inter'));
    let weight = pen.resolve(node.fontWeight ?? 'normal');
    if (weight === 'normal') weight = '400';
    if (weight === 'bold') weight = '700';
    weight = String(weight);
    const font = this.fonts[fam];
    if (!font) throw new Error(`no Penpot font for ${fam}`);
    const variant = font.variant(weight);
    if (variant.weight !== weight) this.lossy(`font weight ${fam} ${weight} rendered as ${variant.weight}`);
    const size = pen.resolve(node.fontSize ?? 14);
    let lh = pen.resolve(node.lineHeight);
    if (lh === undefined) {
      const first = measured?.lines?.[0];
      lh = first ? round(first.h / size, 4) : 1.2;
      this.bump('textsWithMeasuredLineHeight');
    }
    const f = fillsOf(node)[0];
    const fills = f === undefined ? [{ fillColor: '#000000', fillOpacity: 1 }] : [this.colorFill(typeof f === 'string' ? f : f.color)];
    const deco = pen.resolve(node.underline) ? 'underline' : pen.resolve(node.strikethrough) ? 'line-through' : 'none';
    return {
      fontId: font.fontId,
      fontFamily: font.family,
      fontVariantId: variant.id,
      fontSize: String(size),
      fontWeight: variant.weight,
      fontStyle: 'normal',
      lineHeight: String(lh),
      letterSpacing: String(pen.resolve(node.letterSpacing ?? 0)),
      textTransform: 'none',
      textDecoration: deco,
      fills,
    };
  }

  textContent(node, style) {
    const text = String(this.pen.resolve(node.content ?? ''));
    const align = node.textAlign ?? 'left';
    const paragraphs = text.split('\n').map((line) => ({
      type: 'paragraph',
      textAlign: align,
      ...style,
      children: [{ text: line, ...style }],
    }));
    const va = { top: 'top', middle: 'center', bottom: 'bottom' }[node.textAlignVertical ?? 'top'];
    return {
      type: 'root',
      verticalAlign: va,
      children: [{ type: 'paragraph-set', children: paragraphs }],
    };
  }

  positionData(measured, style) {
    return (measured?.lines ?? []).map((l) => ({
      x: round(this.ox + l.x),
      y: round(this.oy + l.y + l.h),
      width: round(l.w),
      height: round(l.h),
      text: l.text,
      fontFamily: style.fontFamily,
      fontSize: `${style.fontSize}px`,
      fontWeight: style.fontWeight,
      fontStyle: 'normal',
      textTransform: 'none',
      textDecoration: style.textDecoration,
      letterSpacing: `${style.letterSpacing}px`,
      direction: 'ltr',
      fills: style.fills.map(({ fillColor, fillOpacity }) => ({ fillColor, fillOpacity })),
    }));
  }

  // ---- shapes --------------------------------------------------------------

  // Builds the Penpot params of one node. `geo` is its untransformed
  // absolute rect; `xf` the absolute transform of rotated ancestors (or of
  // the node itself), if any.
  shapeParams(node, geo, parentLayout, m, xf) {
    const pen = this.pen;
    const p = {
      id: node._uuid,
      name: this.layerName(node),
      ...this.placement(geo, xf),
    };
    if (node._hidden) p.hidden = true;
    const op = pen.resolve(node.opacity);
    if (op !== undefined && op !== 1) p.opacity = op;
    const tokens = {};

    const inFlex = parentLayout && parentLayout !== 'none';
    if (inFlex) {
      if (node.layoutPosition === 'absolute') p.layoutItemAbsolute = true;
      else {
        p.layoutItemHSizing = this.sizing(node, 'width');
        p.layoutItemVSizing = this.sizing(node, 'height');
      }
    } else if (node.type === 'frame' && layoutOf(node) !== 'none') {
      // A layout container's own hug behaviour.
      p.layoutItemHSizing = this.sizing(node, 'width');
      p.layoutItemVSizing = this.sizing(node, 'height');
    }
    const opToken = this.token(node.opacity, 'opacity');
    if (opToken) tokens.opacity = opToken;

    const t = node.type;
    if (t === 'frame' || t === 'rectangle' || t === 'ellipse') {
      p.fills = this.fills(node);
      const fl = fillsOf(node);
      const fillToken = fl.length === 1 && typeof fl[0] === 'string' ? this.token(fl[0], 'color') : undefined;
      if (fillToken) tokens.fill = fillToken;
      const strokes = this.strokes(node);
      if (strokes.length) {
        p.strokes = strokes;
        const sv = Array.isArray(node.stroke) ? node.stroke[0] : node.stroke;
        const st = this.token(typeof sv === 'string' ? sv : sv?.color, 'color');
        if (st) tokens.strokeColor = st;
      }
      const sh = this.shadow(node);
      if (sh) p.shadow = sh;
      const blend = fillBlendOf(node);
      if (blend) {
        if (BLEND[blend]) p.blendMode = BLEND[blend];
        else this.lossy(`fill blend mode ${blend}`, node.id);
      }
      if (t !== 'ellipse') {
        const [r1, r2, r3, r4] = radiiOf(pen, node).map((r) => Math.min(r, Math.min(geo.w, geo.h) / 2));
        if (r1 || r2 || r3 || r4) {
          Object.assign(p, { r1, r2, r3, r4 });
          const raw = node.cornerRadius;
          const corners = Array.isArray(raw) ? raw : [raw, raw, raw, raw];
          corners.forEach((c, i) => {
            const name = this.token(c, 'borderRadius');
            if (name) tokens[`r${i + 1}`] = name;
          });
        }
      }
    }
    if (t === 'frame') {
      p.showContent = pen.resolve(node.clip) !== true;
      const layout = layoutOf(node);
      if (layout !== 'none') {
        const gap = pen.resolve(node.gap ?? 0);
        const [pt, pr, pb, pl] = paddingOf(pen, node);
        Object.assign(p, {
          layout: 'flex',
          layoutFlexDir: layout === 'horizontal' ? 'row' : 'column',
          layoutGap: { rowGap: gap, columnGap: gap },
          layoutGapType: 'multiple',
          layoutWrapType: 'nowrap',
          layoutPadding: { p1: pt, p2: pr, p3: pb, p4: pl },
          layoutPaddingType: 'multiple',
          layoutJustifyContent: JUSTIFY[node.justifyContent ?? 'start'],
          layoutAlignItems: ALIGN[node.alignItems ?? 'start'],
          layoutAlignContent: 'stretch',
        });
        const gapToken = this.token(node.gap, 'spacing');
        if (gapToken) Object.assign(tokens, { rowGap: gapToken, columnGap: gapToken });
        const pad = node.padding;
        const sides = Array.isArray(pad) ? (pad.length === 2 ? [pad[0], pad[1], pad[0], pad[1]] : pad) : [pad, pad, pad, pad];
        sides.forEach((v, i) => {
          const name = this.token(v, 'spacing');
          if (name) tokens[`p${i + 1}`] = name;
        });
      }
    }
    if (t === 'text') {
      const style = this.textStyle(node, m);
      p.content = this.textContent(node, style);
      p.positionData = this.positionData(m, style);
      const g = node.textGrowth ?? 'auto';
      p.growType = g === 'auto' ? 'auto-width' : g === 'fixed-width' ? 'auto-height' : 'fixed';
      const sh = this.shadow(node);
      if (sh) p.shadow = sh;
      const f = fillsOf(node)[0];
      const ft = typeof f === 'string' ? this.token(f, 'color') : undefined;
      if (ft) tokens.fill = ft;
      const fs = this.token(node.fontSize, 'fontSizes');
      if (fs) tokens.fontSize = fs;
      const ff = this.token(node.fontFamily, 'fontFamilies');
      if (ff) tokens.fontFamily = ff;
      if (xf) this.lossy('text inside a rotated layer', node.id);
    }
    if (t === 'path') {
      let d = mapPath(node.geometry ?? '', node._viewBox, geo.x, geo.y, geo.w, geo.h);
      if (xf) d = svgpath(d).matrix([xf.a, xf.b, xf.c, xf.d, xf.e, xf.f]).round(3).toString();
      p.content = d;
      p.fills = this.fills(node);
      // Always set: a path without strokes gets a 1 px black one by default.
      p.strokes = this.strokes(node);
      // Penpot's renderer merges svg-attrs into the path element, which is
      // how it keeps the fill rule of imported SVG paths.
      if (node.fillRule === 'evenodd') {
        p.svgAttrs = { fillRule: 'evenodd' };
        this.bump('evenoddPaths');
      }
      for (const k of ['x', 'y', 'width', 'height', 'rotation', 'transform', 'transformInverse']) delete p[k];
    }
    if (t === 'icon') {
      const g = iconGlyph(pen.resolve(node.library), pen.resolve(node.icon));
      const fit = iconFit(g, geo.w, geo.h);
      let d = placePath(g.d, fit.s, geo.x + fit.tx, geo.y + fit.ty);
      if (xf) d = svgpath(d).matrix([xf.a, xf.b, xf.c, xf.d, xf.e, xf.f]).round(3).toString();
      p.content = d;
      p.name = `${node.name && !GENERIC_NAMES.has(node.name.toLowerCase()) ? node.name : 'icon'} (${pen.resolve(node.library)} ${pen.resolve(node.icon)})`;
      const f = fillsOf(node)[0] ?? '#000000';
      const paint = this.colorFill(typeof f === 'string' ? f : f.color);
      const colorToken = typeof f === 'string' ? this.token(f, 'color') : undefined;
      if (g.mode === 'stroke') {
        p.fills = [];
        p.strokes = [
          {
            strokeColor: paint.fillColor,
            strokeOpacity: paint.fillOpacity,
            strokeWidth: round(g.strokeWidth * fit.s),
            strokeAlignment: 'center',
            strokeStyle: 'solid',
            strokeCapStart: 'round',
            strokeCapEnd: 'round',
            ...(paint.fillColorRefId ? { strokeColorRefId: paint.fillColorRefId, strokeColorRefFile: paint.fillColorRefFile } : {}),
          },
        ];
        if (colorToken) tokens.strokeColor = colorToken;
      } else {
        p.fills = [paint];
        // Explicit: a path without strokes gets a 1 px black one by default.
        p.strokes = [];
        if (colorToken) tokens.fill = colorToken;
      }
      this.bump('icons');
      for (const k of ['x', 'y', 'width', 'height', 'rotation', 'transform', 'transformInverse']) delete p[k];
    }
    if (Object.keys(tokens).length) {
      p.appliedTokens = tokens;
      this.bump('shapesWithTokens');
      this.bump('appliedTokens', Object.keys(tokens).length);
    }
    return p;
  }

  // x/y/width/height, plus rotation and transform when `xf` rotates.
  placement(geo, xf) {
    const w = Math.max(round(geo.w), 0.01);
    const h = Math.max(round(geo.h), 0.01);
    if (!xf) return { x: round(geo.x), y: round(geo.y), width: w, height: h };
    const [cx, cy] = apply(xf, geo.x + geo.w / 2, geo.y + geo.h / 2);
    const lin = linearOf(xf);
    const deg = (((Math.atan2(lin.b, lin.a) * 180) / Math.PI) % 360 + 360) % 360;
    return {
      x: round(cx - geo.w / 2),
      y: round(cy - geo.h / 2),
      width: w,
      height: h,
      rotation: round(deg, 4),
      transform: lin,
      transformInverse: invert(lin),
    };
  }

  sizing(node, dim) {
    const pen = this.pen;
    let raw = pen.resolve(node[dim]);
    if (node.type === 'text') {
      const g = node.textGrowth ?? 'auto';
      if (g === 'auto') raw = undefined;
      if (g === 'fixed-width' && dim === 'height') raw = undefined;
    }
    const s = parseSize(raw);
    if (s.kind === 'fixed') return 'fix';
    if (s.kind === 'fill') return 'fill';
    if (node.type === 'frame' || node.type === 'text') return 'auto';
    return 'fix';
  }

  // Penpot kind of a node.
  kind(node) {
    switch (node.type) {
      case 'frame':
        return 'board';
      case 'rectangle':
        return 'rect';
      case 'ellipse':
        return 'circle';
      case 'text':
        return 'text';
      case 'path':
      case 'icon':
        return 'path';
      case 'group':
        return 'group';
      default:
        return null;
    }
  }

  // ---- components ----------------------------------------------------------

  // Gives every node a Penpot id and indexes the main trees of components.
  prepare(trees) {
    for (const tree of trees) {
      for (const [n] of walk(tree)) {
        n._uuid = randomUUID();
        if (n.reusable === true && !n._inst) {
          const rel = new Map();
          for (const [d] of walk(n)) rel.set(d._path.slice(n._path.length), d);
          this.mainRel.set(n.id, rel);
        }
      }
    }
    for (const tree of trees) this.#markCopies(tree, null, false);
    this.loadMedia(trees);
  }

  #markCopies(node, copyRoot, inMain) {
    if (inMain) node._inMain = true;
    if (node.reusable === true && !node._inst) {
      node._isMain = true;
      node._inMain = true;
      for (const c of node.children ?? []) this.#markCopies(c, null, true);
      return;
    }
    if (node._inst && copyRoot === null) {
      const rel = this.mainRel.get(node._comp);
      let ok = !!rel && !node._structural;
      if (ok) {
        for (const [d] of walk(node)) {
          if (!rel.has(d._path.slice(node._path.length))) {
            ok = false;
            break;
          }
        }
      }
      if (!ok) {
        this.lossy('instance detached (structural override or missing main)', `${node._path} -> ${node._comp}`);
        node._detached = true;
        for (const c of node.children ?? []) this.#markCopies(c, null, inMain);
        return;
      }
      node._copyRoot = node;
      node._componentRoot = !inMain;
      this.bump('copies');
      for (const c of node.children ?? []) this.#markCopies(c, node, inMain);
      return;
    }
    if (copyRoot) node._copyRoot = copyRoot;
    for (const c of node.children ?? []) this.#markCopies(c, copyRoot, inMain);
  }

  componentAttrs(node) {
    const a = {};
    if (node._isMain) {
      Object.assign(a, {
        componentId: this.componentIdOf(node.id),
        componentFile: this.fileId,
        componentRoot: true,
        mainInstance: true,
      });
      this.components.push(node);
    }
    if (node._copyRoot) {
      const root = node._copyRoot;
      const target = this.mainRel.get(root._comp).get(node._path.slice(root._path.length));
      a.shapeRef = target._uuid;
      if (node._inst) {
        a.componentId = this.componentIdOf(node._comp);
        a.componentFile = this.fileId;
        if (node === root && root._componentRoot) a.componentRoot = true;
      }
      node._mainNode = target;
    }
    return a;
  }

  componentIdOf(penId) {
    this.compIds ??= new Map();
    if (!this.compIds.has(penId)) this.compIds.set(penId, randomUUID());
    return this.compIds.get(penId);
  }

  // Override flags of a copy shape: the sync groups whose attributes differ
  // from the main's, set the way Penpot sets them when the copy is edited
  // (container.cljc set-shape-attr): text content changes add the kind of
  // change (text, attribute, structure) next to :content-group, otherwise a
  // main edit resets the copy's text.
  touched(p, mp, node, mainNode) {
    const groups = new Set();
    const strip = (k, v) => (k === 'shadow' && v ? v.map(({ id, ...rest }) => rest) : v);
    for (const [k, g] of Object.entries(TOUCH_GROUPS)) {
      if (JSON.stringify(strip(k, p[k]) ?? null) !== JSON.stringify(strip(k, mp[k]) ?? null)) groups.add(g);
    }
    for (const k of ['width', 'height']) {
      if (p[k] !== undefined && mp[k] !== undefined && Math.abs(p[k] - mp[k]) > 0.5) groups.add('geometry-group');
    }
    if (p.name !== mp.name) groups.add('name-group');
    if (p.content && typeof p.content === 'object') {
      const diff = textDiff(p.content, mp.content);
      if (diff.size) {
        groups.add('content-group');
        for (const d of diff) groups.add(d);
      }
    }
    // Path content moves with the shape, so only a pen geometry override
    // (a different drawing, not a moved or resized one) marks it.
    if (node.type === 'path' && node.geometry !== mainNode.geometry) groups.add('content-group');
    if (node.type === 'icon') {
      const r = (n, k) => this.pen.resolve(n[k]);
      if (r(node, 'icon') !== r(mainNode, 'icon') || r(node, 'library') !== r(mainNode, 'library')) groups.add('content-group');
    }
    const ta = p.appliedTokens ?? {};
    const tb = mp.appliedTokens ?? {};
    for (const k of new Set([...Object.keys(ta), ...Object.keys(tb)])) {
      if (ta[k] === tb[k]) continue;
      const g = TOKEN_GROUPS[k];
      if (!g) continue;
      if (p.content && typeof p.content === 'object' && ['fill', 'fontSize', 'fontFamily'].includes(k)) {
        groups.add('content-group');
        groups.add('text-content-attribute');
      } else {
        groups.add(g);
      }
    }
    return [...groups];
  }

  // ---- emission ------------------------------------------------------------

  async computeMainParams(tree, measure, origin) {
    this.ox = origin.x;
    this.oy = origin.y;
    this.measure = measure;
    this.silent = true;
    this.#visit(tree, null, null, null, (n, geo, parentLayout, xf) => {
      if (!n._inMain) return;
      this.imagePlan(n, geo);
      this.attrsById.set(n._uuid, this.shapeParams(n, geo, parentLayout, measure.texts[n._n], xf));
    });
    this.silent = false;
  }

  // Walks a tree computing each node's untransformed geometry and transform.
  #visit(node, parent, parentGeo, parentXf, fn) {
    const { geo, xf } = this.geoOf(node, parentGeo, parentXf);
    fn(node, geo, parent ? layoutOf(parent) : null, xf);
    for (const c of node.children ?? []) this.#visit(c, node, geo, xf, fn);
  }

  // Untransformed absolute rect of a node, and the absolute transform that
  // applies to it (its own rotation and its rotated ancestors').
  geoOf(node, parentGeo, parentXf) {
    const r = this.measure.rects[node._n];
    const pen = this.pen;
    let geo;
    if (!r || node._hidden) {
      const w = typeof pen.resolve(node.width) === 'number' ? pen.resolve(node.width) : (parentGeo?.w ?? 1);
      const h = typeof pen.resolve(node.height) === 'number' ? pen.resolve(node.height) : (parentGeo?.h ?? 1);
      const base = parentGeo ?? { x: this.ox, y: this.oy };
      geo = { x: base.x + (node.x ?? 0), y: base.y + (node.y ?? 0), w, h };
    } else if (parentXf || pen.resolve(node.rotation)) {
      // Under a rotation the bounding rect is rotated too: rebuild the box from
      // the untransformed offsets inside the parent.
      geo = { x: parentGeo.x + r.ox, y: parentGeo.y + r.oy, w: r.ow, h: r.oh };
    } else {
      geo = { x: this.ox + r.x, y: this.oy + r.y, w: r.w, h: r.h };
    }
    let xf = parentXf;
    const rot = pen.resolve(node.rotation);
    if (rot) {
      const own = penRotation(rot, geo.x, geo.y);
      xf = xf ? multiply(xf, own) : own;
      this.bump('rotated');
    }
    return { geo, xf };
  }

  // Emits one top-level pen frame (and its notes) onto the current page.
  async emitScreen(tree, measure, notes, origin) {
    this.ox = origin.x;
    this.oy = origin.y;
    this.measure = measure;
    await this.#emit(tree, null, null, null);
    for (const n of notes) await this.#emit(n, null, null, null);
  }

  async #emit(node, parent, parentGeo, parentXf) {
    const kind = this.kind(node);
    if (!kind) {
      this.lossy(`node type ${node.type}`, node.id);
      return;
    }
    const { geo, xf } = this.geoOf(node, parentGeo, parentXf);
    const parentLayout = parent ? layoutOf(parent) : null;

    const imageChild = this.imagePlan(node, geo);

    const p = this.shapeParams(node, geo, parentLayout, this.measure.texts[node._n], xf);
    Object.assign(p, this.componentAttrs(node));
    if (node._mainNode) {
      const mp = this.attrsById.get(node._mainNode._uuid);
      if (mp) {
        const t = this.touched(p, mp, node, node._mainNode);
        if (t.length) {
          p.touched = t;
          this.bump('touchedShapes');
          for (const g of t) this.bump(`touched:${g}`);
        }
      }
    }
    if (node._zIndex !== undefined) p.layoutItemZIndex = node._zIndex;

    const perSide = this.perSideStrokes(node, geo);
    // A rectangle has no children in Penpot: holding a fitted image or a side
    // border makes it a board.
    const board = kind === 'board' || imageChild || perSide.length;

    if (board) {
      if (kind !== 'board') {
        p.showContent = true;
        this.bump('rectanglesAsBoards');
      }
      this.ctx.addBoard(p);
      this.bump('boards');
      if (imageChild) this.ctx.addRect(imageChild);
      const kids = node.children ?? [];
      const flex = node.type === 'frame' && layoutOf(node) !== 'none';
      // Penpot flows flex children in reverse layer order: emit them reversed
      // and keep pen's stacking with z-index.
      const ordered = flex ? kids.map((c, i) => [c, i]).reverse() : kids.map((c, i) => [c, i]);
      for (const [c, i] of ordered) {
        if (flex) c._zIndex = i;
        await this.#emit(c, node, geo, xf);
      }
      for (const s of perSide) this.ctx.addRect(s);
      this.ctx.closeBoard();
    } else if (kind === 'rect') {
      this.ctx.addRect(p);
      this.bump('rects');
    } else if (kind === 'circle') {
      this.ctx.addCircle(p);
      this.bump('circles');
    } else if (kind === 'text') {
      this.ctx.addText(p);
      this.bump('texts');
    } else if (kind === 'path') {
      this.ctx.addPath(p);
      this.bump('paths');
    }
  }

  // Image fills: pen draws them 'fit' (contain). A box with the image's
  // proportions takes the image as a normal fill; any other box gets the
  // image as a child rectangle sized to the fitted area, which is how Penpot
  // itself places an image. Returns that child, or null.
  imagePlan(node, geo) {
    const imgFill = fillsOf(node).find((f) => typeof f === 'object' && f.type === 'image');
    if (!imgFill) return null;
    const img = this.media.get(imgFill.url);
    if (!img) {
      this.lossy('missing image file', imgFill.url);
      return null;
    }
    const mode = imgFill.mode ?? 'cover';
    const ratio = img.width / img.height;
    if (mode === 'stretch' || mode === 'cover' || Math.abs(geo.w / geo.h - ratio) < 0.005 * ratio) {
      node._imageDirect = true;
      this.bump('imageFills');
      return null;
    }
    const s = Math.min(geo.w / img.width, geo.h / img.height);
    const w = img.width * s;
    const h = img.height * s;
    this.bump('fittedImageChildren');
    return {
      id: randomUUID(),
      name: imgFill.url.split('/').pop(),
      x: round(geo.x + (geo.w - w) / 2),
      y: round(geo.y + (geo.h - h) / 2),
      width: round(w),
      height: round(h),
      proportionLock: true,
      fills: [{ fillImage: { ...img, keepAspectRatio: true }, fillOpacity: 1 }],
      constraintsH: 'scale',
      constraintsV: 'scale',
      ...(node.type === 'frame' && layoutOf(node) !== 'none' ? { layoutItemAbsolute: true } : {}),
    };
  }

  // Penpot 2.18's renderer has no per-side stroke widths (the stroke-width-*
  // attributes are read by the experimental WASM renderer only). Every
  // per-side stroke in the pen draws one side, so it becomes one thin
  // rectangle named after that side, pinned to the edge by constraints and
  // bound to the same library colour.
  perSideStrokes(node, geo) {
    if (!['frame', 'rectangle'].includes(node.type)) return [];
    const list = Array.isArray(node.stroke) ? node.stroke : node.stroke ? [node.stroke] : [];
    if (!list.length) return [];
    const w = strokeWidthsOf(this.pen, node);
    if (w.every((x) => x === w[0])) return [];
    this.bump('perSideStrokes');
    const first = list[0];
    const value = typeof first === 'string' ? first : first.color;
    const paint = this.colorFill(value);
    const colorToken = this.token(value, 'color');
    const align = node.strokeAlignment ?? 'inner';
    const k = align === 'inner' ? 0 : align === 'center' ? 0.5 : 1;
    const [t, r, b, l] = w;
    const flex = node.type === 'frame' && layoutOf(node) !== 'none';
    const side = (name, x, y, width, height, ch, cv) => ({
      id: randomUUID(),
      name: `border-${name}`,
      x: round(x),
      y: round(y),
      width: round(width),
      height: round(height),
      fills: [paint],
      constraintsH: ch,
      constraintsV: cv,
      ...(colorToken ? { appliedTokens: { fill: colorToken } } : {}),
      ...(flex ? { layoutItemAbsolute: true, layoutItemZIndex: 100000 } : {}),
    });
    const out = [];
    const { x: X, y: Y, w: W, h: H } = geo;
    if (t) out.push(side('top', X - k * l, Y - k * t, W + k * (l + r), t, 'leftright', 'top'));
    if (b) out.push(side('bottom', X - k * l, Y + H - b + k * b, W + k * (l + r), b, 'leftright', 'bottom'));
    if (l) out.push(side('left', X - k * l, Y - k * t, l, H + k * (t + b), 'left', 'topbottom'));
    if (r) out.push(side('right', X + W - r + k * r, Y - k * t, r, H + k * (t + b), 'right', 'topbottom'));
    return out;
  }

  addPage(name, background) {
    this.ctx.addPage(background ? { name, background } : { name });
  }

  closePage() {
    this.ctx.closePage();
  }

  finishComponents(pageOf) {
    for (const node of this.components) {
      this.ctx.addComponent({
        componentId: this.componentIdOf(node.id),
        fileId: this.fileId,
        pageId: pageOf.get(node.id),
        frameId: node._uuid,
        name: node.name ?? node.id,
      });
    }
  }

  async write() {
    this.ctx.closeFile();
    return penpot.exportAsBytes(this.ctx);
  }
}
