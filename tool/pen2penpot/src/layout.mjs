// Renders a screen document in headless Chrome and reads back the absolute
// geometry of every node, the line boxes of every text, and a PNG of the
// screen (the reference the Penpot export is compared against).

import puppeteer from 'puppeteer-core';
import { writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';

export const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
export const PAD = 400;
const TILE = 2000;

export async function launch() {
  return puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--allow-file-access-from-files', '--font-render-hinting=none', '--disable-lcd-text', '--hide-scrollbars'],
  });
}

// Runs in the page. fit_content frames with absolute layout take the size of
// their children's bounds; resolved deepest first.
function pageFitAbsolute(fitList) {
  const els = fitList
    .map(([n, dims]) => [document.querySelector(`[data-n="${n}"]`), dims])
    .sort((a, b) => depth(b[0]) - depth(a[0]));
  function depth(el) {
    let d = 0;
    for (let e = el; e; e = e.parentElement) d++;
    return d;
  }
  for (const [el, dims] of els) {
    let w = 0;
    let h = 0;
    for (const c of el.children) {
      if (!c.dataset.n) continue;
      w = Math.max(w, c.offsetLeft + c.offsetWidth);
      h = Math.max(h, c.offsetTop + c.offsetHeight);
    }
    if (dims.includes('width')) el.style.width = `${w}px`;
    if (dims.includes('height')) el.style.height = `${h}px`;
  }
}

// Runs in the page: rects of every node, line boxes of every text.
function pageMeasure(textIds) {
  const world = document.getElementById('world').getBoundingClientRect();
  const out = {};
  for (const el of document.querySelectorAll('[data-n]')) {
    if (!el.getClientRects().length) continue;
    const r = el.getBoundingClientRect();
    // offsetLeft/Top are untransformed positions in the parent (rotation).
    out[el.dataset.n] = { x: r.left - world.left, y: r.top - world.top, w: r.width, h: r.height, ox: el.offsetLeft, oy: el.offsetTop, ow: el.offsetWidth, oh: el.offsetHeight };
  }
  const texts = {};
  for (const n of textIds) {
    const el = document.querySelector(`[data-n="${n}"]`);
    const cs = getComputedStyle(el);
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const lines = [];
    let node;
    while ((node = walker.nextNode())) {
      const text = node.data;
      const range = document.createRange();
      let start = 0;
      let lineTop = null;
      const flush = (end) => {
        if (end <= start) return;
        range.setStart(node, start);
        range.setEnd(node, end);
        const rects = [...range.getClientRects()].filter((q) => q.width > 0 || q.height > 0);
        if (!rects.length) return;
        const left = Math.min(...rects.map((q) => q.left));
        const right = Math.max(...rects.map((q) => q.right));
        const top = Math.min(...rects.map((q) => q.top));
        const bottom = Math.max(...rects.map((q) => q.bottom));
        let s = text.slice(start, end);
        if (s.endsWith('\n')) s = s.slice(0, -1);
        lines.push({
          x: left - world.left,
          y: top - world.top,
          w: right - left,
          h: bottom - top,
          text: s,
        });
      };
      for (let i = 0; i < text.length; i++) {
        if (text[i] === '\n') {
          flush(i + 1);
          start = i + 1;
          lineTop = null;
          continue;
        }
        range.setStart(node, i);
        range.setEnd(node, i + 1);
        const rr = range.getClientRects();
        if (!rr.length) continue;
        const top = rr[rr.length - 1].top;
        if (lineTop !== null && Math.abs(top - lineTop) > 1) {
          flush(i);
          start = i;
        }
        lineTop = top;
      }
      flush(text.length);
    }
    texts[n] = {
      lines,
      lineHeightPx: parseFloat(cs.lineHeight) || null,
      fontSize: parseFloat(cs.fontSize),
    };
  }
  return { rects: out, texts };
}

export async function renderScreen(browser, html, htmlPath, { textIds, fitAbs, screenSize, pngPath }) {
  writeFileSync(htmlPath, html);
  const page = await browser.newPage();
  const vw = Math.ceil(screenSize.w + PAD * 2);
  const vh = Math.ceil(screenSize.h + PAD * 2);
  await page.setViewport({ width: Math.min(vw, 16000), height: Math.min(vh, 16000), deviceScaleFactor: 1 });
  await page.goto(`file://${htmlPath}`, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  if (fitAbs.length) await page.evaluate(pageFitAbsolute, fitAbs);
  const fontsOk = await page.evaluate(() => [...document.fonts].map((f) => `${f.family} ${f.weight} ${f.status}`));
  const result = await page.evaluate(pageMeasure, textIds);
  if (pngPath) {
    // Chrome drops raster tiles of very large captures, even in clipped
    // screenshots. Shift the page under a tile-sized viewport instead and
    // capture only what is on screen.
    const root = result.rects['0'];
    const W = Math.round(root.w);
    const H = Math.round(root.h);
    const img = new PNG({ width: W, height: H });
    await page.setViewport({ width: TILE, height: TILE, deviceScaleFactor: 1 });
    for (let y = 0; y < H; y += TILE) {
      for (let x = 0; x < W; x += TILE) {
        const w = Math.min(TILE, W - x);
        const h = Math.min(TILE, H - y);
        await page.evaluate((dx, dy) => {
          document.body.style.transform = `translate(${-dx}px,${-dy}px)`;
        }, PAD + root.x + x, PAD + root.y + y);
        const buf = await page.screenshot({ clip: { x: 0, y: 0, width: w, height: h }, omitBackground: true, captureBeyondViewport: false });
        PNG.bitblt(PNG.sync.read(Buffer.from(buf)), img, 0, 0, w, h, x, y);
      }
    }
    writeFileSync(pngPath, PNG.sync.write(img));
  }
  await page.close();
  result.fonts = fontsOk;
  return result;
}
