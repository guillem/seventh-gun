# STATUS

Updated: 2026-09-02 — PR: campaign-only texture packs and extra artwork
(`feat/campaign-art`). Do not merge from this agent.

## State: campaign art hook on top of campaign + editor

Maze / `#m=` / editor playtest still use the shared four-theme atlas
(`getTextures()`). Campaign runs swap walls/floors/ceilings/door (and pit
sky) for `getCampaignTextures(artId)` and place extra decals / cheap
meshes. `GEN_VERSION` is still 4. The seven JSON maps were not rewritten.

- Repo: https://github.com/guillem/seventh-gun (`main`).
- Netlify: LIVE at https://seventh-gun.netlify.app
- Texture API lives in `src/render/campaignTextures.ts` (Opus owns the
  painted 128px generators). This PR ships distinguishable tint/contrast
  stubs plus `OPUS` TODOs so the hook can land first. If that file already
  has real generators, do not replace them with stubs.
- Extra placement is renderer-side only (`src/render/campaignDecor.ts`),
  driven by map index + `GameMap` room kinds. Nothing is added to
  `generateMap` or `GameMap.decors`.
- Detection: `game.ts` passes `campaignArtIdFromIndex(n)` on campaign
  `setRun`; `buildWorld` also accepts `GameMap.seed` like
  `campaign:01-foundry` / `campaign:03`. Maze seeds never match.
- Texture libs are cached (same pattern as `getTextures()`). No new npm
  deps, no PNG/webp, no sim localStorage, pointer lock unchanged.

## Campaign art packs (1–7)

| # | Art id | Extra vocabulary (placement, not JSON) |
|---|---|---|
| 1 | foundry | furnace decals, slag glow, hanging chains |
| 2 | gullet | membrane / tooth decals, drip glow, hanging flaps |
| 3 | catacombs | epitaphs, ossuary shelves, femur decals |
| 4 | pit | rust decals, outdoor grate/acid floors, indoor chains + sky |
| 5 | spire | window glow, brass decals, banners |
| 6 | ward | charts, restraints, clinical lamp strips |
| 7 | sanctum | relics, veils, arena/ante sigil floor |

Debug (`?e2e=1`) campaign state now includes `artId`.

## Open / next

- Opus (or a follow-up) replaces the stub painters in
  `campaignTextures.ts`. Keep `CAMPAIGN_ART_IDS`,
  `campaignArtIdFromIndex`, `getCampaignTextures`, and the extraDecal
  `id`s in `CAMPAIGN_DECAL_IDS`.
- Balance still wants a human Normal run against the maze 20–30 min target.

## Where things are

- Balance numbers: `src/sim/{weapons,enemyTypes,difficulty}.ts` + GAME-DESIGN.md
- Generator: `src/sim/mapgen.ts` (bump `GEN_VERSION` on any change)
- Campaign: `src/campaign/` + `src/app/campaignProgress.ts`
- Campaign art: `src/render/campaignTextures.ts` + `src/render/campaignDecor.ts`
  (hooked from `world.ts` / `renderer.ts` / `game.ts`)
- Map log: `src/app/mapLog.ts` + title wiring in `src/ui/screens.ts` / `src/app/game.ts`
- Editor: `src/editor/{model,view,library}.ts` — title EDITOR / `?edit=1`
- Debug API: `src/app/game.ts getDebugApi()` — `?e2e=1` only
