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

E2E builds and serves the Cloudflare local preview (`dist/client` + worker)
itself via the `webServer` config. Debug API
(`window.__GAME__`) only exists when the page is loaded with `?e2e=1`.
Never drive pointer lock with synthetic mousemove — it is flaky; use the
debug API. Arena: `joinArena`, `leaveArena`, `arena()`.

## Layout

- `src/sim/` — deterministic headless simulation. NEVER import three/DOM here,
  never use Math.random (architecture test enforces it).
- `src/net/` — arena protocol + client prediction. No Three, no server imports.
- `server/` — arena server. `room.ts` is the runtime-agnostic room; `index.ts` is the
  Cloudflare Worker + Durable Object; `node/` is the portable self-host server.
  Imports `src/sim` and `src/net/protocol` only.
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

Three targets, one client build.

- **Cloudflare Workers is production** (`wrangler.jsonc`, Worker name `seventh-gun`).
  Never add a Cloudflare payment method. `run_worker_first` is only `/arena` and `/health`.
- **Netlify** stays a static mirror: `publish = dist/client`. Arena is offline there
  unless `VITE_ARENA_WS_URL` / `ALLOWED_ORIGINS` point at the Worker.
- **Portable Node** (`server/node/main.ts` -> `bin/seventh-gun.mjs`) is what ships to
  people self-hosting: Docker image, `npx seventh-gun`, static tarball.

`vite.config.ts` picks a target by **mode**, not an env var (Windows contributors):
default is Cloudflare, `--mode portable` drops the plugin. The `isSsrBuild` branch is
load-bearing — without it the `--ssr` pass inherits `dist/client` + `emptyOutDir` and
deletes the client build. Always client first, then server.

`server/room.ts` holds all arena logic and is runtime-agnostic on purpose: clock, seed
source and scheduler are injected, sockets are a two-method `RoomSocket`. Keep it that
way — it is the only reason the Worker and the Node server can share it. Cloudflare
specifics stay in `server/index.ts`; Node specifics stay in `server/node/`.

Three tsconfigs, all run by `npm run typecheck`: root (client+tests),
`tsconfig.server.json` (Worker, Cloudflare ambient types, excludes `server/node`),
`tsconfig.node.json` (`server/node`, `@types/node`).

Releases are cut by tagging `v*`, which runs `.github/workflows/release.yml`.
