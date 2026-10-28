#!/usr/bin/env node
// Renders every converted board from the imported Penpot file and compares it
// pixel by pixel with the HTML reference render of the same pen screen.
//
//   node bin/verify.mjs [import-record.json] [--report report.json] [--tag name]
//
// Boards are rendered by Penpot's own render page (render.html, route
// "objects"), the page the exporter screenshots. The access token goes in an
// Authorization header, because the exporter service only accepts a browser
// session cookie. Writes out/penpot/<id>.png, out/diff/<id>.png,
// out/compare/<id>.png and out/verify.json.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import puppeteer from 'puppeteer-core';
import { CHROME } from '../src/layout.mjs';
import { rpc, BASE } from '../src/rpc.mjs';

const out = join(homedir(), 'development/penpot-trial/out');
const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    report: { type: 'string', default: join(out, 'report.json') },
    tag: { type: 'string', default: '' },
  },
});
const record = JSON.parse(readFileSync(positionals[0] ?? join(out, 'import-segno-trial.json'), 'utf8'));
const report = JSON.parse(readFileSync(values.report, 'utf8'));
const byName = new Map(report.screens.map((s) => [s.name, s]));
const sfx = values.tag ? `-${values.tag}` : '';
for (const d of ['penpot', 'diff', 'compare']) mkdirSync(join(out, d + sfx), { recursive: true });

const fileId = record.fileIds[0];
const file = await rpc('get-file', { id: fileId });
const ROOT = '00000000-0000-0000-0000-000000000000';
const targets = [];
for (const pageId of file.data.pages) {
  const page = file.data.pagesIndex[pageId];
  for (const obj of Object.values(page.objects)) {
    if (obj.type === 'frame' && obj.parentId === ROOT && byName.has(obj.name)) {
      targets.push({ pageId, id: obj.id, name: obj.name, pen: byName.get(obj.name).id, width: obj.width, height: obj.height });
    }
  }
}

const token = readFileSync(join(homedir(), 'development/penpot-trial/.penpot-token'), 'utf8').trim();
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--font-render-hinting=none', '--disable-lcd-text', '--hide-scrollbars'],
});

const results = [];
for (const t of targets) {
  const page = await browser.newPage();
  await page.setExtraHTTPHeaders({ Authorization: `Token ${token}` });
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
  const q = new URLSearchParams({ 'file-id': fileId, 'page-id': t.pageId, 'object-id': t.id, route: 'objects' });
  const t0 = Date.now();
  await page.goto(`${BASE}/render.html?${q}`, { waitUntil: 'networkidle0', timeout: 120000 });
  await new Promise((r) => setTimeout(r, 1000));
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => {
    document.body.style.background = 'transparent';
  });
  const node = await page.waitForSelector(`#screenshot-${t.id}`, { timeout: 60000 });
  // The render covers the board plus anything that overflows it (shadows,
  // unclipped children); the viewBox says where the board sits in it.
  const vb = (await node.evaluate((e) => e.getAttribute('viewBox'))).split(/\s+/).map(Number);
  const shot = join(out, `penpot${sfx}`, `${t.pen}.png`);
  const full = PNG.sync.read(Buffer.from(await node.screenshot({ omitBackground: true })));
  const bw = Math.round(t.width);
  const bh = Math.round(t.height);
  const board = new PNG({ width: bw, height: bh });
  PNG.bitblt(full, board, Math.round(-vb[0]), Math.round(-vb[1]), Math.min(bw, full.width - Math.round(-vb[0])), Math.min(bh, full.height - Math.round(-vb[1])), 0, 0);
  writeFileSync(shot, PNG.sync.write(board));
  await page.close();
  const renderMs = Date.now() - t0;

  const refPath = join(out, 'render', `${t.pen}.png`);
  if (!existsSync(refPath)) continue;
  const a = PNG.sync.read(readFileSync(refPath));
  const b = PNG.sync.read(readFileSync(shot));
  const w = Math.min(a.width, b.width);
  const h = Math.min(a.height, b.height);
  const crop = (img) => {
    const c = new PNG({ width: w, height: h });
    PNG.bitblt(img, c, 0, 0, w, h, 0, 0);
    return c;
  };
  const ca = crop(a);
  const cb = crop(b);
  const diff = new PNG({ width: w, height: h });
  const n = pixelmatch(ca.data, cb.data, diff.data, w, h, { threshold: 0.1 });
  // Mean absolute channel difference over the composited RGB, 0..255.
  let sum = 0;
  for (let i = 0; i < ca.data.length; i += 4) {
    for (let c = 0; c < 3; c++) sum += Math.abs(ca.data[i + c] - cb.data[i + c]);
  }
  const mae = sum / (w * h * 3);
  writeFileSync(join(out, `diff${sfx}`, `${t.pen}.png`), PNG.sync.write(diff));
  // Side by side: reference | Penpot | diff.
  const sbs = new PNG({ width: w * 3 + 40, height: h, colorType: 6 });
  sbs.data.fill(255);
  PNG.bitblt(ca, sbs, 0, 0, w, h, 0, 0);
  PNG.bitblt(cb, sbs, 0, 0, w, h, w + 20, 0);
  PNG.bitblt(diff, sbs, 0, 0, w, h, 2 * w + 40, 0);
  writeFileSync(join(out, `compare${sfx}`, `${t.pen}.png`), PNG.sync.write(sbs));
  const r = {
    pen: t.pen,
    name: t.name,
    size: [a.width, a.height, b.width, b.height],
    diffPixels: n,
    diffPct: +((100 * n) / (w * h)).toFixed(3),
    meanAbsDiff: +mae.toFixed(3),
    renderMs,
  };
  results.push(r);
  console.log(`${r.name}: ${r.diffPct}% pixels differ, MAE ${r.meanAbsDiff}, ${renderMs} ms`);
}
await browser.close();
writeFileSync(join(out, `verify${sfx}.json`), JSON.stringify(results, null, 2));
