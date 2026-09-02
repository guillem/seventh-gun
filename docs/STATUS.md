# STATUS

Updated: 2026-09-02 — PR: campaign-only texture packs and extra artwork
(`feat/campaign-art`, #10). Do not merge from this agent.

Opus packs from `feat/campaign-art-textures` (#11) replaced the stubs.
`npx tsc --noEmit` clean. `npm test` 110/110. Existing e2e 55 passed / 3 skipped.
`GEN_VERSION` still 4. Maze stays on `getTextures()`.

## State: Opus packs + extra / hero placement

Maze / `#m=` / editor playtest still use the shared four-theme atlas
(`getTextures()`). Campaign runs swap walls/floors/ceilings/door (and pit
sky) for `getCampaignTextures(artId)` and place extra decals / cheap
meshes from that pack's `extraDecals`. Hero plates come from
`getCampaignHeroDecals()` / `CAMPAIGN_HERO_MARKERS` (29 ClampToEdge
256/512 paintings), placed from each plate's `hint`.
`GEN_VERSION` is still 4. The seven JSON maps were not rewritten.

- Repo: https://github.com/guillem/seventh-gun (`main`).
- Netlify: LIVE at https://seventh-gun.netlify.app
- Texture API: `src/render/campaignTextures.ts` (Opus painted generators).
  Public: `CAMPAIGN_ART_IDS`, `campaignArtIdFromIndex`,
  `campaignArtIdFromSeed`, `getCampaignTextures`, `getCampaignHeroDecals`,
  `CAMPAIGN_HERO_MARKERS`, `CAMPAIGN_PACK_MARKERS`.
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
| 1 | foundry | furnace stencil, pour ladle, heat warning, hanging chains |
| 2 | gullet | sphincter / tooth / drip, hanging flaps |
| 3 | catacombs | epitaphs, ossuary shelves, bone cross |
| 4 | pit | rim rust, outdoor crane/hazard floors, indoor chains + ochre sky |
| 5 | spire | visor glow, floor numerals, dish banners |
| 6 | ward | biohazard, cot stencil, key-sigil lamps |
| 7 | sanctum | saint-marks, gun-7 veils, heptagram floor |

Hero hints drive placement (arena-back-wall, pit-floor-idol, apse-altar, …).
Debug (`?e2e=1`) campaign state includes `artId`.

## Open / next

- Balance still wants a human Normal run against the maze 20–30 min target.
- PR #11 can close once this branch carries the painted file.

## Where things are

- Balance numbers: `src/sim/{weapons,enemyTypes,difficulty}.ts` + GAME-DESIGN.md
- Generator: `src/sim/mapgen.ts` (bump `GEN_VERSION` on any change)
- Campaign: `src/campaign/` + `src/app/campaignProgress.ts`
- Campaign art: `src/render/campaignTextures.ts` + `src/render/campaignDecor.ts`
  (hooked from `world.ts` / `renderer.ts` / `game.ts`)
- Map log: `src/app/mapLog.ts` + title wiring in `src/ui/screens.ts` / `src/app/game.ts`
- Editor: `src/editor/{model,view,library}.ts` — title EDITOR / `?edit=1`
- Debug API: `src/app/game.ts getDebugApi()` — `?e2e=1` only
