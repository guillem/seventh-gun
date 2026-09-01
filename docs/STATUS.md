# STATUS

Updated: 2026-09-01 — PR 2: authored map codec, `Sim.fromMap`, `#m=` share
(`feat/map-codec`).

## State: initial version + bugfixes #1–2 + map log + authored-map codec

Full loop works end to end: title (seed + skill) → run the maze → find
guns 2–7 in route order → the Seventh shatters the arena seal → clear the
arena → GAME OVER / You won. Death: 2s lockout → title with Retry Seed /
New Maze. Desktop + phone viewports verified.

- Repo: https://github.com/guillem/seventh-gun (`main`). From now on:
  branches + PRs (`gh`), Netlify deploy preview verified before merge.
- Netlify: LIVE at https://seventh-gun.netlify.app — repo linked, deployment
  current (bundle hash matches local HEAD 1dc2629), verified in a real
  browser: boots to title, UI start works, HUD/minimap render, `?seed=`
  pre-fills, zero runtime errors, `__GAME__` debug API absent in production.
  Local folder linked via `netlify link` (`.netlify/` is gitignored).
- Suites this PR: `npm test` 42/42 (was 35; +7 map log), `npm run test:e2e`
  28 passed (+2 mobile-only skips), `tsc --noEmit` clean, `vite build` clean.
  Browser-checked: title MAP LOG under ENTER THE MAZE, quit records QUIT,
  PLAY starts the same seed; 390×844 title panel still fits.
- Deploy Preview (PR #3): https://deploy-preview-3--seventh-gun.netlify.app
  — verified in a real browser: title has MAP LOG, quit records QUIT,
  PLAY starts `preview-log`, mobile 390×844 panel fits. Production URL
  is unchanged until this merges.

## Verified this session (final pass)

- Dead code removed after review (unused gun light, door-mesh updater,
  renderer debug helpers, empty FX stub, unused texture entries); suites
  re-run green.
- Visual acceptance (screenshots of the running game): AI-vision pass on
  world/HUD/pistol/husk/slab/wisp/decorations + pixel-metric pass on the
  rest (see TESTING.md for the numbers and method).

## Bugfix history worth remembering

- Wisps (flying enemies) were almost unhittable with anything but splash
  weapons: enemies have no y in the sim, and both player-damage checks
  (hitscan gate and projectile gate in `sim.ts`) put every enemy's hittable
  band at y 0.1..height+pad — at the floor — while the wisp's body renders
  (and shoots from) `hoverY = 2.3`. Aiming at the visible body passed ~1–2u
  above the hitbox; grenades "worked" because splash measures horizontal
  distance only. Fix: offset both vertical gates (and the `hitEnemy` FX y)
  by `hoverY` for `flying` defs. Unit regression: hitscan/nail through the
  body height must connect, through the old floor band must not.
- Enemies appeared sideways / half sunk in the floor on the *second* play
  of a map: `EnemyRenderer` rigs are keyed by enemy id, and ids restart at 0
  for every generated map, so `setRun`'s id-diff reused the previous run's
  rigs — complete with the death animation's fallen-over `rotation.x`,
  faded shadow and blackened eyes (never reset on the alive path). Fix:
  `setRun` now disposes all rigs (like pickups already did) so every run
  builds fresh ones. E2E regression: kill 3, replay seed, assert every rig
  `rotX == 0` (verified to fail pre-fix).
- Floor rendered the sky (culled back faces) → up-facing winding +
  DoubleSide insurance.
- Doors/decals/seal were 90° off → per-axis slab dims, decal facings from
  plane-normal math, seal axis derived from the arena edge.
- Spawn-safety LOS in mapgen now uses exact grid DDA (the old 0.5u sampler
  could miss a clipped wall corner on diagonals; the 300-seed sweep caught
  it when GEN_VERSION bumped 3→4).

## Map log (PR 1)

Players can reopen seeds they already ran without writing the code down.

- Persistence: `src/app/mapLog.ts`, localStorage key `seventh-gun.maplog`.
  Cap 200, newest-first, fail soft on quota. Never imported from `src/sim/`.
- Record: `{ seed, difficulty, startedAt, genVersion, outcome?, durationSec?, kills? }`.
  `startRun` prepends; death / win / quit-to-title patches the latest
  matching seed+startedAt. Loader ignores unknown fields.
- Title: **MAP LOG** under **ENTER THE MAZE** (same `button.big` tap size,
  wrapped in `.row` so the 390×844 panel still fits). Panel lists seed,
  relative time, skill, outcome badge (`—` / `DIED` / `WON` / `QUIT`).
  Click/PLAY fills seed+difficulty and starts; copy seed is secondary.
  If `genVersion !== GEN_VERSION`, warn “generator changed — layout may differ”
  but still allow play.
- Maze mode is unchanged (still seed-based). Campaign/editor runs are not
  logged (those modes do not exist yet). `GEN_VERSION` was not bumped.

## Authored maps (PR 2)

Shareable compact maps, no campaign/editor yet.

- Layers: `MapBlueprint` → `compileBlueprint` → `GameMap`. Sim consumes
  `GameMap` only. Maze `generateMap(seed)` is unchanged (`GEN_VERSION` still 4).
- Codec: `src/sim/mapcodec.ts`, prefix `SGMAP.v1.`, version `MAP_CODEC_VERSION = 1`.
  Share URLs: `https://<origin>/#m=SGMAP.v1.<payload>` (hash, not query).
  `#m=` wins over `?seed=`. Cosmetics (lights/decors) are stripped from share
  URLs and regenerated via `placeCosmetics(makeRng('cos|' + cosmeticSeed))`.
  Browser compresses with `CompressionStream('deflate-raw')` when the packed
  body is > 1200 bytes; Node tests use `zlib.deflateRawSync`. Missing
  CompressionStream → uncompressed (flag off).
- `Sim.fromMap(map, difficulty, opts?)`. Enemy rng keys `enemy|${rngKey}|${id}`
  (`rngKey` defaults to `map.seed` or `'authored'`). No `GEN_VERSION` in
  authored keys. Difficulty only scales combat numbers, not entity counts.
  `checkPickups` uses `map.sealBreak` (`{type:'gun',gun}` or `{type:'key'}`).
  Generated mazes set `sealBreak: { type:'gun', gun:7 }`.
- Victory/death for a URL map: **RETRY MAP** / **TITLE** + **COPY LINK**.
  Debug API (`?e2e=1`): `startMap(blueprint | code)`.
- Authored runs are not written to the map log.
- Do not bump `GEN_VERSION` for this work.

## Open / next

- PR 3–4 from `docs/brainstorm/grok-plan.md` (campaign, editor).
- Balance is first-pass from the economy tests; needs a human Normal run
  against the 20–30 min target, then tune `src/sim/{weapons,enemyTypes,
  difficulty}.ts` (mirror in GAME-DESIGN.md).
- Optional: CI workflow running both suites per PR; phone perf check
  during the arena wave.

## Where things are

- Balance numbers: `src/sim/{weapons,enemyTypes,difficulty}.ts` + GAME-DESIGN.md
- Generator: `src/sim/mapgen.ts` (bump `GEN_VERSION` on any change)
- Map log: `src/app/mapLog.ts` + title wiring in `src/ui/screens.ts` / `src/app/game.ts`
- Debug API: `src/app/game.ts getDebugApi()` — `?e2e=1` only
