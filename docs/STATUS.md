# STATUS

Updated: 2026-09-02 — PR #13 (`feat/enemy-art`) rebased onto `origin/main`
after feel #12 merged (`3b63ea2`). Do not merge from this agent.

`npx tsc --noEmit` clean. `npm test` 137/137. `npm run test:e2e` 55 passed / 3 skipped.
`GEN_VERSION` still 4. Maze `generateMap` is unchanged (no Fiend in the maze).

## State: Opus enemy art on merged feel

Feel is on `main`: body collision, lasting gunshot wake, wisp hurtbox on
`hoverY`, plated slab mesh, campaign-only `fiend` type (Pit / Ward / Sanctum).
The old feel branch `cursor/feat-enemy-feel-07e9` may be deleted.

This branch adds art on top of that:

- Opus 128px skins for husk / slab / hierophant / fiend; crawler and wisp
  polish at 64px. `skins.fiend` feeds the feel Fiend mesh.
- `getProjectileSprite(kind)` additive bolts (plasma / spit / fireball / bolt /
  orb). Nail / grenade / voidorb meshes unchanged.
- Texture lib typing is `Record<EnemyType, THREE.Texture>`.

Rebase onto `3b63ea2` replayed only the art commit (squash tree matched the
old feel tip). Combined resolution still holds:

- `textures.ts` — Opus painters; feel’s `EnemyType` skin map; no 64px fiend stub
- `fx.ts` — art’s `buildEnergyBolt` + `getProjectileSprite` (not octahedron corona bolts)
- Feel meshes / collision / wake stay as merged on `main`

Campaign art from #10 remains on `main`: maze / `#m=` still use `getTextures()`;
campaign runs swap packs via `getCampaignTextures(artId)`.

## Open / next

- Balance still wants a human Normal run against the maze 20–30 min target.
- Do not merge this branch to main from this agent.

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
