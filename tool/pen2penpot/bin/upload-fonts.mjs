#!/usr/bin/env node
// Uploads the fonts the converter uses (src/fonts.mjs) to the Penpot team as
// custom fonts and writes their ids to out/fonts.json (or --out) for
// convert.mjs. PENPOT_URL and PENPOT_TOKEN_FILE select another instance.

import { readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { randomUUID } from 'node:crypto';
import { rpc, uploadSession } from '../src/rpc.mjs';
import { FONT_FILES } from '../src/fonts.mjs';

const MTYPE = { ttf: 'font/ttf', otf: 'font/otf', woff: 'font/woff' };
const { values } = parseArgs({ options: { out: { type: 'string', default: join(homedir(), 'development/penpot-trial/out/fonts.json') } } });
const out = values.out;
const profile = await rpc('get-profile');
const teamId = profile.defaultTeamId;
const existing = await rpc('get-font-variants', { teamId });
const result = {};
for (const [family, variants] of Object.entries(FONT_FILES)) {
  const have = existing.filter((v) => v.fontFamily === family);
  const fontId = have[0]?.fontId ?? randomUUID();
  const weights = new Set(have.map((v) => Number(v.fontWeight)));
  for (const [weight, file] of variants) {
    if (weights.has(weight)) continue;
    const mtype = MTYPE[file.split('.').pop()];
    const sessionId = await uploadSession(readFileSync(file), file.split('/').pop(), mtype);
    await rpc('create-font-variant', {
      teamId,
      fontId,
      fontFamily: family,
      fontWeight: weight,
      fontStyle: 'normal',
      uploads: { [mtype]: sessionId },
    });
    weights.add(weight);
    console.log(`uploaded ${family} ${weight}`);
  }
  result[family] = { fontId, weights: [...weights].sort((a, b) => a - b) };
}
writeFileSync(out, JSON.stringify(result, null, 2));
console.log(`wrote ${out}`);
