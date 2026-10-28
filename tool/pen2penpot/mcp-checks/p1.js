const NAMES = ['FxParamTile', 'Row', 'FxParamSwitchCell', 'FxParamEnumCell', 'FxBypassPill', 'SectionCaption', 'Hardware / Segno pedal face'];
const lib = penpot.library.local;
const texts = (s) => (s.type === 'text' ? [s] : penpotUtils.findShapes((x) => x.type === 'text', s));
const plan = {};
const allPages = penpotUtils.getPages().map((p) => penpotUtils.getPageById(p.id));
for (const name of NAMES) {
  const comp = lib.components.find((c) => c.name === name);
  const main = comp.mainInstance();
  const copies = [];
  for (const page of allPages) {
    for (const s of penpotUtils.findShapes((x) => { try { if (!x.isComponentInstance() || x.isComponentMainInstance() || x.component()?.id !== comp.id) return false; const par = x.parent; let pc = null; try { pc = par?.isComponentInstance() ? par.component()?.id : null; } catch (e) {} return pc !== comp.id; } catch (e) { return false; } }, page.root)) {
      copies.push({ id: s.id, page: page.name, texts: texts(s).map((t) => ({ id: t.id, chars: t.characters, ref: t.componentRefShape()?.id, mainChars: t.componentRefShape()?.characters })), radius: s.borderRadius });
    }
  }
  plan[name] = { compId: comp.id, mainId: main.id, mainRadius: main.borderRadius, mainTexts: texts(main).map((t) => ({ id: t.id, chars: t.characters })), copies };
}
storage.plan = plan;
return Object.fromEntries(Object.entries(plan).map(([k, v]) => [k, { copies: v.copies.length, mainTexts: v.mainTexts.length, overriddenTexts: v.copies.flatMap((c) => c.texts).filter((t) => t.chars !== t.mainChars).length, mainRadius: v.mainRadius }]));
