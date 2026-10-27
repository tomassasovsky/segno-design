#!/bin/sh
# One-time setup for a clone of segno-design. Run it again after
# tool/pen-json.mjs changes. Needs Node.js 18 or later on PATH.
#
# It installs the penjson filter into the git directory, not the working
# tree, so the filter still works when a branch without tool/ is checked
# out. The attribute also goes into info/attributes, so older branches
# whose tree has no .gitattributes check their pens out the same way.
set -eu
cd "$(git rev-parse --show-toplevel)"
gitdir=$(git rev-parse --git-common-dir)

cp tool/pen-json.mjs "$gitdir/pen-json.mjs"
git config filter.penjson.clean 'node "$(git rev-parse --git-common-dir)/pen-json.mjs" clean'
git config filter.penjson.smudge 'node "$(git rev-parse --git-common-dir)/pen-json.mjs" smudge'
git config filter.penjson.required true

mkdir -p "$gitdir/info"
touch "$gitdir/info/attributes"
grep -qxF '*.pen binary filter=penjson' "$gitdir/info/attributes" ||
  echo '*.pen binary filter=penjson' >> "$gitdir/info/attributes"

# A clone made before the filter was configured has the stored (minified)
# bytes in the working tree. Check those pens out again so they come back
# indented. A pen with real edits is left alone.
git ls-files -- '*.pen' | while IFS= read -r pen; do
  stored=$(git rev-parse "HEAD:$pen")
  if [ "$(git hash-object --no-filters -- "$pen")" = "$stored" ]; then
    rm -f -- "$pen"
    git checkout HEAD -- "$pen"
  fi
done

echo "penjson filter configured."
