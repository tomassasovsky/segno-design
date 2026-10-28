const MARK = JSON.stringify([['#FF00AA', 1]]).toLowerCase();
const edited = new Set(storage.fillEdited);
const sig = (s) => JSON.stringify((s.fills ?? []).map((f) => [f.fillColor, f.fillOpacity])).toLowerCase();
const want = new Set(storage.fillSnap.map((x) => x.id));
const byId = new Map();
for (const p of penpotUtils.getPages()) {
  for (const s of penpotUtils.findShapes((x) => want.has(x.id), penpotUtils.getPageById(p.id).root)) byId.set(s.id, s);
}
const r = {};
for (const x of storage.fillSnap) {
  const s = byId.get(x.id);
  if (!s) continue;
  // Only shapes whose main counterpart (directly or through a nested main) was edited.
  let ref = s.componentRefShape?.();
  let hit = false;
  for (let i = 0; ref && i < 4; i++) { if (edited.has(ref.id)) { hit = true; break; } ref = ref.componentRefShape?.(); }
  if (!hit) continue;
  const now = sig(s);
  const k = (r[x.comp] ??= { kept: 0, lost: 0, followed: 0, notFollowed: 0 });
  if (x.fills !== x.mainFills) { if (now === x.fills.toLowerCase()) k.kept++; else k.lost++; }
  else { if (now === MARK) k.followed++; else k.notFollowed++; }
}
return r;
