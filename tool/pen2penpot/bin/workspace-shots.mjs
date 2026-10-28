#!/usr/bin/env node
// Screenshots boards inside the Penpot workspace UI (headless Chrome, access
// token in an Authorization header) for a visual check of the editable file.
//
//   node bin/workspace-shots.mjs "STAGE / stage" "SIGNAL / fx-plugin" ...

import { readFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import puppeteer from 'puppeteer-core';
import { CHROME } from '../src/layout.mjs';
import { rpc, BASE } from '../src/rpc.mjs';

const out = join(homedir(), 'development/penpot-trial/out');
mkdirSync(join(out, 'workspace'), { recursive: true });
const record = JSON.parse(readFileSync(join(out, 'import-segno-trial.json'), 'utf8'));
const fileId = record.fileIds[0];
const file = await rpc('get-file', { id: fileId });
const token = readFileSync(join(homedir(), 'development/penpot-trial/.penpot-token'), 'utf8').trim();
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
for (const name of process.argv.slice(2)) {
  let target;
  for (const pageId of file.data.pages) {
    for (const o of Object.values(file.data.pagesIndex[pageId].objects)) {
      if (o.type === 'frame' && (o.name === name || o.id === name)) target = { pageId, id: o.id };
    }
  }
  if (!target) {
    console.error(`no board named ${name}`);
    continue;
  }
  const page = await browser.newPage();
  await page.setExtraHTTPHeaders({ Authorization: `Token ${token}` });
  await page.setViewport({ width: 1920, height: 1200, deviceScaleFactor: 1 });
  const q = new URLSearchParams({ 'team-id': record.teamId, 'file-id': fileId, 'page-id': target.pageId, 'board-id': target.id });
  await page.goto(`${BASE}/#/workspace?${q}`, { waitUntil: 'networkidle0', timeout: 120000 });
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await new Promise((r) => setTimeout(r, 6000));
  if (errors.length) console.log(`console errors: ${errors.slice(0, 5).join(' | ')}`);
  const path = join(out, 'workspace', `${name.replace(/[^\w-]+/g, '_')}.png`);
  await page.screenshot({ path });
  console.log(path);
  await page.close();
}
await browser.close();
