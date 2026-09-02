# STATUS

Updated: 2026-09-02 — PR: campaign-only texture packs and extra artwork
(`feat/campaign-art`, #10). Do not merge from this agent.

Painted packs + hero plates taken from `feat/campaign-art-textures`.
`GEN_VERSION` still 4. Maze stays on `getTextures()`.

## State: campaign art hook + optional hero decals

Maze / `#m=` / editor playtest still use the shared four-theme atlas
(`getTextures()`). Campaign runs swap walls/floors/ceilings/door (and pit
sky) for `getCampaignTextures(artId)` and place extra decals / cheap
meshes. Optional `heroDecals` (pack field or sibling `CAMPAIGN_HERO_DECALS`)
place **one** prominent ClampToEdge quad per campaign map (arena back wall,
pit rim, sanctum apse). Empty list → no extra hero; shipped painters from
`getCampaignHeroDecals()` fill the plates.
`GEN_VERSION` is still 4. The seven JSON maps were not rewritten.

- Repo: https://github.com/guillem/seventh-gun (`main`).
- Netlify: LIVE at https://seventh-gun.netlify.app
- Texture API lives in `src/render/campaignTextures.ts` — painted packs
  taken from `origin/feat/campaign-art-textures` (not the tint stubs).
  Extra placement is renderer-side only (`src/render/campaignDecor.ts`).
  `getCampaignHeroDecals()` / optional `heroDecals` hang one ClampToEdge
  plate per map (furnace mouth, pit rim, sanctum apse). Maze stays on
  `getTextures()`.
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

Hero default without `hint`: pit → pit-rim, sanctum → sanctum-apse,
else arena-back. Debug (`?e2e=1`) campaign state includes `artId`.

## Open / next

- Opus painters are in `campaignTextures.ts` (from `feat/campaign-art-textures`).
  Keep `CAMPAIGN_ART_IDS`, `campaignArtIdFromIndex`, `getCampaignTextures`,
  `getCampaignHeroDecals` / optional `heroDecals`, and extraDecal ids.
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
