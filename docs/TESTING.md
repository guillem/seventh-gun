# TESTING

## Unit (vitest, `npm test`)

- `tests/unit/mapgen.test.ts` — 300-seed sweep: connectivity, guns ordered
  along the route, nothing essential behind the key door, key-before-lock,
  safe spawn (distance + no LOS + nothing wakes in 2s), door counts,
  courtyards/rooms/loot present, ammo economy ≥ 2.2× enemy HP, seed
  reproducibility, layout identical across difficulties.
- `tests/unit/weapons.test.ts` — personality contract: pistol accuracy,
  shotgun pellet scatter + falloff, chaingun bloom, projectile identity
  (nails straight/fast, grenades arc), rail pierce, Seventh multi-kill splash,
  power ladder, dry-fire no-spam, starting stacks.
- `tests/unit/sim.test.ts` — difficulty multipliers, determinism (snapshot
  equality over scripted input), wake conditions, no attacks through closed
  doors, dodgeable projectiles, death lockout, win path.
- `tests/unit/architecture.test.ts` — sim stays headless: no three imports,
  no Math.random, no DOM/window/localStorage, no imports from render/ui.

E2E specs are excluded from vitest (see `vitest.config.ts`).

## E2E (playwright, `npm run test:e2e`)

Projects: `desktop` (chromium 1280×800) and `mobile` (chromium 390×844,
touch). The config builds and serves `dist/` via `vite preview` itself.

Covered: boot to title, start run, WASD walking (camera-relative), fire +
ammo decrease, dry-fire no-spam, gun pickup grants gun + stack, medikit
heals, death lockout then title with Retry Seed / New Maze, win copy
"GAME OVER / You won", difficulty economy (same layout, different counts),
seed reproducibility (map hash), Tab map open/close with fog of war, E opens
a door, mobile touch HUD with ≥44px FIRE button, FIRE latches and unlatches.

Rules honored: never drive pointer lock with synthetic mousemove — everything
goes through `window.__GAME__` (only present with `?e2e=1`; production
builds don't advertise it).

## Visual review (done before calling this done)

Method: run the built game in a real browser, `?e2e=1` debug API poses the
scene (`pose`, `snapshot` returns a composited JPEG), plus real DOM
screenshots for screens/touch UI.

- AI-vision pass (before the analyzer went down): world/HUD/lighting,
  pistol viewmodel (hands visible, muzzle flash, crosshair clear), husk
  (proper 3D zombie, face forward), slab (hulking 3D brute), wisp (glowing
  hovering creature), wall decorations (skull + rune decals on panels).
- Pixel-metric pass (analyzer outage fallback, `PIL`):
  - crosshair clearance, all 7 guns: ≤1.3% non-background px in the 88px
    center disc (excluding the crosshair strokes themselves);
  - muzzle flash, all 7 guns: idle-vs-fire diff regions 36–60k px with
    per-gun magnitude ordering (pistol small, shotgun/Seventh huge);
  - crawler: silhouette spans 100% of the pose region (legs reach floor);
  - door: glowing rune ring ≈3.2k orange px; pedestal: cyan rim ≈320 px;
  - mobile portrait: HUD band present, hFOV not a slit (29 edge columns in
    a mid band), FIRE button ≈6.7k dark-red px.

Re-run the aesthetic eyeball pass on the Netlify deploy preview; the metrics
prove presence/clearance, not beauty.
