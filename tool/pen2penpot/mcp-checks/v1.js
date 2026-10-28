const names = ['Row', 'FxParamTile', 'FxParamEnumCell'];
const edited = new Set();
for (const name of names) {
  const main = penpotUtils.findShapes((x) => x.id === storage.plan[name].mainId, penpot.currentPage.root)[0];
  for (const s of penpotUtils.findShapes(() => true, main)) { s.hidden = !s.hidden; edited.add(s.id); }
}
storage.visEdited = [...edited];
return edited.size;
