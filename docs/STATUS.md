# STATUS

Updated: 2026-09-01 — PR 3: seven-map campaign with persistent guns
(`feat/campaign`).

## State: initial version + bugfixes #1–2 + map log + authored-map codec + campaign

Full loop works end to end: title (seed + skill) → run the maze → find
guns 2–7 in route order → the Seventh shatters the arena seal → clear the
arena → GAME OVER / You won. Death: 2s lockout → title with Retry Seed /
New Maze. Desktop + phone viewports verified.

- Repo: https://github.com/guillem/seventh-gun (`main`). From now on:
  branches + PRs (`gh`), Netlify deploy preview verified before merge.
- Netlify: LIVE at https://seventh-gun.netlify.app — repo linked, deployment
  current. Local folder linked via `netlify link` (`.netlify/` is gitignored).
- Maze `generateMap` is unchanged (`GEN_VERSION` still 4). Do not bump it
  for campaign work.

## Campaign (PR 3)

Title **CAMPAIGN** (same `button.big` tap size as **ENTER THE MAZE**,
sharing a `.row` with **MAP LOG** so 390×844 still fits). Seven authored
maps compiled from JSON DSL at module load (`src/campaign/`).

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

- Layers: `MapBlueprint` → `compileBlueprint` → `GameMap`.
- Codec: `src/sim/mapcodec.ts`, prefix `SGMAP.v1.`, `#m=` hash URLs.
- `Sim.fromMap(map, difficulty, opts?)`. Difficulty only scales combat.

## Open / next

- PR 4 from `docs/brainstorm/grok-plan.md` (editor). Rebase onto this
  campaign branch after merge; shared UI (`screens.ts`, `game.ts`,
  `index.html`) only gained a CAMPAIGN button / panels — MAP LOG was not
  rewritten and EDITOR was not invented.
- Balance still wants a human Normal run against the maze 20–30 min target.

## Where things are

- Balance numbers: `src/sim/{weapons,enemyTypes,difficulty}.ts` + GAME-DESIGN.md
- Generator: `src/sim/mapgen.ts` (bump `GEN_VERSION` on any change)
- Campaign: `src/campaign/` + `src/app/campaignProgress.ts`
- Map log: `src/app/mapLog.ts`
- Debug API: `src/app/game.ts getDebugApi()` — `?e2e=1` only
