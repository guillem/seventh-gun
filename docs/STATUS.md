# STATUS

Updated: 2026-09-01 — PR 4 rebase onto campaign (`feat/editor` on `79d572f`).

## State: initial version + bugfixes #1–2 + map log + authored-map codec + campaign + editor

Full loop works end to end: title (seed + skill) → run the maze → find
guns 2–7 in route order → the Seventh shatters the arena seal → clear the
arena → GAME OVER / You won. Death: 2s lockout → title with Retry Seed /
New Maze. Desktop + phone viewports verified.

- Repo: https://github.com/guillem/seventh-gun (`main`). From now on:
  branches + PRs (`gh`), Netlify deploy preview verified before merge.
- Netlify: LIVE at https://seventh-gun.netlify.app — repo linked, deployment
  current. Local folder linked via `netlify link` (`.netlify/` is gitignored).
- Maze `generateMap` is unchanged (`GEN_VERSION` still 4). Do not bump it
  for campaign or editor work.
- Title chrome: **MAP LOG**, **CAMPAIGN**, **EDITOR** share one `.row`
  (`button.big`, same tap size as ENTER THE MAZE) so 390×844 still fits.
- Suites after rebase: see below after `npm test` / `npm run test:e2e`.
  Maze, campaign, `#m=`, and editor e2e must stay green.
- PR #5 stays open; do not merge from this agent.

## Campaign (PR 3)

Title **CAMPAIGN** (same `button.big` tap size as **ENTER THE MAZE**).
Seven authored maps compiled from JSON DSL at module load (`src/campaign/`).

- Persistence: `src/app/campaignProgress.ts`, localStorage key
  `seventh-gun.campaign`. Record
  `{ difficulty, nextMap: 1..8, loadout, mapStartedAt? }` (`nextMap` 8 =
  finished). CONTINUE when `nextMap` is 2–7. Starting a new campaign
  overwrites. Quitting mid-map does not advance `nextMap`. Fail soft on
  quota. Never imported from `src/sim/`.
- Loadout: guns + ammo persist; HP = 100 at each map start; Bone Key does
  not persist. Difficulty chosen on the campaign panel, locked until
  quit+restart. Combat scaling only (same as `Sim.fromMap`).
- Maps 1–6: intermission (title + flavor + CONTINUE). Map 7: campaign
  victory “THE SEVENTH IS SILENT” / “You ended it.” — not maze GAME OVER.
- Death: 2s lockout then RETRY MAP (entry loadout, not mid-map pickups) /
  QUIT TO TITLE. Pause hides NEW MAZE.
- Cosmetics are baked into the shipped blueprints; `compileBlueprint`
  skips regen when lights/decors are present.
- Campaign runs are not written to the map log.
- Debug (`?e2e=1`): `startCampaign(n)`, `completeMap()`, `campaign`.
- Incoming loadout table (also the retry snapshot) lives in each map JSON
  as `incomingGuns` / `incomingAmmo`.

| # | Title | Rooms / enemies (compiled) | Unseal |
|---|---|---|---|
| 1 | THE FOUNDRY | 7 / 22 | shotgun |
| 2 | THE GULLET | 8 / 31 | chaingun |
| 3 | THE CATACOMBS | 8 / 31 | spiker |
| 4 | THE PIT | 9 / 36 | bile |
| 5 | THE SPIRE | 9 / 38 | sunlance |
| 6 | THE WARD | 12 / 46 | Bone Key |
| 7 | THE SANCTUM | 11 / 48 | The Seventh |

## Map log (PR 1)

- Persistence: `src/app/mapLog.ts`, localStorage key `seventh-gun.maplog`.
  Cap 200, newest-first, fail soft on quota. Maze runs only.

## Authored maps (PR 2)

Shareable compact maps. Campaign ships baked blueprints; the editor
authors user maps in the same format.

- Layers: `MapBlueprint` → `compileBlueprint` → `GameMap`. Sim consumes
  `GameMap` only. Maze `generateMap(seed)` is unchanged (`GEN_VERSION` still 4).
- Codec: `src/sim/mapcodec.ts`, prefix `SGMAP.v1.`, version `MAP_CODEC_VERSION = 1`.
  Share URLs: `https://<origin>/#m=SGMAP.v1.<payload>` (hash, not query).
  `#m=` wins over `?seed=`. Cosmetics (lights/decors) are stripped from share
  URLs and regenerated via `placeCosmetics(makeRng('cos|' + cosmeticSeed))`.
- `Sim.fromMap(map, difficulty, opts?)`. Difficulty only scales combat.
- Victory/death for a URL map: **RETRY MAP** / **TITLE** + **COPY LINK** +
  **SAVE TO LIBRARY**.
- Authored / campaign / editor-playtest runs are not written to the map log.

## Editor (PR 4)

In-browser 2D author of a `MapBlueprint` (rooms + 3-wide corridor rects +
entities). Never a raw bitmap. 88×88, `CELL=2`. Reuses PR 2
`compileBlueprint` / `mapcodec` / `mapShare`.

- Title **EDITOR** (same `button.big` tap size, shared `.row` with MAP LOG
  and CAMPAIGN). `?edit=1` also opens it. `#m=` still wins on boot.
- Tools: room stamp, corridor (3-wide rect or click two rooms to L-link),
  erase (will not orphan the only start), door, seal override (else inferred),
  entity stamps (enemies, medikit, ammo, gun 2–7, key, player start),
  seal-break picker, title, cosmetic seed + RND (preview dots, not painted).
- PLAYTEST = compile + `Sim.fromMap` (fresh pistol unless “start with all
  guns”). Esc returns to the editor. TITLE abandons to the title screen.
  Playtest is not written to the map log. Pointer lock matches maze;
  the 2D editor never requests it.
- Persistence: localStorage `seventh-gun.mymaps`,
  `{ id, title, savedAt, code }`, cap 40. SAVE / LIBRARY / LOAD.
- Export: COPY LINK (`origin/#m=` + encode(stripCosmetics)), COPY CODE
  `SGMAP.v1.…`, DOWNLOAD `title.sgmap`. Import: paste code or drop `.sgmap`.
- Received URL maps can **SAVE TO LIBRARY** from pause / victory / death.
- Validate runs PR 2 validators; errors block PLAYTEST/EXPORT; economy
  warning (2.2×) does not.
- Files: `src/editor/model.ts` (pure), `src/editor/view.ts` (canvas+DOM),
  `src/editor/library.ts`. Debug (`?e2e=1`): `loadBlueprint`, `openEditor`.

## Open / next

- Balance still wants a human Normal run against the maze 20–30 min target.
- Optional: CI workflow running both suites per PR; phone perf check
  during the arena wave.

## Where things are

- Balance numbers: `src/sim/{weapons,enemyTypes,difficulty}.ts` + GAME-DESIGN.md
- Generator: `src/sim/mapgen.ts` (bump `GEN_VERSION` on any change)
- Campaign: `src/campaign/` + `src/app/campaignProgress.ts`
- Map log: `src/app/mapLog.ts` + title wiring in `src/ui/screens.ts` / `src/app/game.ts`
- Editor: `src/editor/{model,view,library}.ts` — title EDITOR / `?edit=1`
- Debug API: `src/app/game.ts getDebugApi()` — `?e2e=1` only
