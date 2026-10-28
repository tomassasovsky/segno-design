// Snapshot fills and visibility of copy shapes paired with their main shapes,
// then change every filled main descendant to a marker colour and flip the
// visibility of hidden ones.
const MARK = '#FF00AA';
const names = ['FxParamTile', 'Row', 'FxParamSwitchCell', 'FxParamEnumCell', 'FxBypassPill'];
const snap = [];
const sig = (s) => JSON.stringify((s.fills ?? []).map((f) => [f.fillColor, f.fillOpacity]));
for (const name of names) {
  const v = storage.plan[name];
  for (const c of v.copies) {
    const head = penpotUtils.findShapeById(c.id);
    if (!head) continue;
    for (const s of [head, ...penpotUtils.findShapes(() => true, head)]) {
      if (s.type === 'text') continue;
      const ref = s.componentRefShape?.();
      if (!ref) continue;
      snap.push({ comp: name, id: s.id, ref: ref.id, fills: sig(s), mainFills: sig(ref), hidden: !!s.hidden, mainHidden: !!ref.hidden });
    }
  }
}
storage.fillSnap = snap;
const edited = new Set();
for (const name of names) {
  const main = penpotUtils.findShapes((x) => x.id === storage.plan[name].mainId, penpot.currentPage.root)[0];
  for (const s of [main, ...penpotUtils.findShapes(() => true, main)]) {
    if (s.type === 'text') continue;
    if ((s.fills ?? []).length && !(s.fills[0].fillImage)) { s.fills = [{ fillColor: MARK, fillOpacity: 1 }]; edited.add(s.id); }
  }
}
storage.fillEdited = [...edited];
return { snap: snap.length, edited: edited.size, overriddenFills: snap.filter((x) => x.fills !== x.mainFills).length };
