# STATUS

Updated: 2026-09-02 — PR: playtest fixes (camera-aim fire, crawler loft,
spire masonry, HUD leak, editor COPY LINK). Do not merge from this agent.

`GEN_VERSION` still 4. Crawler look / AI / combat stats unchanged.

## State: four live-playtest bugs

### 1. Point-blank crawler miss (P0) — second live fail

Third live pass still missed a **real mouse click** (fresh bundle):
dist 3.2, crawler on the floor in the lower FOV, ammo 210→209, KILLS 0,
then melee. `G.look()` + `G.shoot()` was a false green — that wrote
`player.pitch` that `fireWeapon` already used.

Real mouse look writes the **camera**. Hitscan now fires
`camera.getWorldDirection()` after `pullAimFromCamera`. Renderer no
longer slams `camera.rotation` from a stale `player.pitch`.

Gun test only (movement / AI still use `def.radius`):

- Camera is look authority (mousemove `onLook` → camera Euler).
- `sim.step` / `tryFire` take optional `aimDir` from the camera.
- Close-range grounded loft to `PLAYER_EYE + 0.35` (dist ≤ 6u).
- E2E: pose dist 3.2, `setCameraPitch(-16)` with **player.pitch still 0**,
  canvas `mousedown` + `tickNow` (InputManager, not `look`/`shoot`).
  Second e2e: level camera + `inputFire` (lower-FOV loft).

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
