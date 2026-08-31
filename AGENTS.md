# SEVENTH GUN — agent instructions

A one-shot, seeded, late-90s-style FPS. Vite + TypeScript + Three.js, static
build, no backend. Everything procedural (canvas textures, mesh factories,
WebAudio synth). No paid assets, no copied levels.

Repo: https://github.com/guillem/seventh-gun (default branch `main`).

## Workflow

- **Branch + PR for all development from now on** (the initial one-shot went
  straight to `main`). Use `gh` to open PRs, verify the Netlify Deploy
  Preview URL, then merge.
- Commits: conventional-ish (`feat:`, `fix:`, `test:`, `docs:`), meaningful units.
- Keep `docs/STATUS.md` current — it is how a later agent (or you) resumes.

## Run

```bash
npm install
npm run dev          # vite dev server (http://localhost:5173)
npm run build        # typecheck + production build -> dist/
npm run preview      # serve dist/ on :4173 (what e2e tests drive)
```

## Test

```bash
npm test             # vitest unit suite (sim: mapgen sweep, weapons, determinism, arch guards)
npm run test:e2e     # playwright (desktop chromium + mobile chromium projects)
```

E2E builds and serves `dist/` itself via the `webServer` config. Debug API
(`window.__GAME__`) only exists when the page is loaded with `?e2e=1`.
Never drive pointer lock with synthetic mousemove — it is flaky; use the
debug API.

## Layout

- `src/sim/` — deterministic headless simulation. NEVER import three/DOM here,
  never use Math.random (architecture test enforces it).
- `src/render/` — Three.js scene building, textures, enemy/viewmodel meshes, FX.
- `src/audio/` — WebAudio synth.
- `src/ui/` — HUD, screens, map overlay.
- `src/app/` — Game orchestrator, input (desktop+touch), debug API.
- `docs/` — ARCHITECTURE / DECISIONS / ROADMAP / TESTING / STATUS / GAME-DESIGN.

## Conventions

- Balance numbers live in `src/sim/weapons.ts`, `src/sim/enemyTypes.ts`,
  `src/sim/difficulty.ts` and are mirrored in `docs/GAME-DESIGN.md`.
- Generator changes must bump `GEN_VERSION` in `src/sim/types.ts` (seed
  reproducibility is version-scoped) and keep the 300-seed sweep green.

## Deploy

Netlify, `netlify.toml` at root: build `npm run build`, publish `dist`.
Treat Deploy Preview URLs as the thing to verify before merge. Production
URL is the Netlify site for this repo.
