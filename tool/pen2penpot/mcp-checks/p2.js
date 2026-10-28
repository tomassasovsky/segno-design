// Edit the mains on the active page: append a marker to each text, bump the root radius.
const done = {};
for (const [name, v] of Object.entries(storage.plan)) {
  if (storage.edited?.[name]) continue;
  const main = penpotUtils.findShapes((x) => x.id === v.mainId, penpot.currentPage.root)[0];
  if (!main) continue;
  const ts = main.type === 'text' ? [main] : penpotUtils.findShapes((x) => x.type === 'text', main);
  for (const t of ts) t.characters = `${t.characters} M`;
  const r = typeof main.borderRadius === 'number' ? main.borderRadius : 0;
  if (main.type !== 'text') main.borderRadius = r + 3;
  (storage.edited ??= {})[name] = true;
  done[name] = { texts: ts.length, radius: main.type !== 'text' ? r + 3 : null };
}
return { page: penpot.currentPage.name, done };
