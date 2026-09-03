# Plan: map log, campaign mode, level editor

Written by Claude (Sonnet 5) after reading the current codebase, for execution
in Cursor. Self-contained — no need to re-read the brainstorm chat first.

## 0. Ground truth (verified in this repo, not assumed)

- Maps are 100% procedural: `generateMap(seed, difficulty)` in
  `src/sim/mapgen.ts:27` returns a `GameMap` (`src/sim/types.ts:75`). No map
  is ever persisted today — everything is regenerated from the string seed.
- `GEN_VERSION` (`src/sim/types.ts:8`, currently `4`) is baked into every RNG
  stream (`SG|v${GEN_VERSION}|${seed}`, `mapgen.ts:29-31`; also
  `src/sim/sim.ts:130,165`). It has been bumped 3 times already. **Every
  stored/shared artifact below (log entry, campaign map, share link) must
  carry `genVersion` alongside its data**, or a future mapgen tweak silently
  changes what a saved seed/map means.
- `?seed=` already works (`src/app/game.ts:51-54`): prefills the title
  screen's seed input from the URL query string. There's no `?difficulty=`
  today.
- `generateMap` is called from exactly one place: `src/sim/sim.ts:127`.
- Measured real output size (script run against `generateMap('x','normal')`):
  `JSON.stringify(map)` = **83,064 bytes**, but ~69KB of that is
  `JSON.stringify`'ing the `Uint8Array` grid as a `{"0":1,...}` object —
  a serialization bug, not real map complexity. Without the grid: **14,469
  bytes**. Grid as a plain array: **15,489 bytes**. Real map for reference:
  18 rooms, 3 doors, 42 pickups, 54 enemies, 26 decors, 20 lights.
- **Corridors are not stored anywhere.** They're carved straight into the
  grid with inline `carve(rect)` calls in `mapgen.ts` at lines **150-151**
  (spine loop), **211-212** (`placeAnnex`, used for arena/antechamber/spurs),
  and **272** (`carveLink`, two legs). This is the one real gap blocking a
  compact/lossless format — see §1.
- Architecture rule (enforced by `tests/unit/architecture.test.ts`): nothing
  under `src/sim/` may touch `Math.random`, `document`, `window`,
  `localStorage`, or import from `render/ui/audio/app`. Keep this true for
  every new file below — `localStorage` and browser `CompressionStream` go in
  `src/ui/` or `src/app/`, never `src/sim/`.
- Determinism is **call-order-sensitive**: RNG streams are stateful
  generators (`src/sim/rng.ts`), so refactoring `mapgen.ts` must not change
  the sequence of `rng.float()/int()/pick()` calls, or every existing seed
  starts producing a different map. Treat this as the main risk in §1.

## 1. Shared foundation: an authorable map format

This is the dependency for both campaign tier-2 (§3) and the editor (§4).
Do this once, properly — it's the part of the brainstorm the user explicitly
asked to unify.

### 1a. Extend `GameMap` with corridors

In `src/sim/types.ts`, add to `GameMap` (near `rooms`/`doors`):
```ts
corridors: Rect[]; // 3-wide carved rects; grid is rebuilt from rooms+corridors
```
Promote the local `Rect` interface out of `mapgen.ts` into `types.ts` (or a
new `src/sim/grid.ts`, see 1b) so it's shared.

In `mapgen.ts`, collect every corridor rect into a `corridors: Rect[]` array
at the three carve-corridor call sites named above, and return it in the
final `GameMap` literal (`mapgen.ts:584-596`).

**Verify no behavior change**: add a temporary regression test that runs
`generateMap(seed, 'normal')` for ~20 fixed seeds before and after this
change and asserts the `grid` `Uint8Array` and all entity arrays are
byte-identical. Delete the temp test once §1b lands (its round-trip test
supersedes it). The existing 300-seed sweep in `tests/unit/mapgen.test.ts`
must keep passing unmodified.

### 1b. Extract the grid-builder so procedural and authored maps share it

Currently `carve`, `cellsOf`, `key`, `inBounds`, `inflate` are closures
inside `generateMap` (`mapgen.ts:36-61`). Pull the *pure grid construction*
into a new `src/sim/mapgrid.ts`:

```ts
export function carveGridFromRects(w: number, h: number, rects: Rect[]): Uint8Array
```
(loop `cellsOf`+bounds-check+set 1, same as today's `carve`, just applied to
a full rect list instead of incrementally during placement). `generateMap`
keeps its own incremental `carve()` for placement-time collision checks
(`rectFree` needs the grid to grow as it goes — don't touch that), but the
*final* returned `grid` can instead be produced by
`carveGridFromRects(GRID_W, GRID_H, [...rooms, ...corridors])` for a single
source of truth that both generation paths agree on. Keep the incremental
carving during generation (it's load-bearing for `rectFree`); just make sure
what's stored in `corridors` reproduces the same grid when rebuilt.

Also extract, as their own functions in `mapgrid.ts` (currently inline in
`mapgen.ts:361-416`), so authored maps get the same cosmetic layer:
```ts
export function buildLights(rooms: Room[], rng: Rng): RoomLight[]
export function buildDecors(rooms: Room[], grid: Uint8Array, rng: Rng): Decor[]
```
Pass these the *same* `rng` instance `generateMap` already uses, in the same
call position, so procedural output is provably unchanged (covered by the
regression test from 1a).

### 1c. `buildGameMap`: the authored-map entry point

New function in `src/sim/mapformat.ts`:
```ts
export interface MapSpec {
  formatVersion: number;
  genVersion: number;      // pinned GEN_VERSION this spec was authored against
  seed: string;             // cosmetic only — seeds the lights/decor rng
  difficulty: Difficulty;
  rooms: Room[];             // full Room objects (id, rect, theme, kind, outdoor)
  corridors: Rect[];
  doors: DoorDef[];
  seal: SealDef;
  pickups: PickupDef[];
  enemies: EnemySpawn[];
  playerStart: { x: number; z: number; yaw: number };
  startRoomId: number; arenaRoomId: number; antechamberId: number; vaultRoomId: number;
}

export function buildGameMap(spec: MapSpec): GameMap {
  const grid = carveGridFromRects(GRID_W, GRID_H, [...spec.rooms, ...spec.corridors]);
  const rng = makeRng(`SG|v${spec.genVersion}|${spec.seed}|cosmetic`);
  const lights = buildLights(spec.rooms, rng);
  const decors = buildDecors(spec.rooms, grid, rng);
  return { version: spec.genVersion, seed: spec.seed, difficulty: spec.difficulty,
    w: GRID_W, h: GRID_H, grid, corridors: spec.corridors, lights, decors, ...spec };
}
```
Note `GameMap` and `MapSpec` end up nearly identical (`GameMap` = `MapSpec` +
derived `grid`/`lights`/`decors`). That's intentional — `encodeMap` below is
just "pick the authored subset of a `GameMap`", so it works identically on a
freshly-`generateMap`'d map or a hand-edited one.

Round-trip test to add: for N seeds, `buildGameMap(toSpec(generateMap(seed,
d)))` must equal `generateMap(seed, d)` (grid + every entity array). This is
the real correctness guarantee for the whole feature.

### 1d. Compact binary encode/decode (pure, in `src/sim/mapformat.ts`)

Byte-budget target (from the measured numbers in §0): a few hundred bytes
packed, well under 1KB. Don't over-engineer the exact bit widths up front —
get something working, measure, tune. Starting point:

- Small `BitWriter`/`BitReader` pair (pure, ~40 lines, easy to unit test in
  isolation with round-trip fuzzing).
- Header: `formatVersion` (u8), `genVersion` (u8), `difficulty` (2 bits),
  `seed` (length-prefixed UTF-8 — keep the human-readable string; it's tiny
  and it's also what re-derives decor/lights).
- Rooms: count (u8) then per room `x,z` (7 bits each — grid is 88×88, max
  index 87), `w,h` (6 bits, generous headroom over the ~5-16 range seen in
  mapgen), `theme` (2 bits enum), `outdoor` (1 bit), `kind` (3 bits enum).
- Corridors: same rect packing, no theme/kind bits needed.
- Doors: `cx,cz` (7+7 bits), `axis` (1 bit), `locked` (1 bit). **Don't store
  `cells`** — re-derive the 3 cells from `cx,cz,axis` on decode (it's a fixed
  offset, see `mapgen.ts:291-294` for the pattern).
- Seal: single cell + axis (matches today's logic, which only ever records
  one cell — `mapgen.ts:350-353`).
- Pickups: `kind` (2 bits), cell (7+7 bits), `roomId` (index into rooms
  array, u8), plus kind-specific payload (`gun` number, or `ammoType`+amount
  varint). Skip storing `x,z` as world floats — always re-derive via
  `cellToWorld`.
- Enemies: `type` (3-bit enum), cell (7+7), `roomId` (u8). Yaw can be
  re-rolled deterministically from the cosmetic seed on decode instead of
  stored (saves a byte × ~65 enemies; minor but free).
- `startRoomId/arenaRoomId/antechamberId/vaultRoomId`: indices into the rooms
  array (u8 each, `0xFF` = none).

```ts
export function encodeMap(map: GameMap): Uint8Array
export function decodeMap(bytes: Uint8Array): GameMap // throws MapDecodeError on malformed input
```

`decodeMap` must **bounds-check everything** before touching `Uint8Array`
indices or array lookups — a share link is untrusted input from whoever made
it. Reject (don't clamp-and-continue) on: room/corridor rects outside
0..87, room-array-index fields ≥ rooms.length, unknown enum values, byte
length not matching the declared counts.

### 1e. Validation (pure, `src/sim/mapValidate.ts`)

```ts
export function validateMap(map: GameMap): { errors: string[]; warnings: string[] }
```
Reuse the two BFS checks already written in `tests/unit/mapgen.test.ts`
(`bfsReach`, and the "guns/key/arena never locked behind a key door" check
just below it) — move that logic into this new file so both the test suite
and the runtime (editor "validate" panel, share-link loader) call the same
code instead of duplicating it. Update `mapgen.test.ts` to import from here.

Split hard-fail from soft-warn:
- **errors** (reject/refuse to load): any room unreachable from start;
  arena/gun-7/all guns reachable without crossing a locked door; structural
  bounds violations that would crash physics/render.
- **warnings** (load anyway, show a banner): the existing economy invariant
  (available damage ≥ 2.2× total enemy HP, from `mapgen.test.ts` — check
  what it currently asserts and mirror it) failing, enemy count wildly off
  normal range, no medikits. A shared/edited map should be allowed to be
  janky on purpose; it just shouldn't be able to crash the game or be
  unwinnable-by-construction (locked out content).

## 2. Feature: map log

Independent of §1 — do this first as a low-risk warm-up.

- New `src/ui/mapLog.ts` (or add to `screens.ts`, your call): `loadMapLog()`
  / `saveMapLog()` / `addMapLogEntry()`, same try/catch-around-localStorage
  pattern as `loadSettings`/`saveSettings` (`screens.ts:17-27`). Storage key
  `seventh-gun.maplog`.
- Entry: `{ seed: string; difficulty: Difficulty; genVersion: number; ts: number; outcome?: { won: boolean; timeSec: number; kills: number; gunsFound: number } }`.
  `outcome` is filled in when the run ends (hook into wherever the victory
  screen's stats string is built — `showVictory` call site in `game.ts`, and
  the death path) via `addMapLogEntry`/an update to the just-started entry.
- Dedupe on `seed+difficulty`, cap at 50 entries (drop oldest).
- UI: a "MAP LOG" button on the title screen (`screens.ts` `build()`, next to
  the existing `#seed-random` button) opening a simple scrollable list panel
  (reuse the `.screen`/`.panel` CSS classes already in `index.html`). Each
  row: seed, difficulty, date, outcome summary; click → fill
  `this.screens.seedInput.value` + set difficulty + call the existing
  `startRun`. If `entry.genVersion !== GEN_VERSION`, gray the row and append
  "— older build, layout may differ".

## 3. Feature: campaign mode

### Tier 1 (ship first, independent of §1)

- New `src/app/campaign.ts`: `CAMPAIGN_MAPS: { seed: string; difficulty: Difficulty; name: string }[]` — 7 curated entries (playtest and hand-pick seeds you like via the map log from §2).
- Campaign run state (which map you're on, whether prior maps in this run
  were won) lives in the `Game` class (app layer), not localStorage — it's
  per-session. Persist only "furthest map reached" to localStorage
  (`seventh-gun.campaign`) so the title screen can show progress.
- UI: "CAMPAIGN" button on title screen → picks map N, calls `startRun`,
  and on victory advances to N+1 instead of returning to title (until map 7).
- **Open question to resolve while implementing**: does player state
  (guns/ammo/HP) carry across maps in a campaign run, or reset each map?
  Resetting is simplest and matches the existing single-run mental model;
  carrying over needs a small "give player this loadout" hook into `Sim`
  init. Recommend: reset per map for v1 (simplest, and each map already
  ends with all 7 guns found by design), revisit if it feels bad in
  playtesting.

### Tier 2 (depends on §1 — `MapSpec`/`buildGameMap`)

- Author each of the 7 campaign maps as a committed `MapSpec` data file:
  `src/app/campaignMaps/map1.ts` … `map7.ts`, each exporting a `MapSpec`
  object literal (not a runtime-decoded share string — these ship in the
  build, so keep them as readable TS objects, not packed binary).
- Workflow to produce one: `generateMap(pickedSeed, 'normal')` → convert to
  a `MapSpec` (strip `grid`/`lights`/`decors`, they're re-derived) → hand-edit
  the fields that matter for authorial control: reorder `pickups` where
  `kind==='gun'` to force a specific gun order, edit `enemies` array for a
  specific mix/budget per room, edit `rooms[i].theme` for a deliberate visual
  arc. This is much easier to do *through the editor UI from §4* once it
  exists — order the work so the editor lands before hand-authoring maps
  5-7 if possible, and just hand-edit the TS objects for the first couple to
  unblock testing the campaign flow early.
- Difficulty handling for authored maps: the placement (room layout, enemy
  count, gun order) is fixed by design at "Normal". The difficulty selector
  should still apply the existing runtime stat multipliers (HP/damage/speed/
  accuracy/reaction/ammo-amount/medikit — `src/sim/difficulty.ts`) on top of
  the authored placement, but should **not** re-run the procedural
  enemy-count scaling (`diff.enemyCount` in `mapgen.ts:570` etc.) since
  placement is already fixed. Concretely: `buildGameMap` for an authored map
  applies difficulty only to the stats layer the `Sim` already reads at
  runtime, not to generation-time counts. Verify `Sim` doesn't otherwise
  assume `generateMap` already baked in count-scaling in a way that breaks
  for a map that didn't go through that path.
- Swap `campaign.ts`'s `CAMPAIGN_MAPS` from tier-1 seed pairs to
  `{ spec: MapSpec, name: string }[]`, loading via `buildGameMap(spec)`
  instead of `startRun(seed)`. `Sim`'s constructor currently calls
  `generateMap(seed, difficulty)` at `sim.ts:127` — give `Sim` an optional
  way to accept a pre-built `GameMap` instead of a seed (small constructor
  change, keep the seed path as the default).

## 4. Feature: level editor + share links

Depends on §1.

### Share links (`src/ui/shareLink.ts` — browser APIs live here, not in sim/)

```ts
export async function encodeMapToFragment(map: GameMap): Promise<string> // "#m=..."
export async function decodeMapFromFragment(hash: string): Promise<GameMap | null>
```
`encodeMap` (pure, §1d) → `CompressionStream('deflate-raw')` → base64url.
Reverse for decode. Wire into `game.ts` alongside the existing `?seed=`
handling (`game.ts:51-54`): on load, check `location.hash` for `m=`; if
present, `decodeMapFromFragment` → `validateMap` (§1e) → if no errors, offer
"Play shared map" (skip the normal seed/mapgen path entirely, hand the
decoded `GameMap` straight to `Sim`). If validation has errors, refuse and
say why; if only warnings, load with a banner.

**Browser support note**: `CompressionStream` is broadly supported in
current Chrome/Firefox/Safari but is a relatively recent API — decide
whether a no-compression fallback (raw base64url of the packed bytes,
~2-3x longer but still URL-safe) is worth the code for this project's
audience, or just accept modern-browsers-only. Flag, don't block on it.

### Editor UI (`src/ui/editor.ts` + a new screen, or `src/app/editor/`)

- Working document: an in-memory `GameMap`, built via `buildGameMap` from
  either (a) a blank starting spec, (b) `generateMap(seed, difficulty)` as a
  starting point to hand-tune, or (c) a decoded share link.
- Rendering: reuse `Hud.drawMinimap(sim, size, full)` (`src/ui/hud.ts:249`)
  as the drawing base for a 2D top-down canvas — it's the existing
  grid/room/door drawing code, already exercised by the full-map overlay.
  The editor needs a variant that also draws pickups/enemies and accepts
  click input for placement; factor the drawing primitives out of
  `drawMinimap` if they're not already reusable standalone.
- Tools (v1 scope — keep tight):
  - Room: drag-place a rect, pick theme/kind from a small palette.
  - Corridor: click room A, click room B, auto-place a straight or L-shaped
    3-wide link (reuse the `carveLink`-style logic from `mapgen.ts:263-274`,
    but as a pure function that returns a `Rect[]` instead of mutating a
    grid closure). **Keep corridors fixed at 3-wide for v1** — other systems
    (door placement, physics corridor assumptions) assume that width; widening
    this is a v2 concern, not part of this plan.
  - Door: click a room edge cell that's adjacent to a corridor; toggle
    locked. Reuse the adjacency validity rule from `tryDoor`
    (`mapgen.ts:284-315`) as a pure "is this a valid door position" check
    rather than duplicating it.
  - Pickup/enemy: click a floor cell, pick kind from a palette.
  - Delete/move for all of the above.
- "Test Play": run a real `Sim` against the working-doc `GameMap` in place
  (or launch the normal game view with it) so the author can playtest
  without leaving the editor.
- "Validate": live-run `validateMap` (§1e), list errors/warnings, and
  highlight the offending room/cell on the canvas (e.g. red outline for
  unreachable).
- "Share": `encodeMapToFragment` → show/copy the URL.
- Autosave the working doc to `localStorage` (`seventh-gun.editor.draft`) on
  every meaningful edit, so an accidental reload doesn't lose work. This is
  the one `localStorage` touch in the whole editor — keep it in `src/ui/` or
  `src/app/`, never let `mapformat.ts`/`mapValidate.ts` (sim-layer) touch it.

## 5. Suggested implementation order

1. **Map log** (§2) — independent, quick, validates the Cursor workflow on
   this repo before tackling the harder refactor.
2. **Campaign tier 1** (§3) — independent, quick, gives a shippable
   "campaign mode" immediately while tier 2 is pending.
3. **Corridors + grid-builder extraction** (§1a-1b) — the risky step.
   Do it alone, behind the temporary before/after regression test, and get
   the full existing test suite (`npm test`) green before moving on.
4. **`MapSpec` / `buildGameMap` + round-trip test** (§1c).
5. **Binary codec + validation** (§1d-1e), unit-tested in isolation
   (bit-writer round-trip fuzzing, decode of deliberately-corrupted input
   must throw cleanly not crash).
6. **Share links** (§4, shareLink.ts) — wire into `game.ts`, manual test in
   an actual browser (copy a link, open in a new tab).
7. **Editor MVP** (§4) — enough to hand-author a map end to end.
8. **Campaign tier 2** (§3) — author the 7 maps (via the editor once it
   exists), swap `campaign.ts` over.

## 6. Testing checklist

- `npm test` (vitest) must stay green throughout, especially
  `architecture.test.ts` (layer purity) and the 300-seed `mapgen.test.ts`
  sweep (procedural determinism/economy/reachability).
- Temporary before/after regression test for step 3 (delete once step 4's
  round-trip test supersedes it).
- New: `mapformat.test.ts` — bit-writer/reader round-trip fuzz, full
  `generateMap → toSpec → buildGameMap` equality, `encodeMap → decodeMap`
  byte-for-byte `GameMap` equality, and decode-of-corrupted-input throws
  `MapDecodeError` rather than crashing (truncated buffer, out-of-range
  indices, bad enum values — construct these by hand).
- Move the two BFS checks in `mapgen.test.ts` into `mapValidate.ts` (§1e)
  and have the test import + call them, rather than keeping two copies.
- Manual/browser: share-link round trip (encode on one tab, paste URL in
  another, confirm identical map); editor "test play" actually launches a
  working `Sim`; campaign tier-1 chains 7 maps correctly and persists
  progress across a page reload.

## 7. Open questions (resolve during implementation, not blocking)

- Campaign: reset player loadout each map, or carry over? (§3, recommend
  reset for v1.)
- Shared/edited maps that fail the *economy* warning (not structural
  errors): load with a banner, or refuse? (§1e, recommend load-with-banner.)
- `CompressionStream` fallback for older browsers — worth it for this
  project's audience? (§4.)
- Editor corridor width: fixed at 3 (matches everything else) or
  configurable later? (§4, recommend fixed for v1.)
