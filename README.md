# segno-design

Design source for [Segno](https://github.com/tomassasovsky/segno), the
looper console. This repository holds:

- `segno-ui.pen`, the Pencil file every Segno screen is drawn in. It is the
  authoritative UI design: each `AREA / name` frame is a screen, and the `c/`
  notes record the reasoning behind it.
- `docs/design/`, design notes, studies and the images the pen links to.
  The on-disk format specs that used to be here (performance event log,
  performance manifest, session bundle) moved to `docs/formats/` in Segno,
  next to the code that implements them, and the console grounding scheme
  moved to `hardware/console/` in
  [segno-hardware](https://github.com/tomassasovsky/segno-hardware).
- `fonts/127.0.0.1/`, the two fonts the pen references by hash. They are
  byte-identical to `Inter-Regular.ttf` and `JetBrainsMono-Regular.ttf` from
  the Segno app, and are covered by the SIL Open Font License files next to
  them.

The history was extracted from `tomassasovsky/segno` with git-filter-repo.
Issue and PR references in commit messages (`#123`) were rewritten to
`tomassasovsky/segno#123`, because those numbers belong to that repository.

## Setup (once per clone)

Clone this repository next to the Segno checkout, so the app repository can
find it at `../segno-design`:

```sh
git clone https://github.com/tomassasovsky/segno-design.git
cd segno-design
sh tool/setup.sh
```

`tool/setup.sh` needs Node.js 18 or later. It registers the `penjson` filter
and checks the pen out again through it.

### Why the filter exists

Pencil saves a `.pen` as `JSON.stringify(doc, null, 2)`. Indented,
`segno-ui.pen` is about 107 MB, above GitHub's 100 MB per-file limit.
Minified it is about 26 MB. The filter in `tool/pen-json.mjs` stores the
minified form in git (`clean`) and writes the indented form to the working
tree (`smudge`). For a file Pencil saved, minifying and re-indenting gives
back the same bytes, so Pencil and git see the file they expect.

The filter is marked `required`: if Node is missing, `git add` and checkout
fail instead of committing an indented pen. CI rejects any committed `.pen`
blob that contains a newline or is larger than 90 MB.

## Verifying a save

Pencil does not always write to disk when you expect it to (edits made
through its MCP server are not autosaved), and `git status` does not show
whether a save happened. Compare hashes instead:

```sh
# Bytes on disk. Run before and after saving; a save changes it.
git hash-object --no-filters segno-ui.pen

# The blob the filter would commit, and the blob at HEAD.
git hash-object segno-ui.pen
git rev-parse HEAD:segno-ui.pen
```

If the last two match, the pen on disk has no changes to commit.

## Working with the Segno repository

A UI change shipped in Segno updates the pen here. Open a PR in this
repository with the pen change and link it from the Segno PR, and link the
Segno PR back from this one. Segno's CI checks the app against the
design studies at the commit pinned in Segno's `.github/segno-design.sha`;
when a study the app is checked against changes, the Segno PR updates that
pin. A shipped departure from the pen is a design
change: write it into the pen (geometry and a `c/` note) in the same pair of
PRs.

## Branches

- `main`: the pen and notes as of the Segno trunk (`claude/segno-integration`).
- `design/pen-lfs`: the 107 MB pen with the September design screens and the
  Looper X images. In Segno it was stored in Git LFS; here it is a regular
  file stored through the filter.
- `docs/design-program-2026-09`: the September 2026 design program, with its
  previews and walkthrough videos.
- The other branches are Segno feature branches that changed the pen and
  were never merged in that form. They are kept for history.

## Known gaps

The pen links to these images, and no copy of them exists in any branch or
on the design machine. The pen shows them as missing:

- `docs/design/fx-ux-previews/pen-sizing/state-art/Amp4-muted-0.35.png`
- `docs/design/fx-ux-previews/pen-sizing/state-art/Chorus3-muted-0.35.png`
- `docs/design/fx-ux-previews/pen-sizing/state-art/Compressor2-muted-0.35.png`
- `docs/design/fx-ux-previews/pen-sizing/state-art/EQ5-muted-0.35.png`
- `docs/design/fx-ux-previews/pen-sizing/state-art/Octaver3-muted-0.35.png`
- `docs/design/fx-ux-previews/pen-sizing/state-art/Overdrive2-muted-0.35.png`
- `docs/design/fx-ux-previews/pen-sizing/state-art/Reverb2-muted-0.35.png`
- `docs/design/fx-ux-previews/pen-sizing/state-art/Transient3-muted-0.35.png`
- `docs/design/fx-ux-previews/pen-sizing/state-art/Wah1-muted-0.35.png`
- `docs/design/fx-ux-previews/pen-sizing/state-art/Wham2-muted-0.35.png`

## Licence

Our design work in this repository is licensed under Creative Commons
Attribution-ShareAlike 4.0 International (`CC-BY-SA-4.0`). The full legal
code is in [`LICENSE`](LICENSE). It covers `segno-ui.pen`, the design notes
and browser studies under `docs/design/`, the previews and screenshots of
Segno, and the art made for Segno together with its sources, scripts and
prompts (for example `docs/design/own-art/`). Images generated with image
models are covered to the extent that they are protected.

These are not covered:

- **Code under `tool/`** stays GPL-3.0-or-later, the same as Segno, unless a
  file says otherwise. The text is in [`tool/LICENSE`](tool/LICENSE).
- **Fonts.** `fonts/127.0.0.1/` holds Inter and JetBrains Mono under the SIL
  Open Font License 1.1, in the `OFL-*.txt` files next to them.
- **Looper X images.** `docs/design/looperx-factory/` holds Looper X images,
  kept as a reference for layout and sizing. They are third-party material,
  and we grant no licence for them. The same applies to:
  - the muted copies in `docs/design/fx-ux-previews/pen-sizing/state-art/`;
  - the Looper X art in the top ("before") half of each
    `docs/design/own-art/app-screens/*-before-after.png`;
  - the "old" column of `docs/design/own-art/review-sheet.png`.

  The pen links to these images by path. Its licence does not extend to
  them.

Until this licence was added on 2026-10-28, these files were published under
GPL-3.0, first as part of
[`tomassasovsky/segno`](https://github.com/tomassasovsky/segno) and then in
this repository, including the other branches listed above. Copies taken from
that history remain available under those terms. That notice never applied to
the Looper X images, because they were never ours to license.
