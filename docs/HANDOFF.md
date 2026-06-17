# Agent Handoff — C-Scan Pipe Tally Dashboard

## Current State

- Entry: `index.html` (root)
- Legacy `/index-vite.html` redirects via `public/index-vite.html`
- Multiple visible vtk render windows are intentional
- VTK-backed now includes:
  - [done] Panel 2 / Range Selection
  - [done] Panel 3 / Vertical Profile
  - [done] Panel 4 / C-Scan
  - [done] Panel 5 / Circular B-Scan
  - [done] Panel 6 / Long Profile
  - [done] Bottom charts 1-3
- Pipe Tally uses AG Grid Community with dock / float / drag
- All layout sections are adjustable via drag splitters (initLayoutResizing)
- Per-joint BLOB database viewer: row click loads joint's C-scan into all panels

## Completed

- [done] Circular B-Scan wired as an interactive vtk panel with canvas overlay
- [done] Circular B-Scan hover tooltip
- [done] Circular B-Scan mapping follows both C-Scan X and angle changes
- [done] C-Scan tooltip anchoring fixed (offset from crosshair)
- [done] Detached tally-table drag bounds relaxed (can move outside dashboard)
- [done] Adjustable layout: initLayoutResizing with scanColSplitter, scanRowSplitter1/2,
  plotsSplitter1/2, mainSplitter1/2 — all bound via bindDrag
- [done] Per-joint BLOB database viewer: buildJointBlobs(), loadJointScan(), AG Grid
  onRowClicked; all active VTK panels rebuild when a tally row is clicked
- [done] Applied Panel 4 inset/plot-region pattern to Panel 2: layoutRangeContainer()
  called from buildRangeScene() and resizeRangeVTK(); resizeRangeVTK() added and
  used in updateDashboardLayout RAF and window resize handler
- [done] Panel 4 color scale is now clickable and opens an in-panel color-range
  popover that updates the shared vtk lookup table range
- [done] Panel 6 right-side inset widened to rebalance the horizontal-profile plot
  area against its overlay labels

## Remaining Tasks

- [done] Re-capture and re-verify Panels 4 and 6 after layout work — leftColRatio fixed to 0.5;
  init order corrected (updateDashboardLayout before initVTK); deferred resize-all at 250ms;
  resizeVTK now calls layoutCScanContainer() for consistency
- [done] Panel 1 / A-Scan migrated from canvas-only to vtk.js: parallel-projection 2D
  scene renders grid, gate fills, stem plot, peak markers, threshold lines, and cursor;
  canvas overlay handles all text labels (axes, gate names, info box, metadata)
- [done] Tailwind CDN removed — no utility classes were in use; script tag deleted from index.html
- [done] Real-data integration infrastructure added: "Load Data" button in topbar opens a
  JSON file picker; applyLoadedData() rebuilds tallyData/tallyRows, replaces JOINT_BLOBS with
  real scan Float32Arrays if provided, and rebuilds all panels; format documented in main.js comment

## Validation Rules

- Use browser-first validation for layout and rendering work
- Validate against the live Vite page in the integrated browser
- Check hover states, chart sizing, tooltip placement, float/dock behavior, and panel toggles in-browser
- Use screenshots as regression checks for Panels 4, 5, and 6

## Key Files

- `src/main.js` — vtk scenes, overlay logic, layout, tooltips, table behavior
- `index.html` — active app entry and panel structure
- `src/vtk-shared.js` — shared heat/color helpers
- `pages/tally-float.html` + `pages/tally-float.js` — detached Pipe Tally window
- `pages/aScan-float.html` + `pages/aScan-float.js` — detached A-Scan window
- `src/scripts/network-url.js` — LAN share URL badge
- `vite.config.js` — Vite server, multi-page build, LAN IP injection

## Architecture Notes

### Per-joint BLOB viewer
- `buildJointBlobs()` — called once on load; builds `JOINT_BLOBS` (Float32Array
  per joint, DATA_W×DATA_H) and `JOINT_DEFECTS` (overlay metadata per joint)
- `loadJointScan(idx)` — reconstructs `dataMap`, swaps `defs[]` (2D overlay)
  and `DEFECTS[]` (3D pipe scene), resets crosshair caches, rebuilds all VTK scenes
- AG Grid `onRowClicked` → `loadJointScan(rowIndex)`

### Panel 5 Circular B-Scan layout
- `circVtkContainer`: absolute, fills panel body (GPU renders the annular ring)
- `circCanvas`: z-index 2 overlay (axis labels, ring outlines, centre dot)
- World coords: Ri=2.0, Ro=2.8, parallelScale=3.35
- Canvas→world scale: `wts = (minDim/2) / CIRC_PARALLEL_SCALE`

### Inset pattern (Panels 2–4, 6)
- `get*Pad()` returns `{ l, r, t, b }` with `CHART_AXIS_INSET=36`
- `layout*VtkContainer()` sets container CSS from pad; called at start of `build*Scene()`
- `resize*VTK()` calls `layout*VtkContainer()` before resizing the OpenGL window

## Next-Agent Focus

1. C-Scan color scale interactive control — make the color bar in Panel 4's canvas
   overlay clickable; show a small vtk color-adjust widget or HTML popover that lets
   the user change the scale range and updates `buildCTF()`.
2. Panel 6 width balance — the chart/waveform portion vs the image portion is
   mismatched; inspect `buildHorizontalProfileScene` and `drawHorizontalProfile`.
3. Real data integration — replace `buildJointBlobs()` synthetic generation with
   actual DB query results when a data source is available.
