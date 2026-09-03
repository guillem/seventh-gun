# SEVENTH GUN — implementation plan (map log, campaign, editor)

Instructions for the implementing agent. Decisions below are **locked**. Do not
re-open them. Do not add a backend, accounts, Netlify functions, or blobs.
Maze mode (seeded `generateMap`) stays behavior-identical; all existing unit
and e2e tests stay green.

Repo rules still apply: branch + PR per slice, conventional commits, keep
`docs/STATUS.md` current, bump `GEN_VERSION` only if `src/sim/mapgen.ts`
generation results change (they should not).

---

## 0. Locked decisions

1. **Campaign shape.** Seven **short authored maps** with **persistent guns**
   (and persistent ammo). Individual maps are shorter than a seeded maze, but
   the whole campaign must feel **clearly longer** than one seeded maze
   (~20–30 min). Target: **~50–75 min** total; ~6–8 min maps 1–5, ~8–10 min
   map 6, ~10–12 min map 7.
2. **Authored economy.** Campaign (and editor) maps place every enemy and
   pickup by hand. Skill only multiplies combat numbers (HP, damage, speed,
   accuracy/spread, reaction, medikit heal) — the same fields
   `src/sim/difficulty.ts` already scales at sim-construction time. Do **not**
   re-roll counts, types, or positions from difficulty.
3. **Full entity placement** in the compact format and editor (rooms,
   corridors, doors, seal, guns, ammo, medikits, key, every enemy). Not
   “layout + content seed.”
4. **Cosmetics.** Lights and wall decors are **omitted from share URLs** and
   regenerated from a 32-bit cosmetic seed. The **campaign bundle authors
   them** (baked into the shipped map data).

Maze mode is untouched: title seed field, `?seed=`, `new Sim(seed, difficulty)`
→ `generateMap`, death Retry Seed / New Maze, victory “GAME OVER / You won.”

---

## 1. Architecture (the unlock)

Today the sim only knows how to exist from a seed:

```
new Sim(seed, difficulty) → generateMap(seed, difficulty) → GameMap
```

Add a second constructor path. Keep the seed constructor for maze mode and
every existing test.

```
Sim.fromMap(map, difficulty, opts?: { loadout?: PlayerLoadout; rngKey?: string })
```

`PlayerLoadout` is `{ owned: boolean[]; ammo: Record<AmmoType, number>; gun: number }`.
Campaign uses it to carry guns/ammo into the next map. Maze mode does not.
HP always resets to 100 at the start of a map (including campaign retries).

**Seal break is no longer hardcoded to gun 7.** Add `GameMap.sealBreak`:

```
{ type: 'gun'; gun: number }   // default for generated maps: { type: 'gun', gun: 7 }
| { type: 'key' }              // campaign map 6
```

Picking up that gun (if new) or the key shatters the seal. Generated maps
must keep emitting the same “THE SEVENTH SPEAKS” copy when gun 7 is new.
Campaign maps supply their own message via optional `sealBreakMessage?: string`.

Win condition stays: arena cleared (all enemies whose `roomId === arenaRoomId`
dead) → `t: 'won'`. The **app layer** decides whether that means maze victory,
campaign-map intermission, or campaign finale.

`src/sim/` stays pure: no DOM, no `localStorage`, no Three, no `Math.random`.
Persistence, URL parsing, and screens live in `src/app/` and `src/ui/`.
Codec encode/decode is **pure** and belongs in `src/sim/mapcodec.ts` (or
`src/sim/blueprint.ts`) so unit tests can round-trip without a browser.
Browser-only compression wrappers may live in `src/app/mapShare.ts`.

Do **not** bump `GEN_VERSION` unless the 300-seed sweep would change. Extracting
`placeCosmetics(grid, rooms, rng)` from `mapgen.ts` is allowed only if rng
call order is preserved (sweep hashes identical). If they drift, revert the
extraction and duplicate the cosmetic placer instead.

---

## 2. Build as four PRs

Do not dump this into one branch. Land in this order; each PR is independently
playable.

| PR | Branch | What ships |
|---|---|---|
| 1 | `feat/map-log` | Title **MAP LOG** button; localStorage history of seeded runs |
| 2 | `feat/map-codec` | Blueprint format, `Sim.fromMap`, `#m=` URL loader, cosmetic regen |
| 3 | `feat/campaign` | Title **CAMPAIGN** button, 7 authored maps, persistent loadout, intermissions |
| 4 | `feat/editor` | Title **EDITOR** button, 2D authoring, library, export URL/code/file |

PR 3 depends on 2. PR 4 depends on 2 (and should reuse campaign validators).
PR 1 is independent and should merge first.

---

## 3. PR 1 — Map log

### Behavior

- On every maze `startRun(seed)`, prepend a log entry. On death / win / quit
  to title, patch the most recent entry for that seed+start time with
  `outcome` and `durationSec` / `kills`.
- Title screen: a **MAP LOG** button under **ENTER THE MAZE** opens a panel
  listing newest-first. Each row: seed, relative time, skill, outcome badge
  (`—` / `DIED` / `WON` / `QUIT`). Click row or **PLAY** → fill seed input
  and start. Secondary: copy seed.
- Cap **200** entries (drop oldest). Fail soft if `localStorage` throws.

### Record

```
key: seventh-gun.maplog
{
  seed: string;
  difficulty: 'easy' | 'normal' | 'hard';
  startedAt: number;          // Date.now()
  genVersion: number;         // GEN_VERSION at start
  outcome?: 'won' | 'died' | 'quit';
  durationSec?: number;
  kills?: number;
}
```

If `entry.genVersion !== GEN_VERSION`, show a one-line warning on that row:
“generator changed — layout may differ.” Still allow play.

Do **not** log campaign/editor runs in v1 of this PR (those modes do not
exist yet). PR 3/4 may extend the record with `kind: 'maze' | 'campaign' | 'map'`
later; design the loader to ignore unknown fields (`{ ...defaults, ...parsed }`).

### Files

- `src/app/mapLog.ts` — load/save/cap. Not in `src/sim/`.
- `src/ui/screens.ts` — button + panel, match existing title CSS in `index.html`.
- `src/app/game.ts` — record start/outcome.

### Tests

- Unit: append, cap at 200, parse missing fields, ignore quota errors
  (inject a fake storage).
- E2E: start a seed, quit to title, MAP LOG shows it, PLAY starts the same
  seed (`state().seed` matches). Desktop is enough.

---

## 4. PR 2 — Compact map format + `Sim.fromMap` + URL

This is the shared primitive. Campaign and editor are consumers.

### 4.1 Runtime vs authored

Three layers:

1. **`MapBlueprint`** — the authored/shareable document (rooms, corridor
   rects, entities, sealBreak, cosmeticSeed, optional lights/decors).
2. **`compileBlueprint(bp): GameMap`** — carves the 88×88 `Uint8Array` grid
   from room rects ∪ corridor rects, computes `routeDist`, world-space
   positions (`cellToWorld`), derives missing seal cells from the arena
   edge if `seal` is omitted, fills lights/decors from `cosmeticSeed` when
   those arrays are absent/empty.
3. **`GameMap`** — what `Sim` / renderer already consume. Unchanged except
   the new `sealBreak` (+ optional `title?: string`).

Grid size stays `GRID_W × GRID_H` (88×88), `CELL = 2`. Authored maps occupy
less of the grid; they do not get a smaller world.

### 4.2 `MapBlueprint` schema (v1)

All coordinates are **cell ints 0–87**, never world floats. Enums are small
strings in the in-memory object; the binary codec packs them as uint8.

```
{
  codec: 1;
  title?: string;
  cosmeticSeed: number;            // uint32
  sealBreak: { type: 'gun', gun: 1..7 } | { type: 'key' };
  sealBreakMessage?: string;
  rooms: { id, x, z, w, h, theme, kind, outdoor }[];
  corridors: { x, z, w, h }[];     // 3-wide slabs, including L-link legs
  doors: { cx, cz, axis: 'x'|'z', locked }[];
  seal?: { cells: [x,z][], axis: 'x'|'z' };  // optional; compiler infers
  playerStart?: { x, z, yaw };     // cells + radians; default = start room center, yaw π/2
  pickups: { kind, gun?, ammoType?, amount?, x, z, roomId }[];
  enemies: { type, x, z, yaw, roomId }[];
  lights?: RoomLight[];            // world-space; campaign only
  decors?: Decor[];                // world-space; campaign only
}
```

`kind` and `theme` use the existing unions in `src/sim/types.ts`. Compiler
assigns dense numeric `Room.id` from array order if `id` is a string in a
higher-level DSL (see PR 3); the blueprint itself uses numeric ids.

**Invariants the compiler / validator enforce** (unit-tested):

- At least one `start` room, one `arena`, one `antechamber`.
- Every room and every pickup/enemy cell is floor after carve, in-bounds,
  and the named `roomId` matches a room that contains that cell (or is
  adjacent corridor — prefer inside the room).
- BFS from start reaches every room with locked doors treated as **open**,
  and reaches arena + all gun pickups + key with locked doors treated as
  **solid** (same “nothing essential behind the key door” rule as mapgen,
  except the vault spur).
- Spawn safety: no enemy has LOS to `playerStart` through open floor with
  doors+seal solid, and spawn is ≥ 16u from the first enemy (reuse
  mapgen’s DDA).
- If `sealBreak.type === 'gun'`, that gun pickup exists and is **not** in
  the arena (antechamber is the intended place, not required if reachable
  before the seal).
- If `sealBreak.type === 'key'`, a key pickup exists and a path to the
  arena exists after the key is collected (key door and/or seal).
- `unseal` gun / key is reachable without traversing the seal.

Do **not** require guns 2–7 all present. User maps and campaign maps 1–6
are allowed to ship a subset. Maze-mode generated maps are not compiled
from this format.

### 4.3 Binary / URL encoding

Prefix: `SGMAP.v1.`

Payload:

1. Pack a compact binary (not JSON). Suggested layout:
   - magic `SGM1`
   - flags u16: bit0 = hasLightsAndDecors, bit1 = compressed
   - cosmeticSeed u32, sealBreak tag, room/corridor/door/pickup/enemy counts
   - packed records (uint8 cell coords, uint8 enum indices)
2. If uncompressed size > 1200 bytes, `deflate-raw` the packed body and set
   the compressed flag.
3. `base64url` (no padding).

Share URL:

```
https://<origin>/#m=SGMAP.v1.<payload>
```

**Hash, not query.** Never put the payload in `?m=` (Netlify logs, length,
caching). Keep `?seed=` working for maze mode. If both are present, `#m=`
wins and maze seed is ignored.

**Share URLs must strip `lights` and `decors`** before encode (flag off).
The decoder calls `placeCosmetics` with `makeRng('cos|' + cosmeticSeed)`.
Campaign files in the repo may include lights/decors; the compiler then
skips regen.

Browser: `CompressionStream('deflate-raw')` / `DecompressionStream`. Node
tests: `zlib.deflateRawSync` / `inflateRawSync`. If `CompressionStream` is
missing, ship uncompressed (flag off) — maps still fit.

Measured ballpark (do not regress wildly): a 17-room maze-sized blueprint
without cosmetics should encode to **≲ 2 KB** in the URL payload. Campaign
maps are smaller.

Round-trip test: `compile(decode(encode(stripCosmetics(bp))))` equals
compile of original on grid, rooms, doors, seal, pickups, enemies,
playerStart, sealBreak. Cosmetics need not be byte-identical to authored
campaign lights — only regenerated-from-seed identical.

### 4.4 Sim changes

- Keep `constructor(seed, difficulty)`.
- Add `static fromMap(...)`. Enemy rng keys: `enemy|${rngKey}|${id}` with
  `rngKey` defaulting to `map.seed` or `'authored'`. Do not use
  `GEN_VERSION` in authored rng keys (authored maps must not shift when
  the generator versions).
- Apply difficulty **only** to enemy hp/speed/reaction/accuracy and
  medikit heal / outgoing player damage, same as today. Do not call
  `generateMap`. Do not scale enemy counts or ammo `amount`.
- `checkPickups` uses `map.sealBreak` instead of `g === 7`.

`GameMap.seed` for authored maps: the title slug or `'campaign:03'` /
`'user:…'`. `GameMap.version` can stay `GEN_VERSION` for generated maps;
for authored maps set `version: 0` or a new `MAP_CODEC_VERSION` and do not
treat them as generator-scoped.

### 4.5 App wiring (minimal)

- On boot, if `location.hash` starts with `#m=`, decode → compile →
  `Sim.fromMap` → start playing (skip title), or on decode error toast and
  show title.
- Victory/death for a URL map: **RETRY MAP** / **TITLE**. No “new maze.”
  Show a **COPY LINK** control.

Debug API (`?e2e=1`): add `startMap(blueprint | code: string)` so e2e can
drive authored maps without the hash.

### Files

- `src/sim/blueprint.ts` — types, compile, validate.
- `src/sim/mapcodec.ts` — binary pack/unpack.
- `src/sim/cosmetics.ts` — `placeCosmetics` (extracted or duplicated).
- `src/app/mapShare.ts` — deflate + hash + clipboard helpers.
- Tests: `tests/unit/blueprint.test.ts`, `tests/unit/mapcodec.test.ts`.

### Tests (required)

- Compile a tiny handmade blueprint: connectivity, spawn-safe, gun-seal
  break, key-seal break.
- Codec round-trip including a map with 60+ enemies.
- `Sim.fromMap` + scripted input is deterministic (two sims, same
  snapshot).
- Difficulty: same authored map, easy vs hard → identical entity
  positions, different enemy HP.
- Architecture guard still forbids `localStorage` in `src/sim/` (codec
  must not touch it).

---

## 5. PR 3 — Campaign

### 5.1 Fantasy and structure

One campaign, seven maps, one through-line: industrial → organic → stone →
tech. Player **keeps guns and ammo** between maps. HP = 100 at each map
start. Key does **not** persist (per-map). Difficulty is chosen on the
campaign title screen and locked for that campaign until they quit and
restart.

**Incoming loadout (reference, also the retry snapshot):**

| Map | Entering with guns | This map’s new gun / unseal |
|---|---|---|
| 1 THE FOUNDRY | 1 pistol | gun 2 shotgun; `sealBreak: {gun:2}` |
| 2 THE GULLET | 1–2 | gun 3 chaingun |
| 3 THE CATACOMBS | 1–3 | gun 4 spiker |
| 4 THE PIT | 1–4 | gun 5 bile launcher |
| 5 THE SPIRE | 1–5 | gun 6 sunlance |
| 6 THE WARD | 1–6 | **no new gun**; `sealBreak: {type:'key'}` |
| 7 THE SANCTUM | 1–6 | gun 7 The Seventh; `sealBreak: {gun:7}` |

Map 6 is the extra length beat that makes seven maps fit six remaining
guns. It is a siege: Bone Key shatters the ward, then a fat arena.

On map complete (maps 1–6): intermission screen with title, 2–4 lines of
flavor, **CONTINUE**. On map 7 clear: campaign victory (not the maze
“GAME OVER / You won” copy — e.g. “THE SEVENTH IS SILENT” / “You ended
it”). Death: 2s lockout then **RETRY MAP** (restore the loadout they
**entered this map with**, not mid-map pickups) / **QUIT TO TITLE**.
Progress is saved so title **CAMPAIGN** offers **CONTINUE** if `nextMap`
is 2–7.

Quitting mid-map does not advance `nextMap`. Completing a map writes:

```
key: seventh-gun.campaign
{
  difficulty: Difficulty;
  nextMap: 1..8;            // 8 = campaign finished
  loadout: PlayerLoadout;   // what they carry into nextMap
  mapStartedAt?: number;
}
```

Starting a **new** campaign overwrites this. There is no checkpoint inside
a map.

### 5.2 Pacing / size (so it is longer than one maze, maps not tiny)

Seeded maze reference: ~17 rooms, 55–75 enemies, 20–30 min.

| Map | Rooms (incl. arena+ante) | Enemies (incl. arena) | Feel |
|---|---|---|---|
| 1 | 7–8 | 22–28 | Teach movement, one door, husks then crawlers, tiny arena (1 slab + fodder) |
| 2 | 8–9 | 28–34 | Organic tight corridors, chaingun payoff vs crawlers |
| 3 | 8–9 | 30–36 | Stone, first wisps, spiker at range |
| 4 | 9–10 | 34–40 | Mix, splash intro, one courtyard |
| 5 | 9–10 | 36–42 | Vertical-feeling spine, sunlance sightlines, a hierophant before arena |
| 6 | 11–12 | 44–52 | Longest middle map; key hunt; arena of slabs/wisps, **no** gun 7 |
| 7 | 10–12 | 48–56 | Cathedral + antechamber + **full** Normal-scale arena wave |

Total enemies across 7 maps should land **well above** one maze (~65 + 14
arena). If a first pass is shorter than ~45 min on Normal in your head,
add rooms/enemies to 6 and 7, not filler hallways to 1.

Authored ammo/medikits must still satisfy a campaign-aware economy check:
**available damage from incoming reference ammo + this map’s pickups ≥
2.2× total enemy HP** on Normal, counting only guns the player owns
entering + the gun this map awards (map 6: guns 1–6 only). Put the
reference incoming ammo in each map’s source as `incomingAmmo` for the
validator (do not steal live localStorage in tests).

### 5.3 How to author (DSL → blueprint → GameMap)

Do **not** paint 88×88 by hand and do **not** freeze lucky seeds (seeds die
when `GEN_VERSION` bumps). Author a small JSON DSL per map, compile at
module load.

`src/campaign/maps/01-foundry.json` (example shape):

```
{
  "id": "01-foundry",
  "title": "THE FOUNDRY",
  "subtitle": "steel remembers the screaming",
  "themeDefault": "industrial",
  "cosmeticSeed": 1001,
  "sealBreak": { "type": "gun", "gun": 2 },
  "sealBreakMessage": "RIPJAW CHAMBERS — the foundry gate dies.",
  "intermission": "The shotgun still smokes. Deeper, the walls begin to sweat.",
  "incomingGuns": [1],
  "rooms": [
    { "id": "start", "x": 6, "z": 24, "w": 7, "h": 7, "kind": "start" },
    { "id": "press", "x": 18, "z": 22, "w": 9, "h": 8, "kind": "spine" },
    { "id": "ante",  "x": 36, "z": 22, "w": 7, "h": 7, "kind": "antechamber", "theme": "tech" },
    { "id": "arena", "x": 48, "z": 18, "w": 13, "h": 12, "kind": "arena", "theme": "tech" }
  ],
  "links": [
    { "from": "start", "to": "press", "len": 6 },
    { "from": "press", "to": "ante", "len": 6 },
    { "from": "ante", "to": "arena", "len": 5 }
  ],
  "doors": [{ "room": "press" }],
  "guns": [{ "gun": 2, "room": "ante" }],
  "pickups": [
    { "kind": "medikit", "room": "press" },
    { "kind": "ammo", "ammoType": "shells", "room": "press" }
  ],
  "enemies": [
    { "type": "husk", "room": "press", "n": 3 },
    { "type": "crawler", "room": "press", "n": 1 },
    { "type": "slab", "room": "arena", "n": 1 },
    { "type": "husk", "room": "arena", "n": 3 }
  ]
}
```

`src/campaign/compileDsl.ts` turns named rooms + `links` into corridor
rects (same 3-wide mouth math as `mapgen.placeAnnex` / spine corridors),
spreads `n` enemies on distinct floor cells in that room, then
`compileBlueprint`. Campaign cosmetics: after compile, run
`placeCosmetics` **and keep the result in the shipped object** (decision
4 — authored in the bundle). Optionally hand-tweak lights in the JSON
later; v1 generated-then-frozen cosmetics are fine if the seed is fixed.

Export `CAMPAIGN: CampaignMap[]` from `src/campaign/index.ts`.

Flavor titles (use these, or better of the same tone — do not name them
“Level 1”):

1. THE FOUNDRY — industrial, shotgun
2. THE GULLET — organic, chaingun
3. THE CATACOMBS — stone, spiker
4. THE PIT — industrial/organic, bile launcher, one courtyard
5. THE SPIRE — stone/tech, sunlance
6. THE WARD — tech, key siege
7. THE SANCTUM — tech, The Seventh

### 5.4 UI

Title: **CAMPAIGN** next to / under **ENTER THE MAZE**. Opens a slim
panel: skill row (reuse), **BEGIN** or **CONTINUE**, blurb “Seven maps.
The guns stay with you.”

Intermission: reuse the victory panel chrome, different copy + CONTINUE.
Campaign victory: distinct copy, **TITLE** only (no “same seed again”).

Pause during campaign: **RETRY MAP** / **QUIT TO TITLE** (saves continue
state). Hide **NEW MAZE**.

HUD message on campaign map start: the map title, not “Find the seven
guns…”

### 5.5 Tests

- Unit: all 7 DSL files compile and pass blueprint validators + economy
  floor with that map’s `incomingGuns`.
- Unit: `Sim.fromMap` map 1, pick up gun 2 → seal breaks; clear arena →
  `won`. Map 6: gun pickups do not break seal; key does.
- Unit: loadout carry — finish map 1 with shotgun owned → map 2 player
  `owned[2] === true` and pistol ammo not reset to 70 unless that’s what
  remained (carry exact ammo).
- E2E: title CAMPAIGN → BEGIN → playing; debug `warpTo` antechamber, give
  shotgun, warp arena, kill remaining via debug if you add `killArena()`,
  see intermission, CONTINUE → map 2 title in HUD/state.
- Extend debug API: `campaign: { map, nextMap, owned }`, `startCampaign(n?)`,
  `completeMap()` for e2e (only with `?e2e=1`).

Do not require a full 7-map playthrough in Playwright.

---

## 6. PR 4 — Level editor

A second mode, not a shipped product-in-a-product. Top-down 2D on the
88×88 grid. It authors a `MapBlueprint` (rooms + corridor rects +
entities), never a raw bitmap as the source of truth.

### 6.1 Entry / exit

Title **EDITOR**. `?edit=1` also opens it. **PLAYTEST** compiles +
`Sim.fromMap` (fresh pistol loadout unless a “start with all guns” toggle
for testing). Esc from playtest returns to the editor, not title. **TITLE**
abandons the playtest.

### 6.2 Tools (minimum)

- **Room stamp** — drag a rect, set kind/theme/outdoor. Kinds as in
  `Room.kind`.
- **Corridor** — 3-wide rect between clicks, or click two rooms to auto
  link (reuse DSL link carver).
- **Erase** — remove a room/corridor (must not orphan the only start).
- **Door** / **seal** (seal inferred if arena exists; allow override).
- **Entity stamps:** enemy types, medikit, ammo (type picker), gun 2–7,
  key, player start.
- **Seal-break picker:** gun N or key.
- **Title** text field + **cosmetic seed** (RND button). Cosmetics preview
  on the 2D map as dots, regenerated live from the seed — not painted.
- **Validate** button: run the PR 2 validators, list errors, block
  PLAYTEST / EXPORT if any error. Warnings (economy < 2.2×) do not block.

### 6.3 Persistence / share (no backend)

localStorage key `seventh-gun.mymaps`: array of `{ id, title, savedAt, code }`
capped at ~40. Editor **SAVE** / **LIBRARY** list / **LOAD**.

Export:

- **COPY LINK** — `origin + '/#m=' + encode(stripCosmetics(bp))`
- **COPY CODE** — `SGMAP.v1.…` for chats that eat URLs
- **DOWNLOAD** — `title.sgmap` (same code as text)

Import: paste code, drop `.sgmap`, or open `#m=` (already in PR 2).

A received URL map may be **Save to library** from the pause/victory
screen (PR 2 can leave a stub; editor PR should wire it).

### 6.4 Tests

- Unit: editor model (not DOM) — stamp room + link + gun + enemies →
  compiles, encodes, decodes, still validates.
- E2E: `?edit=1` shows editor chrome; a fixture blueprint loads via debug
  `loadBlueprint`; PLAYTEST reaches `phase === 'playing'`. Do not try to
  drive a full paint session with Playwright beyond one stamp if the DOM
  is painful — prefer unit tests on the model.

---

## 7. Files to add / touch (summary)

**New**

- `src/app/mapLog.ts`
- `src/sim/blueprint.ts`
- `src/sim/mapcodec.ts`
- `src/sim/cosmetics.ts`
- `src/app/mapShare.ts`
- `src/campaign/compileDsl.ts`
- `src/campaign/index.ts`
- `src/campaign/maps/01-foundry.json` … `07-sanctum.json`
- `src/editor/model.ts` (pure)
- `src/editor/view.ts` (canvas + DOM)
- `tests/unit/blueprint.test.ts`
- `tests/unit/mapcodec.test.ts`
- `tests/unit/campaign.test.ts`
- `tests/unit/mapLog.test.ts`
- `tests/e2e/campaign.spec.ts` (and small map-log / editor specs)

**Touch**

- `src/sim/types.ts` — `sealBreak` on `GameMap`; maybe `title`
- `src/sim/sim.ts` — `fromMap`, generalized seal break, optional loadout
- `src/sim/index.ts` — re-exports
- `src/sim/mapgen.ts` — set `sealBreak: { type:'gun', gun:7 }` on generated
  maps; optionally call shared cosmetics
- `src/app/game.ts` — modes, log, hash, campaign flow, editor playtest
- `src/ui/screens.ts` + `index.html` styles — new buttons/panels
- `src/app/game.ts` debug API extensions
- Docs: `ARCHITECTURE.md`, `DECISIONS.md`, `GAME-DESIGN.md`, `ROADMAP.md`,
  `TESTING.md`, `STATUS.md`, `README.md` (URL tricks: `#m=`, campaign,
  map log)

Do not add npm dependencies unless `CompressionStream` is genuinely
unusable in unit tests — Node `zlib` is enough there.

---

## 8. Invariants (break these and the PR is not done)

- `npm test`  (current 35 + new cases) green.
- `npm run test:e2e` green, including previous maze flows.
- `tsc --noEmit` clean.
- Architecture test still true: sim has no `localStorage` / DOM / Three /
  `Math.random`.
- Same maze seed + difficulty + `GEN_VERSION` ⇒ identical layout as
  before this work (if the 300-seed sweep diffs, you changed mapgen —
  undo).
- Share URLs live in the hash, cosmetics stripped, campaign bundle
  cosmetics kept.
- No backend. Sharing is URL / clipboard / file / localStorage only.
- Campaign progress and map log survive a refresh (same origin).
- Death in campaign retries **that map** with the **entry** loadout.
- Maze title/victory/death copy and buttons unchanged when not in
  campaign/editor.

---

## 9. Implementation notes the first agent always forgets

- `Uint8Array` does not JSON.stringify usefully; the codec is binary, the
  compiler produces the grid in memory, tests compare grids with
  `Buffer.from` / `toEqual`.
- Door `cells` are the 3-wide span; compiler should expand `{cx,cz,axis}`
  to those three cells the same way mapgen does.
- World positions: `cellToWorld(c) = (c + 0.5) * CELL`. Entities stamped
  on cell `x,z` sit at that world point.
- `owned` is an 8-length array, index 1–7 are guns, index 0 unused — match
  existing `Sim` (`owned: [false, true, false, …]`).
- Pointer lock: editor 2D view must never request it; playtest from
  editor should, matching maze.
- Mobile: new title buttons need the same tap size as **ENTER THE MAZE**;
  e2e mobile project should still find FIRE ≥ 44px. Campaign/editor can
  be desktop-first but must not overflow the 390×844 title panel — wrap
  buttons in `.row`.
- `location.hash` changes should not reload the Vite app; parse once on
  boot. A later `hashchange` listener is nice (open a received link while
  the tab is on title) but not required for v1.

---

## 10. Suggested first commit on each branch

1. `feat: persist maze seeds in a title-screen map log`
2. `feat: authored map codec, Sim.fromMap, and #m= share links`
3. `feat: seven-map campaign with persistent guns`
4. `feat: in-browser map editor with URL export`

After each merge, update `docs/STATUS.md` with date, PR number, and what
a later agent should know (storage keys, codec version, campaign
continue key).

When authoring the seven maps, play each via `?e2e=1` + `startCampaign(n)`
and walk them; do not ship a map you have only validated in unit tests.
The 2.2× economy check is a floor, not a fun check.
