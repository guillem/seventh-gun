# STATUS

Updated: 2026-09-02 — experimental PBR look-dev on `feat/lookdev-pbr`. **DO NOT MERGE. Not shipping.**

GEN_VERSION still 4. Mapgen, codec, gameplay, input, collisions, physics, campaign, secrets, editor untouched.

## State: experimental look-dev (pass 1)

World floors/walls/ceilings and wall-textured secret plates use `MeshStandardMaterial` with existing canvas albedo + procedural roughness. Vertex `bakeColor` is off so it cannot fight real lights. Dim hemisphere/ambient fill + up to 8 overhead `PointLight`s from existing `RoomLight` positions (cool-biased, 0–1 shadow caster; shadows off in `?e2e=1`). Maze vs campaign keep their albedo packs; roughness scalars differ per theme.

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
