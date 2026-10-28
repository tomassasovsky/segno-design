# pen2penpot

Converts screens of `segno-ui.pen` into a Penpot file, for the Penpot trial
(tomassasovsky/segno#1503). It reads the pen as the documented JSON format
(https://docs.pencil.dev/for-developers/the-pen-format) and never writes to it.

## How it works

1. **Expand.** `src/pen.mjs` resolves variables (no themes are used, so every
   variable has one value) and expands every `ref` into a copy of its component
   with the instance's own properties and `descendants` overrides applied, as
   the spec describes. Disabled nodes are kept and marked hidden.
2. **Lay out in a browser.** `src/html.mjs` writes one HTML document per screen
   that maps pen layout to CSS flexbox one to one (`layout`, `gap`, `padding`,
   `justifyContent`, `alignItems`, `fit_content`, `fill_container`,
   `layoutPosition: absolute`, `textGrowth`). `src/layout.mjs` renders it in
   headless Chrome (puppeteer-core driving the installed Google Chrome) and
   reads `getBoundingClientRect` for every node and the line boxes of every
   text. The screenshot of that page is the reference render.
3. **Write the Penpot file.** `src/penpot.mjs` uses `@penpot/library` to build
   a `.penpot` file: frames become boards that keep their flex layout, with the
   absolute geometry from step 2. Reusable nodes become main components and
   instances become copies (`shapeRef`) with override flags (`touched`) set
   where the copy differs from the main. Colour variables become library
   colours that fills and strokes are bound to; all variables also become a
   design-token set.
4. **Import** with `bin/import.mjs` (RPC `import-binfile`, access token).
5. **Verify** with `bin/verify.mjs`: renders each board with Penpot's own
   render page and compares it pixel by pixel with the reference render.

The reference render is this tool's reading of the pen format, not a pen.dev
render: pen.dev could not be used during the trial. Fixed sizes from the pen
survive the CSS layout exactly, but `fit_content` and `fill_container`
results have not been checked against pen.dev itself.

### Why verify does not call the exporter

Penpot's exporter service (`/api/export`) authenticates with the browser
session cookie only, so an access token cannot drive it. `bin/verify.mjs`
opens the page the exporter screenshots, `render.html` with route `objects`,
in headless Chrome with the token in an `Authorization` header, and crops the
result to the board using the SVG's viewBox.

## Run

Needs Node 18 or later and Google Chrome in `/Applications`. The Penpot access
token is read from `~/development/penpot-trial/.penpot-token`; it is only sent
as an `Authorization` header to `localhost:9001`.

```sh
cd tool/pen2penpot
npm ci
node bin/upload-fonts.mjs        # once per Penpot team; writes out/fonts.json
node bin/convert.mjs             # the default trial screens
node bin/convert.mjs --all       # every top-level frame
node bin/import.mjs              # imports out/segno-trial.penpot
node bin/verify.mjs              # renders, diffs, writes out/verify.json
```

Full file: `node bin/convert.mjs --all`, then
`node bin/import.mjs out/segno-all.penpot --record import-segno-all.json` and
`node bin/verify.mjs out/import-segno-all.json --report out/report-all.json --tag all`.

Two extra checks:

- `bin/workspace-shots.mjs "STAGE / stage" ...` screenshots boards (by name or
  shape id) in the Penpot workspace UI.
- `bin/relayout-test.mjs out/import-<copy>.json` makes Penpot's layout engine
  recompute every screen's root and first-level boards (width +1 px and back
  in the design panel). Run it on a separate import: it edits the file. Its
  field lookup sometimes types into the opacity field instead, so compare
  geometry from `get-file` afterwards rather than pixels.

Output goes to `~/development/penpot-trial/out` (override with `--out`):
`segno-trial.penpot`, `report.json` (counts and lossy features),
`render/<id>.png` (reference), `penpot/<id>.png`, `diff/<id>.png` and
`compare/<id>.png` (reference, Penpot and diff side by side).

## Fonts

The reference render loads Inter and JetBrains Mono from the Segno app's
`assets/fonts`, SF Mono and Arial from macOS. `bin/upload-fonts.mjs` uploads
the same Inter, JetBrains Mono and SF Mono files to the Penpot team so both
renders use identical glyphs. SF Mono is Apple's font; its licence covers
mock-ups of Apple-platform software only, so it should not move to a shared
server. Arial maps to Arimo (metric-compatible, open) from Penpot's Google
Fonts catalogue. Inter weights the app does not ship (650, 750, 800) resolve
to the nearest available file, 700, in both renders.

## Known gaps

Recorded per run in `report.json` under `lossy`:

- Per-side stroke widths: Penpot's renderer has none, so each side becomes a
  thin rectangle pinned to that edge.
- Image fills with `fit`: Penpot image fills only stretch or cover, so the
  image goes into a child rectangle sized to the fitted box.
- Instances whose `descendants` replace a node or its children cannot be
  Penpot copies; they are written as plain layers.
- Path stroke joins: Penpot has no line-join setting.
- Rotation (two nodes in the file) is not carried over.
