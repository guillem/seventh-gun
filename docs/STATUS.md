# STATUS

Updated: 2026-09-02 -- secrets v1 on `feat/secrets`. Do not merge from this agent.

GEN_VERSION still 4. Mapgen shuffle untouched. Maze `generateMap` places no secrets.

## State: campaign secrets v1

Fifteen authored secret rooms across the seven campaign maps (2 / 2 / 2 / 2 / 2 / 2 / 3). Four kinds: plate-use, plate-shoot, remote-use, remote-shoot. Plates are 3-cell WALL-textured slabs; found = true the frame they start opening (0.7s slide). Enemies never open them.

Powerups: WARD 10s (incoming 0, #38C8FF), WRATH 20s (outgoing ×3, #A24BFF), SEVENFOLD 7s (outgoing ×7, #4DFF9B, Sanctum choir only). Two tracks; WARD+WRATH stack; damage track newest wins; not carried between maps.

Fog: `secretCell` mask so unfound secret cells are never explored; `exploredPct` excludes secret cells forever. Pre-secret lights/decors hashes frozen via public-grid cosmetics snapshot.

Codec: `FLAG_SECRETS` (1<<6) after lights. `ROOM_KINDS` secret = 6, `PICKUP_KINDS` powerup = 4. Old SGMAP.v1 still decodes.

## Open / next

- Human playtest of secret hints (crack vs lever vs sigil) on a Deploy Preview.
- Balance still wants a human Normal run against the maze 20-30 min target.

## Where things are

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
