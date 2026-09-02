# STATUS

Updated: 2026-09-02 — PR: playtest fixes (crawler gun test, spire masonry,
HUD leak, editor COPY LINK). Do not merge from this agent.

`npx tsc --noEmit` clean. `npm test` 162/162. `npm run test:e2e` 67 passed / 3 skipped.
`GEN_VERSION` still 4. Crawler look / AI / combat stats unchanged.

## State: four live-playtest bugs

### 1. Point-blank crawler miss (P0)

Playtest: crawler ~3.2u ahead, look-down filling the lower view, pistol
spent a bullet, 0 kills, then melee. Hitscan was already a 3D cylinder vs
`enemyVolumeY` (`yMin` 0.1, `def.radius + 0.12`). Still missed because
the crawler *mesh* (head at local +z 0.5, abdomen, legs) overhangs
`def.radius` 0.5, so a downward pitch that clips the visible front
punched y=0 in front of the collision cylinder.

Gun test only (movement / AI still use `def.radius`):

- `enemyGunRadius` / `enemyGunVolumeY` — crawler gun disc 0.95u, grounded
  `yMin` 0 (feet on the floor).
- Hitscan clips at the floor (`y=0`) so a look-down does not continue
  underground. Body hits before the floor still count.
- Aim origin stays the camera (`PLAYER_EYE` 1.7, same YXZ basis).
- Unit tests: ~3u look-down through the visible front; thorax aim; nearly-
  horizontal close shot; floor-in-front still misses.

### 2. Spire art (P1)

`getCampaignTextures('spire')` read as maze-tech (orange circuit traces,
mesh ceiling, purple 7-seg door). Repainted wall/floor/ceiling/door/decals
as cold stone/copper ascent (ashlar masonry, elevation marks, copper
weather strap, antenna lattice in a stone window). Maze `textures.ts`
untouched. Marker `masonry-copper-ascent`. One-line lighting: spire fog /
ambient / door emissive / dish banner were purple — now cold stone/copper.

### 3. HUD leak (P1)

Quit to title left HEALTH / bullets / minimap drawing because `hud.draw`
ran whenever phase was not `editing`, and `toTitle` re-showed the
minimap canvas. Hide in-game HUD whenever phase is not playing / map /
paused (title, maplog, campaign, editor, dead, won). Sim is kept for
retry; it is not stepped or drawn as in-game. Campaign SKILL still does
not start a maze (`onSkillClick` host `diff-row` + `runKind==='maze'`).

### 4. Editor COPY LINK (P1)

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
