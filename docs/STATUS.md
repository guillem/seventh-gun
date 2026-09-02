# STATUS

Updated: 2026-09-02 — experimental PBR look-dev pass 3 on `feat/lookdev-pbr`. **DO NOT MERGE. Not shipping.**

GEN_VERSION still 4. Mapgen, codec, gameplay, input, collisions, physics, campaign, secrets, editor untouched.

## State: experimental look-dev (pass 3 — richer canvases, still experimental)

Playtest of pass 2: canvases still felt cheap (512 nearest-upsample of 128 plus one overlay). Pass 3 keeps the matte PBR / fill lighting and paints denser albedo.

World floors/walls/ceilings compose in 128-space onto **1024** hero canvases (`composeCanvas`, nearest scale, not bilinear blur), then a multi-layer wear pass: grout/seams, per-tile hue jitter, corner dirt, edge wear, theme-tinted micro-stains, value noise, wrap-safe scratches. Roughness/bump maps are 256 with grout, pits, and hairline scratches — still matte, metalness unchanged. Campaign extra decals grain-upscale to 512; hero plates to 1024. RepeatWrapping and world UVs unchanged.

Emissive FX, sky, seal, lamp decals, additive cracks stay Basic. Enemies/pickups that would go black under PBR use Standard; eyes/glows stay Basic.

This is lighting/material quality only. No subway set dressing, no heavy post, no WebGPU, no sim refactors.

## Open / next

- Human look-dev on a Deploy Preview (Foundry → Sanctum + maze).
- Do **not** merge until look is signed off; keep this experimental.
- Secret-hint playtest and Normal maze balance still outstanding from secrets v1.

## Where things are

- Look-dev PBR: src/render/world.ts, renderer.ts, textures.ts, campaignTextures.ts, campaignDecor.ts (shelves); enemies/pickups materials only
- Balance numbers: src/sim weapons, enemyTypes, difficulty, powerups + GAME-DESIGN.md
- Generator: src/sim/mapgen.ts (bump GEN_VERSION on any change)
- Secrets: src/sim/powerups.ts + GameMap.secrets; authored in src/campaign/maps/*.json
- Campaign: src/campaign/ + src/app/campaignProgress.ts
- Campaign art: src/render/campaignTextures.ts + src/render/campaignDecor.ts
- Radial fog: src/render/radialFog.ts
- HUD layout: src/ui/hud.ts `hudPanelLayout` + powerup vignette/ring/badge
- Enemy skins: src/render/textures.ts; bolt sprites: src/render/projectiles.ts
- Enemy meshes: src/render/enemies.ts + src/sim physics/sim/enemyTypes
- Map log: src/app/mapLog.ts + title wiring in screens.ts / game.ts
- Editor: src/editor -- title EDITOR / ?edit=1
- Debug API: src/app/game.ts getDebugApi() -- ?e2e=1 only (`secretsFound`, `powerups`)
