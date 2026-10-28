// Writes a Penpot file with @penpot/library from expanded pen trees and the
// geometry the browser computed for them.

import * as penpot from '@penpot/library';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { PenDoc, walk } from './pen.mjs';
import {
  layoutOf,
  fillsOf,
  paddingOf,
  radiiOf,
  strokeWidthsOf,
  parseSize,
  linearEnds,
} from './html.mjs';
import { iconGlyph, iconFit } from './icons.mjs';
import { mapPath, placePath } from './geometry.mjs';
import { imageSize } from './image-size.mjs';

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

// Penpot attributes that matter for override (touched) detection, mapped to
// their sync group, as in app.common.types.component/sync-attrs.
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
  width: 'geometry-group',
  height: 'geometry-group',
  content: 'content-group',
  growType: 'text-font-group',
  layout: 'layout-container',
  layoutFlexDir: 'layout-flex-dir',
  layoutGap: 'layout-gap',
  layoutPadding: 'layout-padding',
  layoutJustifyContent: 'layout-justify-content',
  layoutAlignItems: 'layout-align-items',
  layoutItemHSizing: 'layout-item-h-sizing',
  layoutItemVSizing: 'layout-item-v-sizing',
  layoutItemAbsolute: 'layout-item-absolute',
  name: 'name-group',
};

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
    this.mainRoot = new Map();
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
    for (const [name, v] of Object.entries(this.pen.variables)) {
      if (v.type !== 'color') continue;
      const { color, opacity } = splitHex(this.pen.varValue(name));
      const id = this.ctx.addLibraryColor({ name, color, opacity });
      this.colorIds.set(name, id);
    }
    this.bump('libraryColors', this.colorIds.size);
    const tokens = this.tokenSets();
    if (tokens) {
      this.ctx.addTokensLib(JSON.stringify(tokens));
    }
  }

  // Number and string variables as Penpot design tokens (DTCG). Colours are
  // also library colours above; they go into the token set too so a shape can
  // carry both bindings.
  tokenSets() {
    const set = {};
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
      if (t === 'fontFamilies') value = [value];
      else if (t !== 'color') value = String(value);
      set[name] = { $type: t, $value: value };
    }
    this.tokenNames = new Set(Object.keys(set));
    return { segno: set, $themes: [], $metadata: { tokenSetOrder: ['segno'], activeSets: ['segno'] } };
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
        // Handled by the caller (needs geometry).
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
      const { color, opacity } = splitHex(this.pen.resolve(s.color ?? '#00000040'));
      out.push({
        id: randomUUID(),
        style: s.shadowType === 'inner' ? 'inner-shadow' : 'drop-shadow',
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

  async imageMedia(url) {
    if (this.media.has(url)) return this.media.get(url);
    let file = null;
    for (const root of this.imageRoots) {
      const p = `${root}/${url}`;
      try {
        readFileSync(p, { flag: 'r' });
        file = p;
        break;
      } catch {}
    }
    if (!file) {
      this.media.set(url, null);
      return null;
    }
    const buf = readFileSync(file);
    const { width, height } = imageSize(buf);
    const mtype = file.endsWith('.png') ? 'image/png' : 'image/jpeg';
    const id = this.ctx.addFileMedia({ name: url.split('/').pop(), width, height }, new Blob([buf], { type: mtype }));
    const img = { ...this.ctx.getMediaAsImage(id), keepAspectRatio: false };
    this.media.set(url, img);
    this.bump('images');
    return img;
  }

  // ---- text ----------------------------------------------------------------

  font(family, weight) {
    const f = this.fonts[family];
    if (!f) {
      this.lossy('font without Penpot mapping', family);
      return this.fonts.Inter;
    }
    return f;
  }

  textStyle(node, measured) {
    const pen = this.pen;
    const fam = pen.resolve(node.fontFamily ?? 'Inter');
    let weight = pen.resolve(node.fontWeight ?? 'normal');
    if (weight === 'normal') weight = '400';
    if (weight === 'bold') weight = '700';
    weight = String(weight);
    const font = this.font(fam, weight);
    if (font.substitute) this.lossy(`font ${fam} substituted by ${font.family}`);
    const variant = font.variant(weight);
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
      _cssFamily: font.cssFamily ?? font.family,
    };
  }

  textContent(node, style) {
    const { _cssFamily, ...st } = style;
    const text = String(this.pen.resolve(node.content ?? ''));
    const align = node.textAlign ?? 'left';
    const paragraphs = text.split('\n').map((line) => ({
      type: 'paragraph',
      textAlign: align,
      ...st,
      children: [{ text: line, ...st }],
    }));
    const va = { top: 'top', middle: 'center', bottom: 'bottom' }[node.textAlignVertical ?? 'top'];
    return {
      type: 'root',
      verticalAlign: va,
      children: [{ type: 'paragraph-set', children: paragraphs }],
    };
  }

  positionData(measured, style, ox, oy) {
    return (measured?.lines ?? []).map((l) => ({
      x: round(ox + l.x),
      y: round(oy + l.y + l.h),
      width: round(l.w),
      height: round(l.h),
      text: l.text,
      fontFamily: style._cssFamily,
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

  // Builds the Penpot params of one node. `geo` is the absolute rect.
  async shapeParams(node, geo, parentLayout, m) {
    const pen = this.pen;
    const p = {
      id: node._uuid,
      name: node.name ?? node.id,
      x: round(geo.x),
      y: round(geo.y),
      width: Math.max(round(geo.w), 0.01),
      height: Math.max(round(geo.h), 0.01),
    };
    if (node._hidden) p.hidden = true;
    const op = pen.resolve(node.opacity);
    if (op !== undefined && op !== 1) p.opacity = op;
    if (pen.resolve(node.rotation)) this.lossy('rotation', node.id);

    // Layout child attributes.
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

    const t = node.type;
    if (t === 'frame' || t === 'rectangle' || t === 'ellipse') {
      const fills = this.fills(node);
      p.fills = fills;
      const strokes = this.strokes(node);
      if (strokes.length) p.strokes = strokes;
      const sh = this.shadow(node);
      if (sh) p.shadow = sh;
      if (t !== 'ellipse') {
        const [r1, r2, r3, r4] = radiiOf(pen, node).map((r) => Math.min(r, Math.min(geo.w, geo.h) / 2));
        if (r1 || r2 || r3 || r4) Object.assign(p, { r1, r2, r3, r4 });
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
      }
    }
    if (t === 'text') {
      const style = this.textStyle(node, m);
      p.content = this.textContent(node, style);
      p.positionData = this.positionData(m, style, this.ox, this.oy);
      const g = node.textGrowth ?? 'auto';
      p.growType = g === 'auto' ? 'auto-width' : g === 'fixed-width' ? 'auto-height' : 'fixed';
      const sh = this.shadow(node);
      if (sh) p.shadow = sh;
    }
    if (t === 'path') {
      const vb = node._viewBox;
      p.content = mapPath(node.geometry ?? '', vb, geo.x, geo.y, geo.w, geo.h);
      p.fills = this.fills(node);
      const strokes = this.strokes(node);
      if (strokes.length) p.strokes = strokes;
      if (node.fillRule === 'evenodd') this.lossy('path fill rule evenodd', node.id);
      delete p.x;
      delete p.y;
      delete p.width;
      delete p.height;
    }
    if (t === 'icon') {
      const g = iconGlyph(pen.resolve(node.library), pen.resolve(node.icon));
      const fit = iconFit(g, geo.w, geo.h);
      p.content = placePath(g.d, fit.s, geo.x + fit.tx, geo.y + fit.ty);
      p.name = `${node.name ?? 'icon'} (${pen.resolve(node.library)} ${pen.resolve(node.icon)})`;
      const f = fillsOf(node)[0] ?? '#000000';
      const paint = this.colorFill(typeof f === 'string' ? f : f.color);
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
      } else {
        p.fills = [paint];
      }
      this.bump('icons');
      delete p.x;
      delete p.y;
      delete p.width;
      delete p.height;
    }
    return p;
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
        return node._promote ? 'board' : 'rect';
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
          this.mainRoot.set(n.id, n);
        }
      }
    }
    // Validate copies: every node must have a counterpart in the main.
    for (const tree of trees) this.#markCopies(tree, null, false);
  }

  #markCopies(node, copyRoot, inMain) {
    if (inMain) node._inMain = true;
    if (node.reusable === true && !node._inst) {
      node._isMain = true;
      node._inMain = true;
      for (const c of node.children ?? []) this.#markCopies(c, null, true);
      return;
    }
    if (node._inst) {
      const rel = this.mainRel.get(node._comp);
      let ok = !!rel && !node._structural;
      if (copyRoot === null) {
        // Check the whole copy against the main.
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
      const rel = this.mainRel.get(root._comp);
      const target = rel.get(node._path.slice(root._path.length));
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

  // Override flags: groups whose attributes differ from the main's.
  touched(params, mainParams) {
    const groups = new Set();
    for (const [k, g] of Object.entries(TOUCH_GROUPS)) {
      if (k === 'name') continue;
      const a = k === 'content' && params.content?.type === 'root' ? textOf(params.content) : params[k];
      const b = k === 'content' && mainParams.content?.type === 'root' ? textOf(mainParams.content) : mainParams[k];
      if (k === 'width' || k === 'height') {
        if (a !== undefined && b !== undefined && Math.abs(a - b) > 0.5) groups.add(g);
        continue;
      }
      if (k === 'content' && params.content?.type === 'root') {
        if (a !== b) groups.add('content-group');
        if (JSON.stringify(stylesOf(params.content)) !== JSON.stringify(stylesOf(mainParams.content))) groups.add('text-font-group');
        continue;
      }
      if (k === 'content') continue;
      const strip = (v) => (k === 'shadow' && v ? v.map(({ id, ...rest }) => rest) : v);
      if (JSON.stringify(strip(a) ?? null) !== JSON.stringify(strip(b) ?? null)) groups.add(g);
    }
    return [...groups];
  }

  // ---- emission ------------------------------------------------------------

  // Emits one top-level pen frame (and its notes) onto the current page.
  async emitScreen(tree, measure, notes, origin) {
    this.ox = origin.x;
    this.oy = origin.y;
    this.measure = measure;
    // Mains are emitted before copies need their params; params of every main
    // node are computed in a first pass so copies can be compared.
    await this.#emit(tree, null);
    for (const n of notes) await this.#emit(n, null);
  }

  async computeMainParams(tree, measure, origin) {
    this.ox = origin.x;
    this.oy = origin.y;
    this.silent = true;
    for (const [n, parent] of walk(tree)) {
      if (!isInsideMain(n)) continue;
      const geo = this.geo(n, measure);
      const parentLayout = parent ? layoutOf(parent) : null;
      this.attrsById.set(n._uuid, await this.shapeParams(n, geo, parentLayout, measure.texts[n._n]));
    }
    this.silent = false;
  }

  geo(node, measure) {
    const r = measure.rects[node._n];
    if (!r || node._hidden) {
      const w = typeof this.pen.resolve(node.width) === 'number' ? this.pen.resolve(node.width) : 1;
      const h = typeof this.pen.resolve(node.height) === 'number' ? this.pen.resolve(node.height) : 1;
      return { x: this.ox, y: this.oy, w, h };
    }
    return { x: this.ox + r.x, y: this.oy + r.y, w: r.w, h: r.h };
  }

  async #emit(node, parent) {
    const kind = this.kind(node);
    if (!kind) {
      this.lossy(`node type ${node.type}`, node.id);
      return;
    }
    const m = this.measure;
    const geo = this.geo(node, m);
    const parentLayout = parent ? layoutOf(parent) : null;
    const p = await this.shapeParams(node, geo, parentLayout, m.texts[node._n]);
    Object.assign(p, this.componentAttrs(node));
    if (node._mainNode) {
      const mp = this.attrsById.get(node._mainNode._uuid);
      if (mp) {
        const t = this.touched(p, mp);
        if (t.length) {
          p.touched = t;
          this.bump('touchedShapes');
        }
      }
    }
    if (node._zIndex !== undefined) p.layoutItemZIndex = node._zIndex;

    // Image fills: pen draws them with 'fit' (contain). Penpot image fills only
    // stretch or cover, so the image goes into a child rectangle sized to the
    // contained box.
    const imgFill = fillsOf(node).find((f) => typeof f === 'object' && f.type === 'image');
    let imageChild = null;
    if (imgFill) {
      const img = await this.imageMedia(imgFill.url);
      if (!img) this.lossy('missing image file', imgFill.url);
      else {
        const mode = imgFill.mode ?? 'cover';
        let box = { x: geo.x, y: geo.y, w: geo.w, h: geo.h };
        if (mode === 'fit' || mode === 'contain') {
          const s = Math.min(geo.w / img.width, geo.h / img.height);
          const w = img.width * s;
          const h = img.height * s;
          box = { x: geo.x + (geo.w - w) / 2, y: geo.y + (geo.h - h) / 2, w, h };
        }
        imageChild = {
          id: randomUUID(),
          name: `image ${imgFill.url.split('/').pop()}`,
          x: round(box.x),
          y: round(box.y),
          width: round(box.w),
          height: round(box.h),
          fills: [{ fillImage: { ...img, keepAspectRatio: mode === 'cover' }, fillOpacity: 1 }],
          ...(p.r1 ? { r1: p.r1, r2: p.r2, r3: p.r3, r4: p.r4 } : {}),
        };
        if (layoutOf(node) !== 'none' && node.type === 'frame') imageChild.layoutItemAbsolute = true;
        if (kind !== 'board') this.lossy('image fill on non-frame promoted to board', node.id);
      }
    }
    const perSide = this.perSideStrokes(node, geo);
    const board = kind === 'board' || imageChild || perSide.length;

    if (board) {
      if (kind !== 'board') {
        // Rectangle promoted to a board to hold the image or side strokes.
        p.showContent = true;
        delete p.layoutItemHSizing;
        delete p.layoutItemVSizing;
        if (parentLayout && parentLayout !== 'none' && node.layoutPosition !== 'absolute') {
          p.layoutItemHSizing = this.sizing(node, 'width');
          p.layoutItemVSizing = this.sizing(node, 'height');
        }
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
        await this.#emit(c, node);
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

  // Penpot's SVG renderer has no per-side stroke widths: draw each side as a
  // thin rectangle pinned to that edge.
  perSideStrokes(node, geo) {
    if (!['frame', 'rectangle'].includes(node.type)) return [];
    const list = Array.isArray(node.stroke) ? node.stroke : node.stroke ? [node.stroke] : [];
    if (!list.length) return [];
    const w = strokeWidthsOf(this.pen, node);
    if (w.every((x) => x === w[0])) return [];
    this.bump('perSideStrokes');
    const first = list[0];
    const paint = this.colorFill(typeof first === 'string' ? first : first.color);
    const align = node.strokeAlignment ?? 'inner';
    const k = align === 'inner' ? 0 : align === 'center' ? 0.5 : 1;
    const [t, r, b, l] = w;
    const flex = node.type === 'frame' && layoutOf(node) !== 'none';
    const base = (name, x, y, width, height, ch, cv) => ({
      id: randomUUID(),
      name,
      x: round(x),
      y: round(y),
      width: round(width),
      height: round(height),
      fills: [paint],
      constraintsH: ch,
      constraintsV: cv,
      ...(flex ? { layoutItemAbsolute: true, layoutItemZIndex: 100000 } : {}),
    });
    const out = [];
    const X = geo.x;
    const Y = geo.y;
    const W = geo.w;
    const H = geo.h;
    if (t) out.push(base('stroke top', X - k * l, Y - k * t, W + k * (l + r), t, 'leftright', 'top'));
    if (b) out.push(base('stroke bottom', X - k * l, Y + H - b + k * b, W + k * (l + r), b, 'leftright', 'bottom'));
    if (l) out.push(base('stroke left', X - k * l, Y - k * t, l, H + k * (t + b), 'left', 'topbottom'));
    if (r) out.push(base('stroke right', X + W - r + k * r, Y - k * t, r, H + k * (t + b), 'right', 'topbottom'));
    return out;
  }

  addPage(name) {
    this.ctx.addPage({ name });
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

function isInsideMain(node) {
  return node._inMain === true;
}

function textOf(content) {
  return content.children[0].children.map((p) => p.children.map((c) => c.text).join('')).join('\n');
}

function stylesOf(content) {
  const p = content.children[0].children[0];
  return [p.fontId, p.fontSize, p.fontWeight, p.lineHeight, p.letterSpacing, p.textAlign];
}
