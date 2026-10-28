const edited = new Set(storage.visEdited);
const want = new Set(storage.fillSnap.map((x) => x.id));
const byId = new Map();
for (const p of penpotUtils.getPages()) for (const s of penpotUtils.findShapes((x) => want.has(x.id), penpotUtils.getPageById(p.id).root)) byId.set(s.id, s);
const r = {};
for (const x of storage.fillSnap) {
  if (!['Row', 'FxParamTile', 'FxParamEnumCell'].includes(x.comp)) continue;
  const s = byId.get(x.id); if (!s) continue;
  let ref = s.componentRefShape?.(); let hit = false;
  for (let i = 0; ref && i < 4; i++) { if (edited.has(ref.id)) { hit = true; break; } ref = ref.componentRefShape?.(); }
  if (!hit) continue;
  const k = (r[x.comp] ??= { kept: 0, lost: 0, followed: 0, notFollowed: 0 });
  if (x.hidden !== x.mainHidden) { if (!!s.hidden === x.hidden) k.kept++; else k.lost++; }
  else { if (!!s.hidden === !x.mainHidden) k.followed++; else k.notFollowed++; }
}
return r;
