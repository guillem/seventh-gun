# STATUS

Updated: 2026-09-02 — PR: playtest fixes (crawler close-range loft, spire
masonry, HUD leak, editor COPY LINK). Do not merge from this agent.

`GEN_VERSION` still 4. Crawler look / AI / combat stats unchanged.

## State: four live-playtest bugs

### 1. Point-blank crawler miss (P0) — second live fail

First preview still missed: pose dist 3.2, look down, real click, ammo
210→209, KILLS 0, HP 100→90. Same at pitch 16 and 8. The radius bump
(0.95) was not enough.

Causes that remain after the disc bump:

- A level / shallow look-down (pitch 0 / −8°) at 3.2u flies over visual
  `yMax` ~1.15 while the crawler fills the lower 75° FOV (crosshair on
  the wall above it). Playtesters click “at” the on-screen body.
- Steep look-down at the wall–floor junction (the attached shots):
  floor-plane clip (`tFloor` before cylinder enter past ~39°) ate the
  shot. Grounded bodies sit on that floor.
- `pose()` froze the sim, so look + click did not reach `step` until
  unfreeze (pitchDelta dump / melee).

Gun test only (movement / AI still use `def.radius`):

- `enemyGunRadius` crawler disc 1.1u.
- `enemyGunVolumeY(def, distXZ)` — grounded `yMin` 0; at dist ≤ 6u the
  slab lofts to `PLAYER_EYE + 0.2` so pitch 0 / −8° / −16° at 3.2u hit.
- Hitscan / player projectiles pass XZ dist into the volume. Walls still
  occlude; the floor plane does **not** clip enemy tests (tracer only).
- Frozen pose still applies look and `tryFire()` / `G.shoot()` along the
  current camera forward (no AI).
- Unit: dist 3.2 at 0 / −8 / −16 plus steep floor-under-body; over-head
  and floor-in-front still miss. E2E: pose + `look(0, -16)` + `shoot()`.

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
