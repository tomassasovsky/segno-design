# segno-design

Design material for [Segno](https://github.com/tomassasovsky/segno), the
looper console.

## The design source is the Penpot file

Every Segno screen is designed in the Penpot file **segno-ui**, in the project
**Segno**, on the self-hosted Penpot at <http://192.168.50.122:9001>. That
file is the authoritative UI design. Each page is one area of the design
(`01 CURRENT UX / 02 Effects · chains & controls`); each screen card on it
holds the screen's label, the screen, and its `c/` notes with the reasoning
behind it.

- **Where it runs.** Penpot runs as a Docker stack on VM 100 of the home
  Proxmox host (192.168.50.122). It is part of that VM's nightly backup, and
  it is down for a few minutes while the backup runs at 22:00 ART.
- **Who can reach it.** Only machines on the home network. The server is
  not exposed to the internet.
- **Getting access.** From the home network, create an account on the
  server, then ask the owner to add it to the team that holds the Segno
  project. Agents use the owner's account: the Penpot MCP server for edits,
  and an access token for the API (see below).

This repository keeps the design's history and everything around it:

- `penpot/segno-ui/`, snapshots of the Penpot file (see
  [Design history](#design-history)).
- `segno-ui.pen`, the last pen.dev (Pencil) version of the design, frozen
  (see [The frozen pen](#the-frozen-pen)).
- `docs/design/`, design notes, browser studies and the images the design
  uses. Segno's CI reads some of these studies (see
  [Working with the Segno repository](#working-with-the-segno-repository)).
  The on-disk format specs that used to be here (performance event log,
  performance manifest, session bundle) moved to `docs/formats/` in Segno,
  next to the code that implements them, and the console grounding scheme
  moved to `hardware/console/` in
  [segno-hardware](https://github.com/tomassasovsky/segno-hardware).
- `fonts/127.0.0.1/`, Inter and JetBrains Mono as the pen references them.
  They are byte-identical to `Inter-Regular.ttf` and
  `JetBrainsMono-Regular.ttf` from the Segno app, and are covered by the SIL
  Open Font License files next to them.
- `tool/pen2penpot/`, the converter that turned the pen into the Penpot file
  (tomassasovsky/segno#1503). It is kept as the record of how the conversion
  was done, and is not part of the daily workflow.

The history was extracted from `tomassasovsky/segno` with git-filter-repo.
Issue and PR references in commit messages (`#123`) were rewritten to
`tomassasovsky/segno#123`, because those numbers belong to that repository.

## Editing the design

People edit the file in the Penpot web app.

Agents edit it through Penpot's MCP server, which Claude Code has configured
as `penpot` (user scope, the server's `/mcp/stream` endpoint). The MCP server
works through the Penpot plugin running in a browser, so before an agent
session:

1. Open the file in a browser tab that is logged in to the server.
2. Connect the MCP plugin from the toolbar's MCP button, and leave the tab
   open while the agent works.
3. Writes apply only to the active page. The agent calls
   `penpot.openPage(page)` before editing a page.

## Design history

Penpot keeps its own version history of the file, but only on the server.
For history in git, a design PR includes a fresh snapshot of the file:

```sh
tool/penpot-snapshot
git add penpot/
```

`tool/penpot-snapshot` exports the file through the backend API
(`export-binfile`, the binfile v3 format that Penpot's dashboard also exports
and imports) and writes the contents of the export to `penpot/segno-ui/`,
replacing what was there. It needs `curl` and `unzip`, the home network, and
an access token in `~/development/penpot-server/.penpot-token` (override with
`PENPOT_TOKEN_FILE`; `PENPOT_URL` and `PENPOT_FILE_ID` override the server
and the file). The token belongs to the owner's account: never print or
commit it. The export is deterministic, so an unchanged file gives an
unchanged snapshot.

### Why the snapshot is unpacked

A `.penpot` file is a zip archive with one JSON file per shape. The first
export (2026-10-28) is 132 MB, over GitHub's 100 MB per-file limit, so it
cannot be committed as `penpot/segno-ui.penpot`. The snapshot is the
archive's contents instead: 117,526 files, 483 MB on disk, of which 117,151
are shapes and 65 are images. The largest file is 2.5 MB, and git stores the
first snapshot in a 69 MB pack. Each later snapshot adds only the shapes that
changed, and a PR's diff shows which shapes those are.

To restore a snapshot into Penpot, zip it and import the result from the
Penpot dashboard (Import):

```sh
(cd penpot/segno-ui && zip -qrX ../../segno-ui.penpot .)
```

The first snapshot was checked this way: the re-zipped archive imports with
the same 71 pages, 117,151 shapes, 44 components and 62 library colours. The
export does not include the team's custom fonts (Inter, JetBrains Mono and
Arimo). A new Penpot team needs them uploaded first
(`tool/pen2penpot/bin/upload-fonts.mjs`).

A worktree that does not need the snapshot can leave it out:

```sh
git sparse-checkout set --no-cone '/*' '!/penpot/'
```

## The frozen pen

`segno-ui.pen` is the last version of the design made in pen.dev (Pencil).
The Penpot file was converted from it at commit 7c77cc4, and Pencil edits
made after that were never carried over. It is kept for history only. **Do
not edit it**; design changes go to the Penpot file.

The pen still needs the `penjson` filter to check out, so the filter and
`tool/setup.sh` stay. Run the setup once per clone (it needs Node.js 18 or
later):

```sh
git clone https://github.com/tomassasovsky/segno-design.git
cd segno-design
sh tool/setup.sh
```

Pencil saves a `.pen` as `JSON.stringify(doc, null, 2)`. Indented,
`segno-ui.pen` is about 107 MB, above GitHub's 100 MB per-file limit.
Minified it is about 26 MB. The filter in `tool/pen-json.mjs` stores the
minified form in git (`clean`) and writes the indented form to the working
tree (`smudge`). It is marked `required`: if Node is missing, checkout fails
instead of leaving a minified pen in the working tree. CI (`pen` workflow)
checks that every committed `.pen` blob is minified and under 90 MB, and that
a checkout through the filter parses and leaves the tree clean.

## Working with the Segno repository

Clone this repository next to the Segno checkout, at `../segno-design`, so
the app repository finds it there (worktrees find it there too).

A UI change shipped in Segno updates the design: change the Penpot file,
then open a PR here with a fresh snapshot, and link it from the Segno PR and
the Segno PR back from this one. A shipped departure from the design is a
design change: write it into the Penpot file (geometry and a `c/` note) in
the same pair of PRs.

Segno's CI checks the app against the design studies at the commit pinned in
Segno's `.github/segno-design.sha`. When a study the app is checked against
changes, the Segno PR updates that pin.

## Branches

- `main`: the design snapshots, the frozen pen and the notes, as of the Segno
  trunk (`claude/segno-integration`).
- `design/pen-lfs`: the 107 MB pen with the September design screens and the
  Looper X images. In Segno it was stored in Git LFS; here it is a regular
  file stored through the filter.
- `docs/design-program-2026-09`: the September 2026 design program, with its
  previews and walkthrough videos.
- The other branches are Segno feature branches that changed the pen and
  were never merged in that form. They are kept for history.

## Known gaps

The pen links to these images, and no copy of them exists in any branch or
on the design machine. The pen shows them as missing, and the Penpot file,
converted from the pen, draws them empty (`02 Effects · chains & controls`
and `46 Try a preset · Accepted`):

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
code is in [`LICENSE`](LICENSE). It covers the Penpot snapshots under
`penpot/`, `segno-ui.pen`, the design notes
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
  them. The Penpot file holds its own copies of the images it uses, which
  the snapshot stores under `penpot/segno-ui/objects/`; the copies of these
  images there are not covered either.

Until this licence was added on 2026-10-28, these files were published under
GPL-3.0, first as part of
[`tomassasovsky/segno`](https://github.com/tomassasovsky/segno) and then in
this repository, including the other branches listed above. Copies taken from
that history remain available under those terms. That notice never applied to
the Looper X images, because they were never ours to license.
