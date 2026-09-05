# ROADMAP

## M1 — foundation (done)
- Repo scaffold, Vite+TS+Three, netlify config, docs.
- Deterministic sim: seeded mapgen (spine+spurs+arena+seal+key vault),
  7 weapons, 5 enemy types, AI (sight/hearing/proximity, doors block LOS),
  projectiles/splash, pickups, win/lose, difficulty table.
- Unit tests: 300-seed mapgen sweep, weapon personalities, determinism,
  architecture guards.

## M2 — playable slice (done)
- Renderer: procedural textures (4 themes), merged world mesh with baked
  vertex light, doors, seal, decorations, sky.
- Enemy meshes with walk/attack/pain/death animation + blob shadows.
- HUD (health bar, ammo, 7-slot strip), minimap, fog-of-war full map.
- Title/pause/death/victory screens; pointer lock; WASD; E; wheel/1-7.
- Synth audio: per-gun SFX, enemy voices, stings, ambient drone.

## M3 — polish + ship (done — initial version)
- Viewmodel pass: 7 silhouettes, muzzle FX, crosshair clearance verified.
- Touch controls + portrait FOV; mobile Playwright project.
- E2E green; visual review (AI-vision + pixel metrics); bugfix pass
  (floor winding, door slab axis, decal facings, seal axis); docs.
- First version pushed to `main` at github.com/guillem/seventh-gun.

## Map log (PR 1)

Title-screen **MAP LOG**: localStorage history of maze seeds already played.
See `docs/STATUS.md`.

## Authored map codec (PR 2)

Blueprint format, `compileBlueprint`, `Sim.fromMap`, `#m=` URL loader,
cosmetic regen.

## Campaign (PR 3)

Title **CAMPAIGN**: seven named map buttons with unlock-after-win,
persistent guns/ammo, intermissions, continue key `seventh-gun.campaign`.

## Level editor (PR 4)

Title **EDITOR** / `?edit=1`: 2D authoring of a `MapBlueprint`, library in
`seventh-gun.mymaps`, URL/code/file export.

## Campaign artwork (PR 5)

Campaign-only texture packs + extra artwork: painted generators
(`campaignTextures.ts`) + extra/hero placement (`campaignDecor.ts`), placed
from room kinds. Maze `textures.ts` untouched; maze / `#m=` keep the four
shared themes.

## Enemy feel (PR 6)

Living enemies are solid cylinders (ragdolls are not), gunshots and
death-cries stay audible for `NOISE_TTL`, and the campaign-only Fiend.
`GEN_VERSION` unchanged.

## Enemy skins + projectile sprites (PR 7)

Richer per-species skins in `textures.ts`; bolt/orb sprites in
`projectiles.ts`.

## 3D cylinder hitscan (PR 8)

`raycastCylinder` in `physics.ts`; hitscan and player projectiles sweep a
real XZ-circle × Y-slab volume so look-down shots on a close crawler connect.

## Arena v1 (done)

Global 10-player deathmatch on Cloudflare Workers + one Durable Object.
Server-authoritative `ArenaSim`, 96×96 generator, client prediction.
Reliability and presentation repairs are tracked in REPAIR-PLAN.md.
Netlify remains a static mirror; lag compensation is optional future work.

## Next (ideas, not committed)
- Human playtest on Normal against the 20–30 min target; tune from
  `docs/GAME-DESIGN.md` numbers.
- Arena: lag compensation, spawn-distance feel, pad pacing with 2–3 players.

## Secrets v1 (campaign)

15 authored pockets, four plate/remote kinds, WARD/WRATH/SEVENFOLD
powerups, fog leak closed. Maze mode unchanged (`GEN_VERSION` 4).
