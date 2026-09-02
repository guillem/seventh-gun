# STATUS

Updated: 2026-09-02 — PR: playtest fixes (look-down aim sign, crawler
loft, spire, HUD, editor COPY LINK). Do not merge from this agent.

`npx tsc --noEmit` clean. `npm test` 173/173. `npm run test:e2e` 71 passed / 3 skipped.
`GEN_VERSION` still 4. Crawler look / AI / combat stats unchanged.

## State: four live-playtest bugs

### 1. Point-blank crawler miss (P0) — second live fail

Fourth live pass: pitch IS in sim (player.pitch === camera.rotation.x
=== +0.384 after “look-down 22°”). The shot still missed: crawler
(15, 67.8) from player (15, 71), hp 18→18, ammo 300→299.

`dirY = +sin(pitch)` aims **up**. A look-down of +22° must be
`dirY = −sin(pitch)` so the ray is at y≈0.5 at t=3.2 (inside the body).
`getWorldDirection()` follows Three.js (+X looks up) and agreed with
the bad sign. Euler XYZ vs YXZ is a wash at yaw 0.

Gun test only:

- `aimDirFromLook`: +pitch = look-down, `dirY = −sin(pitch)`.
- Camera stores `rotation.order = 'YXZ'` and `rotation.x = −pitch`.
- `debugInfo.lastAimDir` {dirX,dirY,dirZ,at32y,toCrawler} on fire.
- E2E: `pose` + `look(0, 22)` + InputManager `mousedown` asserts
  crawler hp dropped and `lastAimDir.dirY < 0`.

### 2. Spire art (P1) — playtest PASS

`getCampaignTextures('spire')` read as maze-tech (orange circuit traces,
mesh ceiling, purple 7-seg door). Repainted wall/floor/ceiling/door/decals
as cold stone/copper ascent (ashlar masonry, elevation marks, copper
weather strap, antenna lattice in a stone window). Maze `textures.ts`
untouched. Marker `masonry-copper-ascent`. One-line lighting: spire fog /
ambient / door emissive / dish banner were purple — now cold stone/copper.

### 3. HUD leak (P1) — playtest PASS

Quit to title left HEALTH / bullets / minimap drawing because `hud.draw`
ran whenever phase was not `editing`, and `toTitle` re-showed the
minimap canvas. Hide in-game HUD whenever phase is not playing / map /
paused (title, maplog, campaign, editor, dead, won). Sim is kept for
retry; it is not stepped or drawn as in-game. Campaign SKILL still does
not start a maze (`onSkillClick` host `diff-row` + `runKind==='maze'`).

### 4. Editor COPY LINK (P1) — playtest PASS

VALIDATE errors blocked COPY LINK / COPY CODE / DOWNLOAD. PLAYTEST still
uses `blocked()`. Share/export emit `#m=` / `SGMAP` for the current
blueprint; toast warns if the map has errors. Unit + e2e: START-only
editor encodes `SGMAP.v1.` / `#m=`.

## Open / next

- Balance still wants a human Normal run against the maze 20–30 min target.
- Human playtest of this PR on the Netlify preview (do not merge).

## Where things are

- Balance numbers: `src/sim/{weapons,enemyTypes,difficulty}.ts` + GAME-DESIGN.md
- Generator: `src/sim/mapgen.ts` (bump `GEN_VERSION` on any change)
- Campaign: `src/campaign/` + `src/app/campaignProgress.ts`
- Campaign art: `src/render/campaignTextures.ts` + `src/render/campaignDecor.ts`
  (hooked from `world.ts` / `renderer.ts` / `game.ts`; campaign-only)
- Enemy skins: `src/render/textures.ts`; bolt sprites: `src/render/projectiles.ts`
- Enemy meshes / collision: `src/render/enemies.ts` + `src/sim/{physics,sim,enemyTypes}.ts`
- Map log: `src/app/mapLog.ts` + title wiring in `src/ui/screens.ts` / `src/app/game.ts`
- Editor: `src/editor/{model,view,library}.ts` — title EDITOR / `?edit=1`
- Debug API: `src/app/game.ts getDebugApi()` — `?e2e=1` only
