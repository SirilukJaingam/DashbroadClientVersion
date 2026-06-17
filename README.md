# UTClientVersionDashbroad

C-Scan & Pipe Tally Suite — Vite + vtk.js dashboard.

## Project structure

```
UTClientVersionDashbroad/
├── index.html                 # main entry point
├── vite.config.js
├── package.json
├── start-lan-share.bat        # dev server for LAN colleagues
├── .github/workflows/
│   └── deploy-pages.yml       # GitHub Pages deploy (main only)
├── public/
│   └── index-vite.html        # legacy redirect → /
├── src/
│   ├── main.js
│   ├── vtk-shared.js
│   └── scripts/network-url.js
├── pages/
│   ├── tally-float.html|.js
│   └── aScan-float.html|.js
└── docs/
    ├── HANDOFF.md
    ├── PROJECT_STRUCTURE.md
    └── …
```

## Prerequisites

- [Node.js](https://nodejs.org/) 20+ (GitHub Actions uses Node 22)
- npm (included with Node.js)

## Build & run — Local

### 1. Install dependencies (first time)

```bash
npm install
```

### 2. Development server

Hot reload for daily work. Serves at `http://127.0.0.1:4173/` with `base: /`.

**Option A — command line**

```bash
npm run dev
```

**Option B — Windows: double-click `start-lan-share.bat`**

Use this when you want the dev server running quickly and colleagues on the same Wi‑Fi/LAN to open the app without GitHub Pages.

1. In File Explorer, open the project folder and **double-click** `start-lan-share.bat`.
2. If Node.js is missing, the window shows an error — install from [nodejs.org](https://nodejs.org/) and run the `.bat` again.
3. On first run, the script runs `npm install` automatically if `node_modules` is not present.
4. The console lists share links, for example:
   - `http://192.168.x.x:4173/` — give this to others on the same network
   - `http://127.0.0.1:4173/` — use on this PC only
5. Your default browser opens the local URL automatically.
6. Leave the command window open while using the app. Press **Ctrl+C** or close the window to stop the server.

The `.bat` file runs `npx vite --port 4173` with `host: 0.0.0.0` (see `vite.config.js`), so devices on the LAN can reach your machine. This is for **development** only — it is not the same as the public GitHub Pages site.

### 3. Production build (local / generic hosting)

Output goes to `dist/`. Asset paths use `base: /` (root).

```bash
npm run build
```

Preview the built files locally:

```bash
npm run preview
```

### 4. Production build (same as GitHub Pages)

GitHub Pages hosts this repo under a subpath, so the build sets `base: /UTClientVersionDashbroad/`.

```bash
# PowerShell
$env:GITHUB_PAGES = 'true'
npm run build:pages

# cmd.exe
set GITHUB_PAGES=true && npm run build:pages
```

Preview the Pages build (must serve `dist` with that base path):

```bash
npm run preview -- --base /UTClientVersionDashbroad/
```

Open: `http://127.0.0.1:4173/UTClientVersionDashbroad/`

| Script | `base` path | Use case |
|--------|-------------|----------|
| `npm run dev` | `/` | Local development |
| `npm run build` | `/` | Generic static host at domain root |
| `npm run build:pages` + `GITHUB_PAGES=true` | `/UTClientVersionDashbroad/` | GitHub Pages (matches CI) |

> If the repository is renamed or moved under another owner, update `repoBase` in `vite.config.js` to match the new repo name.

---

## Build & deploy — GitHub (server)

### Live site URL

```
https://<owner>.github.io/UTClientVersionDashbroad/
```

Replace `<owner>` with your GitHub username or organization name. After a successful deploy, the exact URL is shown under **Settings → Pages**.

Anyone with the link can open it when the repository is **public** and Pages is enabled. No port forwarding on your PC is required (unlike LAN dev mode).

### One-time GitHub setup

1. Repository → **Settings** → **Pages**
2. **Build and deployment** → **Source:** **GitHub Actions** (not “Deploy from a branch” on raw `index.html` — this project is bundled with Vite)
3. Push the workflow file on `main`: `.github/workflows/deploy-pages.yml`

### What runs on GitHub

On every **push to `main`** (or manual **Run workflow**):

1. `actions/checkout` — clone repo
2. `npm install`
3. `npm run build:pages` with `GITHUB_PAGES=true` → writes `dist/`
4. `upload-pages-artifact` + `deploy-pages` → publishes static files

Monitor runs under **Actions** → **Deploy GitHub Pages**.

### Branches vs `main`

| Event | Workflow runs? | Public site updates? |
|-------|----------------|----------------------|
| Push to `feature/*` (not `main`) | No | No — stays on last `main` deploy |
| Merge / push to `main` | Yes | Yes |
| **Run workflow** (any branch) | Yes | Yes — overwrites live site with that branch’s build |

Feature branches do not auto-deploy. Merge to `main` when ready for production.

### After transferring the repository

- URL changes to `https://<new-owner>.github.io/<repo-name>/`
- Update `repoBase` in `vite.config.js` if the repo name changes
- Re-enable **Pages → GitHub Actions** on the new repository
- Re-run deploy from `main`

---

## npm scripts reference

| Script | Description |
|--------|-------------|
| `npm run dev` | Vite dev server (`0.0.0.0:4173`) |
| `npm run build` | Production build → `dist/` (`base: /`) |
| `npm run build:pages` | Same as CI when `GITHUB_PAGES=true` |
| `npm run preview` | Serve `dist/` locally |

## Further reading

- `docs/PROJECT_STRUCTURE.md` — routes and module layout
- `docs/HANDOFF.md` — handoff notes
