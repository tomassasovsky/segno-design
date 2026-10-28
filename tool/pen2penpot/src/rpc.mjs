// Minimal client for Penpot's RPC API, authenticated with an access token.

import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const BASE = process.env.PENPOT_URL ?? 'http://localhost:9001';
const TOKEN_FILE = process.env.PENPOT_TOKEN_FILE ?? join(homedir(), 'development/penpot-trial/.penpot-token');

let token;
// The Authorization header for this instance's access token.
export function authHeaders() {
  token ??= readFileSync(TOKEN_FILE, 'utf8').trim();
  return { Authorization: `Token ${token}` };
}
const auth = authHeaders;

export async function rpc(method, params = {}) {
  const res = await fetch(`${BASE}/api/main/methods/${method}`, {
    method: 'POST',
    headers: { ...auth(), 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(params),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${res.status}: ${text.slice(0, 500)}`);
  return text ? JSON.parse(text) : null;
}

// Multipart call. `fields` values are strings or { blob, filename }.
export async function rpcMultipart(method, fields, { accept = 'application/json' } = {}) {
  const form = new FormData();
  // Multipart field names are not converted from camelCase like JSON keys.
  const kebab = (k) => k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
  for (const [k, v] of Object.entries(fields)) {
    if (typeof v === 'string') form.append(kebab(k), v);
    else form.append(kebab(k), v.blob, v.filename);
  }
  const res = await fetch(`${BASE}/api/main/methods/${method}`, {
    method: 'POST',
    headers: { ...auth(), Accept: accept },
    body: form,
  });
  return res;
}

// Uploads a file through the chunked upload API and returns the session id.
export async function uploadSession(buf, filename, mtype) {
  const { sessionId } = await rpc('create-upload-session', { totalChunks: 1 });
  const res = await rpcMultipart('upload-chunk', {
    sessionId,
    index: '0',
    content: { blob: new Blob([buf], { type: mtype }), filename },
  });
  if (!res.ok) throw new Error(`upload-chunk ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return sessionId;
}

export async function fetchAuthed(url, init = {}) {
  return fetch(url, { ...init, headers: { ...auth(), ...(init.headers ?? {}) } });
}
