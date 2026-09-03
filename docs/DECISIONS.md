# DECISIONS

Unspecified things got decided; this is the record.

- **Title**: *SEVENTH GUN* — the win condition is literally finding the 7th
  gun; the name teaches the objective.
- **Stack**: Vite 6 + TypeScript strict + Three.js (Lambert/Basic materials,
  no shadow maps — blob shadows only), Vitest, Playwright.
- **Sim/render split**: hard boundary, sim is pure TS. See ARCHITECTURE.
- **Geometry**: 88×88 cells, CELL=2u, corridors 3 cells wide, walls 6u tall,
  indoor ceilings at 4.2u, courtyards open to a sky dome.
- **Doors**: 2–3 per map, slide UP. At most one key door, and it only guards a
  bonus vault spur — the arena path can never soft-lock.
- **Arena**: sealed by an energy barrier that shatters when gun 7 is picked up
  (in the antechamber). Clearing the arena wins.
- **No reload/no magazine mechanic**: ammo is a pool per type (non-goal says
  no reload). "Usable magazine" = generous starting pool (pistol 70).
- **Ammo types**: bullets (pistol+chaingun), shells, nails, grenades, cores,
  void — one pool per gun except the shared bullets.
- **Self-splash damage**: 20–25% on grenades/void — personality, kept low.
- **Enemy pathing**: A* with 0.55–0.85s staggered repaths; enemies never open
  doors; doors + seal block LOS, hitscan, projectiles, AND rendering.
- **Sprites vs meshes**: meshes. The brief's sprite requirements (5-view
  frames, octant hysteresis) are a fallback we don't need.
- **iOS audio**: WebAudio unlocked on first gesture;
  `navigator.audioSession.type='playback'` guarded try/catch.
- **Mobile look**: right-half drag; FIRE is a hold button that unlatches on
  touchend; portrait widens vertical FOV to hold hFOV ≈ 88°.
- **Death**: 2s no-controls lockout → title menu offers Retry Seed / New Maze.
- **Epitaphs**: yes, on the death screen (render-side flavor only).
- **Difficulty**: multiplier table in `src/sim/difficulty.ts`; layout identical,
  economy scales. Normal is reference.
- **Netlify**: static mirror, publish `dist/client`. Arena button shows
  offline unless pointed at Cloudflare via `ALLOWED_ORIGINS` /
  `VITE_ARENA_WS_URL`.
- **Cloudflare Workers + one Durable Object** is production for arena
  (Free plan, no card). Hosting considered Fly.io, rejected: no spend cap.
- **Remote**: github.com/guillem/seventh-gun. The initial one-shot version
  went to `main`; all further development is branches + PRs via `gh`, with
  the Netlify deploy preview verified before merge.
- **Map log**: title-screen history of maze seeds already played. Maze mode
  stays seed-based. localStorage key `seventh-gun.maplog`, cap 200, fail
  soft. Record `{ seed, difficulty, startedAt, genVersion, outcome?,
  durationSec?, kills? }`. Persistence in `src/app/mapLog.ts`, never sim.
  Campaign, editor playtest, and `#m=` runs are not logged. Loader
  ignores unknown fields so later `kind` can be added, and drops
  existing entries whose seed starts with `campaign:`. Title SKILL
  rebuilds a maze only when the last run was a maze; campaign SKILL
  never calls `startRun`. Campaign art packs bind only when
  `runKind === 'campaign'`.
- **Authored maps**: compact `SGMAP.v1.` binary, shared as `#m=` (hash, not
  query). `#m=` wins if `?seed=` is also present. Share URLs strip
  lights/decors; decoder regenerates from `cosmeticSeed`. Campaign files
  may later bake cosmetics; the compiler skips regen when those arrays
  are present. `Sim` constructor stays `(seed, difficulty)`; authored
  maps enter via `Sim.fromMap`. Difficulty never re-rolls entity counts
  on an authored map. Maze `generateMap` must stay behavior-identical
  (`GEN_VERSION` not bumped).
- **Campaign**: one seven-map run (`src/campaign/`), authored JSON DSLs
  compiled at module load. Player keeps guns and ammo; HP resets to 100
  each map; the Bone Key does not persist. Difficulty is chosen on the
  campaign panel and locked until quit+restart. Progress key
  `seventh-gun.campaign` (`{ difficulty, nextMap, loadout, unlocked? }`).
  Map 1 is always playable; map N unlocks after winning N−1. CONTINUE
  when `nextMap` is 2–7 (carried loadout). Clicking an unlocked map
  starts it with that map’s incoming loadout. Replays never rewind
  `nextMap` / `unlocked`. Quitting mid-map does not advance `nextMap`.
  Death retries the map with the entry loadout. Maps 1–6 intermission;
  map 7 is campaign victory (“THE SEVENTH IS SILENT”), not maze GAME OVER.
  Cosmetics are baked into the shipped blueprints. Campaign runs are not
  written to the map log. Campaign maps use dedicated canvas texture packs
  (`src/render/campaignTextures.ts`) plus renderer-only extra decals/meshes
  (`campaignDecor.ts`); maze / `#m=` keep the four shared themes. Extra art
  is placed from room kinds — the seven JSON maps are not rewritten for art.
  Hero plates (`lib.heroDecals` / `CAMPAIGN_HERO_DECALS` /
  `getCampaignHeroDecals`) are 256–512 ClampToEdge one-offs placed from
  each plate's hint. Empty pack field is a no-op.
- **Secrets (campaign v1)**: 15 authored pockets. Maze mode has none.
  Four kinds (plate-use / plate-shoot / remote-use / remote-shoot). Plates
  are 3-cell WALL-textured slabs that slide up in 0.7s; enemies never open
  them. Cosmetics for existing rooms are snapshotted on a pre-secret grid
  so lights/decors hashes do not shift; secret-room lights use radius ≤ 6.
  Powerups: WARD (10s, incoming 0), WRATH (20s, outgoing ×3), SEVENFOLD
  (7s, outgoing ×7, Sanctum once). Two tracks; same kind refreshes
  max(t, dur); damage track newest wins; WARD+WRATH stack; not carried
  between campaign maps. `GEN_VERSION` was not bumped.
- **Editor**: authors a `MapBlueprint` (rooms + 3-wide corridor rects +
  entities), never a raw bitmap. New maps stamp a labeled START room on
  the visible 88×88 grid; ROOM is click-drag (a plain click does not
  stamp). Title **EDITOR** / `?edit=1`. PLAYTEST
  uses `Sim.fromMap` (pistol loadout unless all-guns toggle). Esc from
  playtest returns to the editor; TITLE abandons. Library key
  `seventh-gun.mymaps`, cap 40. Share via `#m=` / `SGMAP.v1.` / `.sgmap`.
  No backend.
