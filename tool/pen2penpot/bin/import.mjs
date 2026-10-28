#!/usr/bin/env node
// Imports a .penpot file into the token owner's default project through the
// import-binfile RPC method and records the new file id.
//
//   node bin/import.mjs [file.penpot] [--name NAME] [--record out-name.json]

import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, basename } from 'node:path';
import { parseArgs } from 'node:util';
import { rpc, rpcMultipart } from '../src/rpc.mjs';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { name: { type: 'string' }, record: { type: 'string' } },
});
const out = join(homedir(), 'development/penpot-trial/out');
const file = positionals[0] ?? join(out, 'segno-trial.penpot');
const name = values.name ?? `segno-ui trial ${new Date().toISOString().slice(0, 16)}`;

const profile = await rpc('get-profile');
const projectId = profile.defaultProjectId;
const t0 = Date.now();
const res = await rpcMultipart(
  'import-binfile',
  {
    name,
    projectId,
    file: { blob: new Blob([readFileSync(file)], { type: 'application/zip' }), filename: basename(file) },
  },
  { accept: 'text/event-stream' },
);
const body = await res.text();
const ms = Date.now() - t0;
if (!res.ok) {
  console.error(`import-binfile ${res.status}: ${body.slice(0, 2000)}`);
  process.exit(1);
}
// The response is a server-sent event stream; the last event carries the ids.
const events = body
  .split('\n\n')
  .map((chunk) => {
    const ev = chunk.match(/^event: (.*)$/m)?.[1];
    const data = chunk.match(/^data: (.*)$/m)?.[1];
    return ev ? { ev, data } : null;
  })
  .filter(Boolean);
const end = events.find((e) => e.ev === 'end');
const error = events.find((e) => e.ev === 'error');
if (error || !end) {
  console.error(body.slice(0, 3000));
  process.exit(1);
}
const result = JSON.parse(end.data);
// Event data is transit-encoded: uuids arrive as "~u<uuid>".
const fileIds = (Array.isArray(result) ? result : [result]).map((v) => String(v).replace(/^~u/, ''));
const record = {
  name,
  projectId,
  teamId: profile.defaultTeamId,
  fileIds,
  importMs: ms,
  fileBytes: statSync(file).size,
  source: file,
};
writeFileSync(join(out, values.record ?? `import-${basename(file, '.penpot')}.json`), JSON.stringify(record, null, 2));
console.log(JSON.stringify(record, null, 2));
