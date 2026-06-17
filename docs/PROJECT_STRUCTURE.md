# Project Structure

```
ClientVersion/
├── index.html              # Main dashboard entry
├── vite.config.js          # Vite + LAN IP plugin
├── package.json
├── start-lan-share.bat     # LAN dev server launcher
├── public/
│   └── index-vite.html     # Legacy URL redirect → /
├── src/
│   ├── main.js             # App logic (VTK, grids, layout)
│   ├── vtk-shared.js       # Heatmap colors + vtk CTF
│   └── scripts/
│       └── network-url.js  # Topbar LAN link copy
├── pages/                  # Multi-page float windows
│   ├── tally-float.html
│   ├── tally-float.js
│   ├── aScan-float.html
│   └── aScan-float.js
├── docs/                   # Specs and handoff notes
└── dist/                   # Production build output (gitignored)
```

## URLs (dev / preview)

| Path | Page |
|------|------|
| `/` | Main dashboard |
| `/pages/tally-float.html` | Pipe Tally float |
| `/pages/aScan-float.html` | A-Scan float |
| `/index-vite.html` | Redirect to `/` |

## Commands

```bash
npm run dev      # vite (port 4173)
npm run build    # output → dist/
npm run preview  # serve dist/
```
