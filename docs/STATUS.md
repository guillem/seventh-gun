# STATUS

Updated: 2026-09-02 -- PR 18 follow-up: real radial fog + HUD health-bar clamp. Do not merge from this agent.

GEN_VERSION still 4. Mapgen shuffle untouched.

## State: playtest of deploy-preview-18 (Foundry fog + HUD)

### 1. Depth fog was still camera-Z (P0)

Looking down a Foundry corridor from a fixed spot went solid black; looking sideways from the same spot showed the far wall and markings. The first PR18 `applyRadialFog` replace of `vFogDepth = - mvPosition.z;` never ran in production.

three.js r171 (`node_modules/three`) stock `fog_vertex` IS that assignment, but `onBeforeCompile` receives ShaderLib sources with `#include <fog_vertex>` still unresolved — WebGLProgram expands chunks after the callback. The unit test only fed a fake already-expanded string.

Fix: `installRadialFog` patches `ShaderChunk.fog_vertex` to `length( mvPosition.xyz )` at import (every fog-using program: Basic/Lambert/Phong/Standard/Sprite/…). `rewriteFogVertexShader` also injects after the include and regex-replaces the assignment (`vFogDepth` / `fogDepth`, spacing). `applyRadialFog` sets `needsUpdate` + `customProgramCacheKey` so programs recompile. Wired on world / enemies / campaign decals / pickups / fx / scene traverse, including clones and late-created meshes.

Near/far and campaign fog colors unchanged.

### 2. HUD health bar overlapped gun slot 1 (P2)

`barW = panelW * 0.2` starting at `panelX + 22 + panelW * 0.09` always overran the centered 7-slot strip by 22px. `hudPanelLayout` stops the bar `HUD_HEALTH_SLOT_GAP` before slot 1. HEALTH number, ammo, and slots unchanged.

### Still in this PR (from first commit)

Hero/extra decals clamp to the contiguous wall face. Sky canvas fills the dome, ClampToEdge, follows the camera.

## Open / next

- Balance still wants a human Normal run against the maze 20-30 min target.
- Human playtest of this PR on the Netlify preview (do not merge). Confirm hallway fog is the same looking down vs sideways.

## Where things are

- Balance numbers: src/sim weapons, enemyTypes, difficulty + GAME-DESIGN.md
- Generator: src/sim/mapgen.ts (bump GEN_VERSION on any change)
- Campaign: src/campaign/ + src/app/campaignProgress.ts
- Campaign art: src/render/campaignTextures.ts + src/render/campaignDecor.ts
- Radial fog: src/render/radialFog.ts
- HUD layout: src/ui/hud.ts `hudPanelLayout`
- Enemy skins: src/render/textures.ts; bolt sprites: src/render/projectiles.ts
- Enemy meshes: src/render/enemies.ts + src/sim physics/sim/enemyTypes
- Map log: src/app/mapLog.ts + title wiring in screens.ts / game.ts
- Editor: src/editor -- title EDITOR / ?edit=1
- Debug API: src/app/game.ts getDebugApi() -- ?e2e=1 only
