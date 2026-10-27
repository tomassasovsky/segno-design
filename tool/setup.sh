#!/bin/sh
# One-time setup for a clone of segno-design: registers the penjson filter
# that .gitattributes names for *.pen, then checks the pens out again
# through it. Needs Node.js 18 or later on PATH.
set -eu
cd "$(git rev-parse --show-toplevel)"

git config filter.penjson.clean 'node tool/pen-json.mjs clean'
git config filter.penjson.smudge 'node tool/pen-json.mjs smudge'
git config filter.penjson.required true

# A clone made before the filter existed has the stored (minified) bytes in
# the working tree. Check those files out again so they come back indented.
# A pen with real edits is left alone.
git ls-files -- '*.pen' | while IFS= read -r pen; do
  stored=$(git rev-parse "HEAD:$pen")
  if [ "$(git hash-object --no-filters -- "$pen")" = "$stored" ]; then
    rm -f -- "$pen"
    git checkout HEAD -- "$pen"
  fi
done

echo "penjson filter configured."
