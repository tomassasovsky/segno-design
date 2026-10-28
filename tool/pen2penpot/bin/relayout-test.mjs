#!/usr/bin/env node
// Checks that the imported flex layout is live: in the Penpot workspace,
// widens each screen's root and first-level boards by one pixel and back,
// which makes Penpot's own layout engine recompute their subtrees. Run
// verify.mjs on the same import afterwards to compare the result with the
// reference.
//
//   node bin/relayout-test.mjs out/import-relayout-test.json
//
// It edits the file it is given; import a separate copy for it.

import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import puppeteer from 'puppeteer-core';
import { CHROME } from '../src/layout.mjs';
import { rpc, BASE } from '../src/rpc.mjs';

const ROOT = '00000000-0000-0000-0000-000000000000';
const record = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const fileId = record.fileIds[0];
const token = readFileSync(join(homedir(), 'development/penpot-trial/.penpot-token'), 'utf8').trim();
const file = await rpc('get-file', { id: fileId });

const targets = [];
for (const pageId of file.data.pages) {
  const objs = file.data.pagesIndex[pageId].objects;
  for (const o of Object.values(objs)) {
    if (o.type !== 'frame' || o.parentId !== ROOT || !o.name.includes(' / ')) continue;
    if (o.layout === 'flex') targets.push({ pageId, id: o.id, w: o.width, name: o.name });
    for (const cid of o.shapes ?? []) {
      const c = objs[cid];
      if (c.type === 'frame' && !c.hidden && c.shapes?.length) targets.push({ pageId, id: c.id, w: c.width, name: `${o.name} > ${c.name}` });
    }
  }
}

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
let page;

// The width field is the first numeric field of the measures menu.
async function setWidth(current, value) {
  const handle = await page.evaluateHandle(
    (cur) =>
      [...document.querySelectorAll('input')].find(
        (e) => /input_field__input/.test(e.className) && Math.abs(parseFloat(e.value) - cur) < 0.05,
      ),
    current,
  );
  const input = handle.asElement();
  if (!input) return false;
  await input.click({ clickCount: 3 });
  await page.keyboard.type(String(value));
  await page.keyboard.press('Enter');
  await new Promise((r) => setTimeout(r, 1200));
  return true;
}

for (const t of targets) {
  // A fresh page per board: the workspace only reads board-id on load.
  await page?.close();
  page = await browser.newPage();
  await page.setExtraHTTPHeaders({ Authorization: `Token ${token}` });
  await page.setViewport({ width: 1920, height: 1200 });
  const q = new URLSearchParams({ 'team-id': record.teamId, 'file-id': fileId, 'page-id': t.pageId, 'board-id': t.id });
  await page.goto(`${BASE}/#/workspace?${q}`, { waitUntil: 'networkidle0', timeout: 120000 });
  await new Promise((r) => setTimeout(r, 4000));
  const w = Math.round(t.w * 100) / 100;
  if (!(await setWidth(w, w + 1)) || !(await setWidth(w + 1, w))) {
    console.log(`skipped ${t.name}: width field not found`);
    continue;
  }
  await new Promise((r) => setTimeout(r, 2500));
  console.log(`relaid ${t.name}`);
}
await browser.close();
