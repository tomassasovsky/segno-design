#!/usr/bin/env node
// Converts pen screens into a .penpot file.
//
//   node bin/convert.mjs [--all] [--screens id,id] [--out DIR]
//
// Writes DIR/segno-trial.penpot, DIR/render/<id>.png (the HTML reference
// renders), DIR/render/<id>.html and DIR/report.json.

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

// About ten screens covering components with overrides, images, gradients,
// shadows, icons, deep nesting, absolute children and c/ notes.
export const DEFAULT_SCREENS = [
  'Ob2Mu', // STAGE / stage: absolute children, shadows, per-side strokes
  'S1YHE3', // STAGE / readout-volumes: icons
  'Z6r4bH', // SIGNAL / fx-plugin: 18 instances, 65 overrides
  'M3PQQ', // SIGNAL / fx-param-sheet: instances, absolute children
  'd4lBhS', // SIGNAL / fx-browse: 346 nodes, depth 8
  'IATbd', // LOOP / loop-tempo: components defined inside a screen, icon
  'pyeEu', // SESSION & CAPTURE / library-recovered: depth 10, instances
  'iWOZJ', // CONTROL / pedal: instance with overrides
  'XJoip', // DS / masters: every component, replacements
  'BdRcY', // Native implementation / Measured pedal artwork: gradients
  'sJfGy', // Native implementation / Shared Mixer controls: image fills
];

const { values } = parseArgs({
  options: {
    all: { type: 'boolean', default: false },
    screens: { type: 'string' },
    out: { type: 'string', default: join(homedir(), 'development/penpot-trial/out') },
    pen: { type: 'string', default: join(DESIGN, 'segno-ui.pen') },
    fonts: { type: 'string' },
    'no-render': { type: 'boolean', default: false },
  },
});

const out = resolve(values.out);
const renderDir = join(out, 'render');
mkdirSync(renderDir, { recursive: true });

const t0 = Date.now();
const pen = loadPen(values.pen);
const imageRoots = [DESIGN, '/Users/Tomas/development/segno-split/segno-main'];
const uploadedFontsFile = values.fonts ?? join(out, 'fonts.json');
const uploaded = existsSync(uploadedFontsFile) ? JSON.parse(readFileSync(uploadedFontsFile, 'utf8')) : null;

const frames = pen.topLevel.filter((n) => n.type === 'frame');
let ids = values.all ? frames.map((f) => f.id) : (values.screens?.split(',') ?? DEFAULT_SCREENS);

// Expand, then pull in the top-level frames that hold the mains of every
// component an instance points at.
const trees = new Map();
const queue = [...ids];
while (queue.length) {
  const id = queue.shift();
  if (trees.has(id)) continue;
  const top = pen.byId.get(id);
  const tree = pen.expand(top);
  trees.set(id, tree);
  for (const [n] of walk(tree)) {
    if (n._inst) {
      const home = pen.topOf.get(n._comp);
      if (home && !trees.has(home.id) && !queue.includes(home.id)) queue.push(home.id);
    }
  }
}
ids = [...trees.keys()];
const tExpand = Date.now();

// Notes (`t/`, `g/`, `c/`, ...) are top-level texts placed under or over a screen.
const texts = pen.topLevel.filter((n) => n.type === 'text');
function notesFor(top) {
  const w = typeof top.width === 'number' ? top.width : 1920;
  const h = typeof top.height === 'number' ? top.height : 1080;
  return texts.filter(
    (t) =>
      t.x >= top.x &&
      t.x < top.x + w &&
      ((t.y >= top.y - 100 && t.y < top.y) ||
        // Area headings (H/, S/) sit above a row, never below a screen.
        (t.y >= top.y + h && t.y < top.y + h + 340 && !/^[HS]\//.test(t.name ?? ''))),
  );
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
  report.screens.push({
    id,
    name: top.name,
    nodes: hb.nodes.length,
    notes: notes.length,
    renderMs: Date.now() - ts,
    size: m.rects['0'],
    missingImages: [...hb.missingImages],
    failedFonts,
  });
  console.log(`rendered ${id} ${top.name}: ${hb.nodes.length} nodes, ${notes.length} notes, ${Date.now() - ts} ms`);
}
await browser.close();
const tRender = Date.now();

// Penpot file: one page per area, screens at their pen canvas positions.
console.log(`render done at ${Date.now() - t0} ms`);
const writer = new PenpotWriter(pen, { fonts: fontTable(uploaded), imageRoots, report });
writer.begin('segno-ui (pen trial)');
writer.prepare([...results.values()].flatMap((r) => [r.tree, ...r.notes]));
for (const r of results.values()) {
  await writer.computeMainParams(r.tree, r.measure, { x: r.top.x, y: r.top.y });
}
const areaOf = (top) => (top.name.includes(' / ') ? top.name.split(' / ')[0] : top.name);
const pages = new Map();
for (const id of ids) {
  const a = areaOf(results.get(id).top);
  if (!pages.has(a)) pages.set(a, []);
  pages.get(a).push(id);
}
const pageOf = new Map();
for (const [area, list] of pages) {
  writer.addPage(area);
  const pageId = writer.ctx.currentPageId;
  for (const id of list) {
    const r = results.get(id);
    for (const [n] of walk(r.tree)) if (n._isMain) pageOf.set(n.id, pageId);
    // Notes are measured in the screen's document, so they share its origin.
    await writer.emitScreen(r.tree, r.measure, r.notes, { x: r.top.x, y: r.top.y });
  }
  writer.closePage();
  console.log(`wrote page ${area} at ${Date.now() - tRender} ms`);
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
