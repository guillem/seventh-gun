# STATUS

Updated: 2026-09-02 -- PR: fog / sky / wall-decal clamp. Do not merge from this agent.

GEN_VERSION still 4. Mapgen shuffle untouched.

## State: three live-playtest visual bugs (THE SPIRE)

### 1. Hero / extra decals hanging past the wall corner (P1)

A large grey+orange circuit-eye painting floated past the wall into empty space. planCampaignExtras and planHeroPlacements now clamp both width and height to the contiguous wall face (wallFaceExtent + clampToWallFace): inset from corners, below CEIL_H, above the floor. A thin corridor shrinks the quad instead of letting it hang.

### 2. Depth fog (P1)

THREE.Fog uses camera-Z, so the hallway center went black while wall/ceiling corners stayed bright, and a sideways glance un-hid distant enemies. applyRadialFog rewrites fog depth to radial length on world, enemy, and decal materials that use scene.fog. Near/far and campaign fog colors are unchanged (maze and campaign).

### 3. Sky black arch / black bands (P1)

SphereGeometry(380) plus a poorly wrapped sky looked like a small painted disc on a huge canvas (black bands) and clipped at the map edge (black horizon arch). Sky canvases fill the full 512 square, wrap is ClampToEdge, fog:false stays, and the dome follows the camera so the far hemisphere never crosses camera.far.

## Open / next

- Balance still wants a human Normal run against the maze 20-30 min target.
- Human playtest of this PR on the Netlify preview (do not merge).

## Where things are

- Balance numbers: src/sim weapons, enemyTypes, difficulty + GAME-DESIGN.md
- Generator: src/sim/mapgen.ts (bump GEN_VERSION on any change)
- Campaign: src/campaign/ + src/app/campaignProgress.ts
- Campaign art: src/render/campaignTextures.ts + src/render/campaignDecor.ts
- Radial fog: src/render/radialFog.ts
- Enemy skins: src/render/textures.ts; bolt sprites: src/render/projectiles.ts
- Enemy meshes: src/render/enemies.ts + src/sim physics/sim/enemyTypes
- Map log: src/app/mapLog.ts + title wiring in screens.ts / game.ts
- Editor: src/editor -- title EDITOR / ?edit=1
- Debug API: src/app/game.ts getDebugApi() -- ?e2e=1 only
