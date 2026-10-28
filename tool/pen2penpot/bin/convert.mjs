#!/usr/bin/env node
// Converts pen areas into a .penpot file.
//
//   node bin/convert.mjs [--all] [--units id,id] [--out DIR] [--name NAME]
//
// An area is a frame inside one of the pen's sections (`02  Effects · chains
// & controls` inside `01   CURRENT UX`); `--units` also takes the id of any
// node inside an area. Writes DIR/segno-trial.penpot (segno-all.penpot with
// --all), DIR/render/<area id>.png (the HTML reference renders),
// DIR/render/<area id>.html and DIR/report.json (report-all.json).

import { mkdirSync, writeFileSync, existsSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { loadPen, walk } from '../src/pen.mjs';
import { HtmlBuilder, parseSize } from '../src/html.mjs';
import { launch, renderScreen, PAD } from '../src/layout.mjs';
import { PenpotWriter } from '../src/penpot.mjs';
import { fontTable } from '../src/fonts.mjs';

const DESIGN = '/Users/Tomas/Documents/Work/opensource/segno-design';

// A few areas covering components with overrides, images, gradients,
// shadows, icons, deep nesting, absolute children and notes.
export const DEFAULT_UNITS = [
  'Tp6IP', // EARLIER APPLICATION / 01 Stage: absolute children, shadows, per-side strokes
  'CnUFF', // CURRENT UX / 02 Effects · chains & controls: pedal art, images, path overrides
  'iZJPi', // DESIGN SYSTEM / 01 Foundations & components: every component
  'nwSwt', // SUPERSEDED / 01 Superseded pedal layouts
];

const { values } = parseArgs({
  options: {
    all: { type: 'boolean', default: false },
    units: { type: 'string' },
    out: { type: 'string', default: join(homedir(), 'development/penpot-trial/out') },
    pen: { type: 'string', default: join(DESIGN, 'segno-ui.pen') },
    fonts: { type: 'string' },
    name: { type: 'string', default: 'segno-ui' },
    'no-render': { type: 'boolean', default: false },
  },
});

const out = resolve(values.out);
const renderDir = join(out, 'render');
mkdirSync(renderDir, { recursive: true });

const t0 = Date.now();
const pen = loadPen(values.pen);
const imageRoots = [DESIGN];
const uploadedFontsFile = values.fonts ?? join(out, 'fonts.json');
const uploaded = existsSync(uploadedFontsFile) ? JSON.parse(readFileSync(uploadedFontsFile, 'utf8')) : null;

const unitId = (id) => {
  const u = pen.unitOf.get(id);
  if (!u) throw new Error(`${id} is not inside an area`);
  return u.id;
};
let ids = values.all ? pen.units.map((u) => u.id) : (values.units?.split(',') ?? DEFAULT_UNITS).map(unitId);

// Expand, then pull in the areas that hold the mains of every component an
// instance points at.
const trees = new Map();
const queue = [...new Set(ids)];
while (queue.length) {
  const id = queue.shift();
  if (trees.has(id)) continue;
  const tree = pen.expand(pen.byId.get(id));
  trees.set(id, tree);
  for (const [n] of walk(tree)) {
    if (n._inst) {
      const home = pen.unitOf.get(n._comp);
      if (home && !trees.has(home.id) && !queue.includes(home.id)) queue.push(home.id);
    }
  }
}
// Canvas order: sections in pen order, areas in their section's order.
const order = new Map(pen.units.map((u, i) => [u.id, i]));
ids = [...trees.keys()].sort((a, b) => order.get(a) - order.get(b));
const tExpand = Date.now();

// A section's title and description sit above its first area, so they go
// on that area's page, positioned in section coordinates like the area.
function notesFor(unit) {
  const section = pen.sectionOf.get(unit.id);
  const first = section.children.find((c) => c.type === 'frame');
  return first === unit ? pen.sectionTexts(section) : [];
}

const report = {
  pen: values.pen,
  screens: [],
  counts: {},
  lossy: {},
  timings: {},
};

const results = new Map();
const browser = await launch();
for (const id of ids) {
  const top = pen.byId.get(id);
  const tree = trees.get(id);
  const notes = notesFor(top).map((n) => pen.expand(n));
  const hb = new HtmlBuilder(pen, { imageRoots });
  const html = hb.document(tree, notes, { pad: PAD });
  const textIds = hb.nodes.filter((n) => n.type === 'text').map((n) => n._n);
  const fitAbs = hb.nodes.filter((n) => n._fitAbs).map((n) => [n._n, n._fitAbs]);
  const size = { w: parseSize(top.width).value ?? 2000, h: parseSize(top.height).value ?? 3000 };
  const ts = Date.now();
  const m = await renderScreen(browser, html, join(renderDir, `${id}.html`), {
    textIds,
    fitAbs,
    screenSize: size,
    pngPath: values['no-render'] ? null : join(renderDir, `${id}.png`),
  });
  const failedFonts = m.fonts.filter((f) => !f.endsWith('loaded') && !f.endsWith('unloaded'));
  results.set(id, { tree, notes, measure: m, top });
  const rel = (r) => ({ x: r.x, y: r.y, w: r.w, h: r.h });
  report.screens.push({
    id,
    name: top.name,
    section: pen.sectionOf.get(id).name,
    nodes: hb.nodes.length,
    notes: notes.length,
    renderMs: Date.now() - ts,
    size: m.rects['0'],
    // Screen cards (label, screen, notes): verify.mjs scores each one.
    cards: (tree.children ?? [])
      .filter((c) => c.type === 'frame' && m.rects[c._n])
      .map((c) => ({ id: c.id, name: c.name, rect: rel(m.rects[c._n]), node: c })),
    missingImages: [...hb.missingImages],
    failedFonts,
  });
  console.log(`rendered ${id} ${top.name}: ${hb.nodes.length} nodes, ${notes.length} notes, ${Date.now() - ts} ms`);
}
await browser.close();
const tRender = Date.now();

// Penpot file: one page per area, named after its section and itself, with
// the section's background. Areas keep their position in the section.
console.log(`render done at ${Date.now() - t0} ms`);
const writer = new PenpotWriter(pen, { fonts: fontTable(uploaded), imageRoots, report });
writer.begin(values.name);
writer.prepare([...results.values()].flatMap((r) => [r.tree, ...r.notes]));
for (const r of results.values()) {
  await writer.computeMainParams(r.tree, r.measure, { x: r.top.x, y: r.top.y });
}
const clean = (s) => s.replace(/\s+/g, ' ').trim();
const pageOf = new Map();
for (const id of ids) {
  const r = results.get(id);
  const section = pen.sectionOf.get(id);
  const background = typeof section.fill === 'string' ? pen.resolve(section.fill).slice(0, 7) : undefined;
  writer.addPage(`${clean(section.name)} / ${clean(r.top.name)}`, background);
  const pageId = writer.ctx.currentPageId;
  for (const [n] of walk(r.tree)) if (n._isMain) pageOf.set(n.id, pageId);
  // Notes are measured in the area's document, so they share its origin.
  await writer.emitScreen(r.tree, r.measure, r.notes, { x: r.top.x, y: r.top.y });
  writer.closePage();
  const entry = report.screens.find((e) => e.id === id);
  entry.penpot = r.tree._uuid;
  for (const c of entry.cards) {
    c.penpot = c.node._uuid;
    delete c.node;
  }
  console.log(`wrote page ${clean(section.name)} / ${clean(r.top.name)} at ${Date.now() - tRender} ms`);
}
writer.finishComponents(pageOf);
const bytes = await writer.write();
const file = join(out, values.all ? 'segno-all.penpot' : 'segno-trial.penpot');
writeFileSync(file, bytes);
const tWrite = Date.now();

report.file = file;
report.fileBytes = statSync(file).size;
report.componentCount = writer.components.length;
report.timings = {
  expandMs: tExpand - t0,
  renderMs: tRender - tExpand,
  writeMs: tWrite - tRender,
  totalMs: tWrite - t0,
};
writeFileSync(join(out, values.all ? 'report-all.json' : 'report.json'), JSON.stringify(report, null, 2));
console.log(`wrote ${file} (${(report.fileBytes / 1e6).toFixed(2)} MB) in ${report.timings.totalMs} ms`);
console.log(JSON.stringify({ counts: report.counts, lossy: Object.fromEntries(Object.entries(report.lossy).map(([k, v]) => [k, v.count])) }, null, 1));
