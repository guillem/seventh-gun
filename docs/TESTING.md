# TESTING

## Unit (vitest, `npm test`)

- `tests/unit/mapgen.test.ts` — 300-seed sweep: connectivity, guns reachable
  and ordered along the route, key-before-lock, safe spawn (distance + no LOS +
  nothing wakes in 2s), door counts, courtyards/rooms/loot present, ammo
  economy ≥ 2.2× enemy HP, seed reproducibility, layout identical across
  difficulties.
- `tests/unit/weapons.test.ts` — personality contract: pistol accuracy,
  shotgun pellet scatter + falloff, chaingun bloom, projectile identity
  (nails straight/fast, grenades arc), rail pierce, Seventh multi-kill splash,
  power ladder, dry-fire no-spam, starting stacks.
- `tests/unit/sim.test.ts` — difficulty multipliers, determinism (snapshot
  equality over scripted input), wake conditions, no attacks through closed
  doors, dodgeable projectiles, death lockout, win path.
- `tests/unit/architecture.test.ts` — sim stays headless: no three imports,
  no Math.random, no DOM/window/localStorage, no imports from render/ui.

## E2E (playwright, `npm run test:e2e`)

Projects: `desktop` (chromium 1280×800) and `mobile` (chromium 390×844,
touch). Config builds and serves `dist/` via `vite preview`.

Covered: boot to title, start run, movement via real key events + debug
teleport, fire/ammo decrease, pickup grants gun+ammo, death lockout then
title, win copy "GAME OVER / You won", difficulty economy, seed
reproducibility (map hash), mobile HUD presence + fire button.

Rules: never drive pointer lock with synthetic mousemove; use
`window.__GAME__` (only with `?e2e=1`).

## Manual / visual review (mandatory before calling done)

Screenshots of: gameplay corridor + room, all 7 viewmodels (idle+firing),
muzzle flash per gun, each enemy type from 2+ angles, door closed/open,
decorations, pickups, HUD, mobile viewport. Fix anything that reads as
primitives/paper/side-on flash before shipping.
