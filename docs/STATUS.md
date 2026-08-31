# STATUS

Updated: 2026-08-31 — bugfix #2: flying enemies (wisps) carried a floor-level
hitbox, making them nearly unhittable with direct-fire weapons (PR #2, branch
`fix/wisp-hitbox-height`).

## State: initial version complete + bugfixes #1–2

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
- Suites: `npm test` 35/35, `npm run test:e2e` 26 passed (+2 mobile-only
  skips), `tsc --noEmit` clean, `vite build` clean.

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

## Open / next

- Balance is first-pass from the economy tests; needs a human Normal run
  against the 20–30 min target, then tune `src/sim/{weapons,enemyTypes,
  difficulty}.ts` (mirror in GAME-DESIGN.md).
- Optional: CI workflow running both suites per PR; phone perf check
  during the arena wave.

## Where things are

- Balance numbers: `src/sim/{weapons,enemyTypes,difficulty}.ts` + GAME-DESIGN.md
- Generator: `src/sim/mapgen.ts` (bump `GEN_VERSION` on any change)
- Debug API: `src/app/game.ts getDebugApi()` — `?e2e=1` only
