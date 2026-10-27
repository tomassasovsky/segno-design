#!/usr/bin/env node
// Git clean/smudge filter for *.pen files.
//
// Pencil saves a .pen as JSON.stringify(doc, null, 2). Indented, segno-ui.pen
// is larger than GitHub's 100 MB per-file limit; minified it is about a
// quarter of that. The repository stores the minified form (clean) and the
// working tree holds the indented form Pencil writes (smudge). For a file
// Pencil saved, smudge(clean(file)) is byte-identical to the file.
//
// Usage: node tool/pen-json.mjs clean|smudge < in > out
const mode = process.argv[2];
if (mode !== 'clean' && mode !== 'smudge') {
  process.stderr.write('usage: pen-json.mjs clean|smudge\n');
  process.exit(2);
}
const chunks = [];
process.stdin.on('data', (chunk) => chunks.push(chunk));
process.stdin.on('end', () => {
  const doc = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  const out =
    mode === 'clean' ? JSON.stringify(doc) : JSON.stringify(doc, null, 2);
  process.stdout.write(out);
});
