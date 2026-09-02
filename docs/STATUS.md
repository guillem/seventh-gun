# STATUS

Updated: 2026-09-02 — campaign / editor polish (`feat/campaign-editor-polish`,
PR #8). Suites: `npm test` 79/79, `npm run test:e2e` 55 passed
(+3 mobile-only skips), `tsc --noEmit` clean.

## State: initial version + bugfixes #1–2 + map log + authored-map codec + campaign + editor + polish

Full loop works end to end: title (seed + skill) → run the maze → find
guns 2–7 in route order → the Seventh shatters the arena seal → clear the
arena → GAME OVER / You won. Death: 2s lockout → title with Retry Seed /
New Maze. Desktop + phone viewports verified.

- Repo: https://github.com/guillem/seventh-gun (`main`). From now on:
  branches + PRs (`gh`), Netlify deploy preview verified before merge.
- Netlify: LIVE at https://seventh-gun.netlify.app — repo linked, deployment
  current. Local folder linked via `netlify link` (`.netlify/` is gitignored).
- Maze `generateMap` is unchanged (`GEN_VERSION` still 4). Do not bump it
  for campaign or editor work. No JSON campaign map rewrites in this PR
  (another agent is redesigning those).
- Title chrome: **MAP LOG**, **CAMPAIGN**, **EDITOR** share one `.row`
  (`button.big`, same tap size as ENTER THE MAZE) so 390×844 still fits.
- Debug (`?e2e=1`): `startCampaign(n)`, `completeMap()`, `campaign`,
  `loadBlueprint`, `openEditor`, `stampEditorRoom`.

## Campaign menu + unlocks

Title **CAMPAIGN** opens a panel with the difficulty picker and **seven
named map buttons**:

1 THE FOUNDRY · 2 THE GULLET · 3 THE CATACOMBS · 4 THE PIT ·
5 THE SPIRE · 6 THE WARD · 7 THE SANCTUM

- Map 1 is always playable. Map N unlocks only after winning map N−1.
  Locked buttons stay visible as `name + LOCKED` and are disabled.
  Unlocked buttons start that map with its incoming loadout (same table
  as grok-plan §5.1 / each map JSON). Replays are allowed; they do not
  rewind `nextMap` or the carried CONTINUE loadout.
- Persistence: `src/app/campaignProgress.ts`, key `seventh-gun.campaign`.
  Record `{ difficulty, nextMap: 1..8, loadout, unlocked?: 1..7, mapStartedAt? }`.
  `unlocked` is stored; old saves derive `unlocked = min(7, nextMap)`.
  First visit: only Foundry unlocked. `nextMap` 8 = finished.
- **BEGIN** still starts a fresh campaign at map 1 (overwrites). **CONTINUE**
  (when `nextMap` is 2–7) uses the carried loadout.
- Winning map N still writes `applyMapWin` (unlocks N+1, advances CONTINUE
  only when that map was the frontier) and shows intermission / finale.

## Editor (usable 88×88)

- New maps stamp a labeled **START** room (`DEFAULT_START_ROOM` at 36,36
  8×8) so the grid is never empty. Erase will not remove the only start.
- Canvas paints a readable 88×88 cell grid (minor + every-8 major lines,
  field stroke). Layout uses CSS pixels + `dpr` transform so clicks match
  the painted cells (the old device-pixel origin made the grey square
  unclickable / disappear on first paint-before-layout).
- ROOM is click-drag; a 1×1 click does not stamp. Status line is the
  current tool hint (e.g. “ROOM — drag to stamp a room”).
- 2D editor still never requests pointer lock. `show()` double-paints on
  rAF so the canvas has non-zero backing size after flex layout.

## Enemy reveal

Meshes are created and GPU-compiled at `setRun` (`prefetchDynamicMeshes`).
Renderer visibility uses `hasVisualLineOfSight`: a door that has started
opening does not occlude. Collision / AI / pathing still treat
`offset < 0.65` as solid. Sim stays deterministic. Same path for maze,
campaign, and `#m=` maps.

## Open / next

- Another agent is rewriting the seven campaign JSON maps — do not
  redesign those here.
- Balance still wants a human Normal run against the maze 20–30 min target.

## Where things are

- Balance numbers: `src/sim/{weapons,enemyTypes,difficulty}.ts` + GAME-DESIGN.md
- Generator: `src/sim/mapgen.ts` (bump `GEN_VERSION` on any change)
- Campaign: `src/campaign/` + `src/app/campaignProgress.ts`
- Map log: `src/app/mapLog.ts` + title wiring in `src/ui/screens.ts` / `src/app/game.ts`
- Editor: `src/editor/{model,view,library}.ts` — title EDITOR / `?edit=1`
- Debug API: `src/app/game.ts getDebugApi()` — `?e2e=1` only
