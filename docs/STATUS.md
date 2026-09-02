# STATUS

Updated: 2026-09-02 — PR: close-range crawler hits (3D cylinder gun test).
Do not merge from this agent.

`npx tsc --noEmit` clean. `npm test` 151/151. `npm run test:e2e` 55 passed / 3 skipped.
`GEN_VERSION` still 4. Crawler look / AI / combat stats unchanged.

## State: hitscan is a real 3D cylinder test

Player report: a Crawler at the feet / hugging the body was unhittable when
looking down. Cause: `hitscanShot` took the closest XZ approach on the 3D
ray, then sampled Y there. A steep look-down puts that XZ closest point on
the floor (y below `yMin: 0.1`) even though the ray already crossed the
cylinder at chest height. `t < 0` also skipped a volume whose center sat
slightly behind the camera plane while the body was still in the reticle.

Fix (gun test, not the crawler mesh):

- `raycastCylinder` in `src/sim/physics.ts` — infinite XZ circle ∩ Y slab,
  first t ≥ 0 in [0, maxDist]. Origin-inside returns 0.
- Hitscan uses that vs `enemyVolumeY` (grounded `[0.1, height+0.15]`,
  flying centered on `hoverY`). Walls still clip via `raycastWall` maxDist.
  Pierce / falloff unchanged.
- Player projectiles sweep the same cylinder for the step segment (so a
  look-down nail cannot tunnel the same way). Enemy projectiles vs the
  player are untouched.

## Open / next

- Balance still wants a human Normal run against the maze 20–30 min target.

## Where things are

- Balance numbers: `src/sim/{weapons,enemyTypes,difficulty}.ts` + GAME-DESIGN.md
- Generator: `src/sim/mapgen.ts` (bump `GEN_VERSION` on any change)
- Campaign: `src/campaign/` + `src/app/campaignProgress.ts`
- Campaign art: `src/render/campaignTextures.ts` + `src/render/campaignDecor.ts`
  (hooked from `world.ts` / `renderer.ts` / `game.ts`)
- Enemy skins: `src/render/textures.ts`; bolt sprites: `src/render/projectiles.ts`
- Enemy meshes / collision: `src/render/enemies.ts` + `src/sim/{physics,sim,enemyTypes}.ts`
- Map log: `src/app/mapLog.ts` + title wiring in `src/ui/screens.ts` / `src/app/game.ts`
- Editor: `src/editor/{model,view,library}.ts` — title EDITOR / `?edit=1`
- Debug API: `src/app/game.ts getDebugApi()` — `?e2e=1` only
