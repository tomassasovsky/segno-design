#!/usr/bin/env node
// Renders every converted area board from the imported Penpot file and
// compares it pixel by pixel with the HTML reference render of the same pen
// area, scoring each screen card (label, screen, notes) separately.
//
//   node bin/verify.mjs [import-record.json] [--report report.json] [--tag name]
//
// Boards are rendered by Penpot's own render page (render.html, route
// "objects"), the page the exporter screenshots. The access token goes in an
// Authorization header, because the exporter service only accepts a browser
// session cookie. Writes out/penpot/<area>.png, out/diff/<card>.png,
// out/compare/<card>.png (reference | Penpot | diff) and out/verify.json.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import puppeteer from 'puppeteer-core';
import { CHROME } from '../src/layout.mjs';
import { rpc, BASE, authHeaders } from '../src/rpc.mjs';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    out: { type: 'string', default: join(homedir(), 'development/penpot-trial/out') },
    report: { type: 'string' },
    tag: { type: 'string', default: '' },
  },
});
const out = values.out;
const record = JSON.parse(readFileSync(positionals[0] ?? join(out, 'import-segno-trial.json'), 'utf8'));
const report = JSON.parse(readFileSync(values.report ?? join(out, 'report.json'), 'utf8'));
const sfx = values.tag ? `-${values.tag}` : '';
for (const d of ['penpot', 'diff', 'compare']) mkdirSync(join(out, d + sfx), { recursive: true });

const fileId = record.fileIds[0];
const file = await rpc('get-file', { id: fileId });
const pageOfShape = new Map();
for (const pageId of file.data.pages) {
  for (const id of Object.keys(file.data.pagesIndex[pageId].objects)) pageOfShape.set(id, pageId);
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--font-render-hinting=none', '--disable-lcd-text', '--hide-scrollbars'],
});

const TILE = 2000;

// Renders one board with Penpot's render page and returns it cropped to the
// board (the render also covers shadows and unclipped overflow).
async function renderBoard(id, pageId, bw, bh) {
  const page = await browser.newPage();
  await page.setExtraHTTPHeaders(authHeaders());
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
  const q = new URLSearchParams({ 'file-id': fileId, 'page-id': pageId, 'object-id': id, route: 'objects' });
  await page.goto(`${BASE}/render.html?${q}`, { waitUntil: 'networkidle0', timeout: 300000 });
  const node = await page.waitForSelector(`#screenshot-${id}`, { timeout: 120000 });
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => {
    document.body.style.background = 'transparent';
  });
  await new Promise((r) => setTimeout(r, 1000));
  const vb = (await node.evaluate((e) => e.getAttribute('viewBox'))).split(/\s+/).map(Number);
  const box = await node.boundingBox();
  // The board's top-left inside the rendered SVG, in CSS pixels.
  const sx = (-vb[0] * box.width) / vb[2];
  const sy = (-vb[1] * box.height) / vb[3];
  await page.setViewport({ width: TILE, height: TILE, deviceScaleFactor: 1 });
  const img = new PNG({ width: bw, height: bh });
  // Chrome drops raster tiles of very large captures, so move the SVG under
  // a fixed viewport one tile at a time and capture only what is visible.
  for (let y = 0; y < bh; y += TILE) {
    for (let x = 0; x < bw; x += TILE) {
      const w = Math.min(TILE, bw - x);
      const h = Math.min(TILE, bh - y);
      await node.evaluate((e, l, t) => {
        e.style.position = 'fixed';
        e.style.left = `${l}px`;
        e.style.top = `${t}px`;
      }, -(sx + x), -(sy + y));
      await new Promise((r) => setTimeout(r, 300));
      const buf = await page.screenshot({ clip: { x: 0, y: 0, width: w, height: h }, omitBackground: true, captureBeyondViewport: false });
      PNG.bitblt(PNG.sync.read(Buffer.from(buf)), img, 0, 0, w, h, x, y);
    }
  }
  await page.close();
  return img;
}

function crop(img, x, y, w, h) {
  const c = new PNG({ width: w, height: h });
  PNG.bitblt(img, c, x, y, w, h, 0, 0);
  return c;
}

// Share of differing pixels (pixelmatch, threshold 0.1) and mean absolute
// channel difference (0..255) of two equally sized images.
function score(a, b, w, h, name) {
  const diff = new PNG({ width: w, height: h });
  const n = pixelmatch(a.data, b.data, diff.data, w, h, { threshold: 0.1 });
  let sum = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    for (let c = 0; c < 3; c++) sum += Math.abs(a.data[i + c] - b.data[i + c]);
  }
  if (name) {
    writeFileSync(join(out, `diff${sfx}`, `${name}.png`), PNG.sync.write(diff));
    const sbs = new PNG({ width: w * 3 + 40, height: h, colorType: 6 });
    sbs.data.fill(255);
    PNG.bitblt(a, sbs, 0, 0, w, h, 0, 0);
    PNG.bitblt(b, sbs, 0, 0, w, h, w + 20, 0);
    PNG.bitblt(diff, sbs, 0, 0, w, h, 2 * w + 40, 0);
    writeFileSync(join(out, `compare${sfx}`, `${name}.png`), PNG.sync.write(sbs));
  }
  return { diffPct: +((100 * n) / (w * h)).toFixed(3), meanAbsDiff: +(sum / (w * h * 3)).toFixed(3) };
}

const results = [];
for (const s of report.screens) {
  const pageId = pageOfShape.get(s.penpot);
  const refPath = join(out, 'render', `${s.id}.png`);
  if (!pageId || !existsSync(refPath)) {
    console.log(`skip ${s.name}: ${pageId ? 'no reference render' : 'board not in the file'}`);
    continue;
  }
  const ref = PNG.sync.read(readFileSync(refPath));
  const t0 = Date.now();
  const pp = await renderBoard(s.penpot, pageId, ref.width, ref.height);
  writeFileSync(join(out, `penpot${sfx}`, `${s.id}.png`), PNG.sync.write(pp));
  const renderMs = Date.now() - t0;
  const area = { pen: s.id, name: s.name, section: s.section, ...score(ref, pp, ref.width, ref.height), renderMs, cards: [] };
  for (const c of s.cards) {
    const x = Math.max(0, Math.round(c.rect.x));
    const y = Math.max(0, Math.round(c.rect.y));
    const w = Math.min(Math.round(c.rect.w), ref.width - x);
    const h = Math.min(Math.round(c.rect.h), ref.height - y);
    if (w <= 0 || h <= 0) continue;
    const r = { pen: c.id, name: c.name, ...score(crop(ref, x, y, w, h), crop(pp, x, y, w, h), w, h, c.id) };
    area.cards.push(r);
    console.log(`  ${c.name}: ${r.diffPct}% pixels differ, MAE ${r.meanAbsDiff}`);
  }
  results.push(area);
  console.log(`${s.section} / ${s.name}: ${area.diffPct}% pixels differ, MAE ${area.meanAbsDiff}, ${renderMs} ms`);
}
await browser.close();
writeFileSync(join(out, `verify${sfx}.json`), JSON.stringify(results, null, 2));
