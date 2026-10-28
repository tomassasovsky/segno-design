const texts = (s) => (s.type === 'text' ? [s] : penpotUtils.findShapes((x) => x.type === 'text', s));
const report = {};
for (const [name, v] of Object.entries(storage.plan)) {
  const main = penpotUtils.findShapeById(v.mainId);
  const r = { copies: v.copies.length, keptOverride: 0, lostOverride: 0, followedMain: 0, notFollowed: 0, radiusFollowed: 0, radiusNot: 0, examples: [] };
  for (const c of v.copies) {
    const s = penpotUtils.findShapeById(c.id);
    if (!s) continue;
    const now = Object.fromEntries(texts(s).map((t) => [t.id, t.characters]));
    for (const t of c.texts) {
      const cur = now[t.id];
      if (t.chars !== t.mainChars) {
        if (cur === t.chars) r.keptOverride++;
        else { r.lostOverride++; if (r.examples.length < 3) r.examples.push({ lost: t.chars, now: cur }); }
      } else {
        if (cur?.startsWith(`${t.chars} M`)) r.followedMain++;
        else { r.notFollowed++; if (r.examples.length < 3) r.examples.push({ expected: `${t.chars} M`, now: cur }); }
      }
    }
    if (main.type !== 'text') {
      if (s.borderRadius === main.borderRadius) r.radiusFollowed++; else r.radiusNot++;
    }
  }
  report[name] = r;
}
return report;
