# STATUS

Updated: 2026-08-31 — geometry bugfix pass (floor/doors/decals/seal), all suites green.

## State: playable end-to-end

Start (title, seed, difficulty) → run the maze → find guns 2–7 in route
order → the Seventh shatters the arena seal → clear the arena →
GAME OVER / You won. Death: 2s lockout → title with Retry Seed / New Maze.

## Verified

- `npm test` → 32/32 (300-seed mapgen sweep, weapon personalities,
  difficulty, determinism, architecture guards).
- `npm run test:e2e` → 24 passed + 2 mobile-only skips (desktop + phone
  viewport projects): boot, WASD, fire/ammo, dry-fire, pickups, medikit,
  death lockout + retry, win copy, difficulty economy, seed reproducibility,
  Tab map, E door, touch HUD + FIRE latch.
- `tsc --noEmit` clean. `vite build` clean.
- Visual review (screenshots of the running game):
  - AI-vision verified: world/hud/lighting, pistol viewmodel (hands, muzzle,
    crosshair clear), husk, slab, wisp, wall decorations.
  - Pixel-verified (image-analyzer outage workaround): all 7 viewmodels keep
    the 88px crosshair zone clear (≤1.3% stray px); all 7 muzzle flashes
    present with distinct magnitudes (idle-vs-fire diff: 36–60k px);
    crawler silhouette spans floor-to-body (legs fixed); hierophant glow;
    door rune ring; gun-pedestal rim; mobile portrait HUD + FIRE button.

## Bugfix pass (post first playtest)

- Floor was rendering the sky dome (back-face culled quads): winding now
  faces up and floors/ceilings use DoubleSide as insurance. Pixel-verified:
  floor band mean lum 30.6 / stdev 25.8 (sky would be ~10 / ~0).
- Doors were rotated 90° (slab spanned along travel instead of across):
  swapped per-axis box dims. Frontal view now reads 34.5k rune-orange px
  (edge-on sliver before).
- Wall decorations were perpendicular fins: all four facing angles were 90°
  off; plane normal now equals (-dx,-dz) of the solid neighbor. Head-on
  checks: skull 26.9k bone px, rune 21.3k green px, lamp 2.1k warm px
  (edge-on would be ~0).
- Arena seal hardcoded the wrong axis; now derived from the matched arena
  edge. Verified spanning the corridor from both sides (724/991 px spread).
- GEN_VERSION bumped 3→4 (decor facings + seal axis are layout data).
- Spawn-safety LOS in mapgen replaced a 0.5u line sampler with exact grid
  DDA (a diagonal could clip a wall corner the sampler skipped; caught by
  the 300-seed sweep on the new version).

## Known limitations / next steps

- The external image-analyzer was down for the tail of the visual review;
  final aesthetics pass on guns 2–7/crawler/hierophant/doors used objective
  pixel metrics instead of eyeballing. Re-eyeball on the Netlify preview.
- Balance is first-pass from the economy tests; needs human playtesting on
  Normal for the 20–30 min target (currently estimated from map size).
- No remote/CI yet: repo is local-only (owner wires GitHub + Netlify;
  `netlify.toml` ready; deploy preview = thing to verify before merge).
- Perf: merged static world + instanced-ish enemies; check phone FPS during
  arena wave, drop pixel ratio if needed.

## Where things are

- Balance numbers: `src/sim/{weapons,enemyTypes,difficulty}.ts` + GAME-DESIGN.md
- Generator: `src/sim/mapgen.ts` (bump `GEN_VERSION` on any change)
- Debug API: `src/app/game.ts getDebugApi()` — `?e2e=1` only
