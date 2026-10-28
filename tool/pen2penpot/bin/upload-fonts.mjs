#!/usr/bin/env node
// Uploads the fonts the reference render uses to the Penpot team as custom
// fonts and writes their ids to out/fonts.json for convert.mjs.
//
// Inter and JetBrains Mono come from the Segno app's assets. SF Mono comes from
// macOS; it is uploaded only to this local instance (see README, licensing).

import { readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { rpc, uploadSession } from '../src/rpc.mjs';

const FONTS = '/Users/Tomas/Documents/Work/opensource/segno/assets/fonts';
const families = {
  Inter: [
    [400, join(FONTS, 'Inter-Regular.ttf')],
    [500, join(FONTS, 'Inter-Medium.ttf')],
    [600, join(FONTS, 'Inter-SemiBold.ttf')],
    [700, join(FONTS, 'Inter-Bold.ttf')],
  ],
  'JetBrains Mono': [
    [400, join(FONTS, 'JetBrainsMono-Regular.ttf')],
    [500, join(FONTS, 'JetBrainsMono-Medium.ttf')],
    [600, join(FONTS, 'JetBrainsMono-SemiBold.ttf')],
  ],
  'SF Mono': [[400, '/System/Library/Fonts/SFNSMono.ttf']],
};

const out = join(homedir(), 'development/penpot-trial/out/fonts.json');
const profile = await rpc('get-profile');
const teamId = profile.defaultTeamId;
const existing = await rpc('get-font-variants', { teamId });
const result = {};
for (const [family, variants] of Object.entries(families)) {
  const have = existing.filter((v) => v.fontFamily === family);
  const fontId = have[0]?.fontId ?? randomUUID();
  const weights = new Set(have.map((v) => Number(v.fontWeight)));
  for (const [weight, file] of variants) {
    if (weights.has(weight)) continue;
    const sessionId = await uploadSession(readFileSync(file), file.split('/').pop(), 'font/ttf');
    await rpc('create-font-variant', {
      teamId,
      fontId,
      fontFamily: family,
      fontWeight: weight,
      fontStyle: 'normal',
      uploads: { 'font/ttf': sessionId },
    });
    weights.add(weight);
    console.log(`uploaded ${family} ${weight}`);
  }
  result[family] = { fontId, weights: [...weights].sort() };
}
writeFileSync(out, JSON.stringify(result, null, 2));
console.log(`wrote ${out}`);
