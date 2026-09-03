# SEVENTH GUN — implementation plan (multiplayer arena)

Instructions for the implementing agent. Decisions below are **locked**. Do
not re-open them. Do not add accounts, chat, voice, teams, jump, host
migration, or a second GitHub repo.

Maze, campaign, editor, and `#m=` stay behavior-identical. All existing unit
and e2e tests stay green. Do **not** bump `GEN_VERSION`. Arena generation
uses its own `ARENA_GEN_VERSION`.

Repo rules still apply: branch + PR per slice, conventional commits, keep
`docs/STATUS.md` current.

---

## 0. Locked decisions

1. **Mode.** One global deathmatch room. Max **10** players. No monsters.
   Permanent frag cycle; deaths respawn elsewhere on the same map. Roster
   is frags + deaths. Scores and map die when the last player disconnects.
   Next first join generates a new map.
2. **Feel.** Grounded Doom-like DM, not Quake air control. **No jump, no
   crouch, no sprint.** Same speed / radius / eye height as single-player
   (`6.5 u/s`, `PLAYER_RADIUS 0.55`, `PLAYER_EYE 1.7`). Verticality is
   indoor vs courtyard only.
3. **Map.** New generator `generateArena(seed)`, **not** a stretched maze
   spine. Grid **128×128** (`ARENA_GRID_W/H`). Looping routes, big rooms,
   extra links, no seal, no doors, no secrets, no key, no enemies. Thrown
   away with the room.
4. **Spawn kit.** Pistol + 70 bullets. Guns 2–7, ammo, medikits sit on
   pads and **respawn**. No powerups. No Bone Key.
5. **Balance.** Always Normal gun numbers (`playerDamageOut = 1`,
   `medikitHeal` from `DIFFICULTIES.normal`). Title SKILL does not apply.
   100 HP. Self-splash on Bile / Seventh stays (25% / 20%).
6. **Net model.** Server-authoritative `ArenaSim` at 60 Hz. Snapshots at
   **20 Hz**. Clients predict local movement against the local grid;
   interpolate everyone else (~100 ms). Hits, pickups, deaths, frags are
   server-only. Do **not** run a second `ArenaSim` on the client.
7. **Hosting.** **One git repo, one Fly.io app.** The Node process serves
   `dist/` and upgrades `/arena` to WebSocket. Same origin, no
   `VITE_ARENA_WS_URL` in production. Netlify remains **Deploy Preview
   only** (static; arena button fails with ARENA OFFLINE). Production URL
   is the Fly app. Do **not** split a second repository — the server
   imports `src/sim`.
8. **Names.** 2–16 chars `[A-Za-z0-9][A-Za-z0-9 _\-]*` after trim.
   `localStorage` key `seventh-gun.arenaName`. Empty → `PLAYER`. Dupes get
   ` (2)`, ` (3)`, … Collision is per live room, not global history.
9. **Idle / full / leave.** Idle kick **120 s** with no move / look / fire.
   Room full → `{ t: 'full' }` and close. ESC in arena does **not** pause
   the server: pointer lock drops, overlay RESUME / LEAVE ARENA, body
   still hittable. TAB in arena is the **scoreboard**, not the map overlay.
   Maze TAB is unchanged.
10. **Spawn protection.** 2.0 s **or** until first shot, whichever first.
    Incoming damage 0 during protect. Outgoing allowed.
11. **Suicides.** Splash self-kill: `deaths += 1`, `frags -= 1` (floor at
    0). Last-hit credit window 5 s; no credit → suicide.
12. **PoC cuts.** No chat, spectators, reconnect-to-same-body, anti-cheat
    beyond “server is authority + clamp speed/fire-rate”, map voting,
    mobile-specific netcode (touch already works; use it).

---

## 1. Architecture (the unlock)

Today there is one player and the sim lives in the browser:

```
input → Sim.step(input) → events → render / audio / HUD
```

Arena adds a dedicated sim and moves the tick to the server:

```
client input 20 Hz  →  ws  →  ArenaRoom
                                 ArenaSim.step(inputs[])   // 60 Hz, 1–10 players
                                 snapshot 20 Hz + events
client  ←  ws  ←  predict self, interpolate others, play events
```

**Do not** turn `Sim.player` into an array. `Sim` stays single-player.
`ArenaSim` is a sibling in `src/sim/arena.ts`. It reuses physics, weapons,
RNG, types, pickups. It has no enemies, no doors, no secrets, no seal, no
win, no fog-of-war, no powerups, no `phase === 'won'`.

One player dying must **not** freeze the room. Death is per-player
(`alive | dying | dead-pending-respawn`), not a sim-wide `phase`.

Map sync is the existing determinism gift: server picks `seed`, clients
call `generateArena(seed)` locally. Wire only live state (poses,
projectiles, pickup timers, scores). Send `ARENA_GEN_VERSION` + a 32-bit
grid hash on welcome; mismatch → disconnect with `GEN MISMATCH`.

### Physics widening (required, behavior-neutral)

`isSolidCell` / `circleFits` / `moveCircle` / `raycastWall` currently take
`Sim`. Extract a duck type in `src/sim/physics.ts`:

```
export interface SolidState {
  map: GameMap;
  doors: { cells: [number, number][]; offset: number; opening: boolean }[];
  secrets: { cells: [number, number][]; offset: number; opening: boolean }[];
  sealIntact: boolean;
}
```

`Sim` already satisfies this. `ArenaSim` uses `doors: []`, `secrets: []`,
`sealIntact: false`. Maze unit tests and the 300-seed sweep must be
byte-identical. If they drift, revert the extraction.

### Layers

```
server/          Node process (ws, HTTP static). May use crypto. May import sim.
src/sim/         still pure. ArenaSim + generateArena live here.
src/net/         browser WebSocket client, protocol types, prediction.
src/app/         Game orchestrator grows runKind: 'arena'.
src/render/      other-player meshes. World already uses map.w/h.
src/ui/          title button, name panel, scoreboard, connection copy.
```

Architecture test: extend the purity walk so `src/sim` still has no
`three` / `Math.random` / DOM / `localStorage`, and **never imports
`server/` or `src/net/`**. `src/net` is browser-only (WebSocket) and must
not import Three. `server/` is outside `src/` on purpose.

`GEN_VERSION` (maze) stays 4. New constant:

```
export const ARENA_GEN_VERSION = 1;
export const ARENA_GRID_W = 128;
export const ARENA_GRID_H = 128;
export const ARENA_MAX_PLAYERS = 10;
export const ARENA_TICK_HZ = 60;
export const ARENA_SNAPSHOT_HZ = 20;
```

in `src/sim/types.ts` (or `src/sim/arena.ts` re-exported). Maze `GRID_W/H`
remain 88. Editor stays 88. Codec / campaign / `#m=` untouched.

---

## 2. Build as three PRs

Do not dump this into one branch. Land in this order; each PR is
independently reviewable. PR 2 is the first thing a human can play
locally (two browsers). PR 3 is production.

| PR | Branch | What ships |
|---|---|---|
| 1 | `feat/arena-sim` | `SolidState`, `generateArena`, `ArenaSim`, unit tests. No UI, no sockets. |
| 2 | `feat/arena-client` | Node server, protocol, title **MULTIPLAYER ARENA**, name, meshes, scoreboard, local `npm run arena`. |
| 3 | `feat/arena-fly` | Dockerfile + `fly.toml`, server serves `dist/`, GitHub Action on `main`, Netlify documented as preview-only. |

PR 2 depends on 1. PR 3 depends on 2.

---

## 3. PR 1 — Arena sim + generator

Headless only. After this PR, `npm test` covers a 10-player deathmatch
with dummy inputs and a 100-seed arena sweep. Nothing in the title
screen changes.

### 3.1 `generateArena(seed: string): GameMap`

File: `src/sim/arenagen.ts`. Own RNG streams:

```
layout: makeRng(`SGA|v${ARENA_GEN_VERSION}|${seed}`)
content: makeRng(`SGA|v${ARENA_GEN_VERSION}|${seed}|pads`)
```

No difficulty stream. No `Math.random`.

**Layout target (assert in the sweep, with slack):**

- 128×128 grid, 1-cell border solid.
- **18–24 rooms**, mix of indoor and **3–5 courtyards**. Room sizes larger
  than maze spine: typical 10×10 to 16×14, plus 1–2 big wells ~20×16.
- Corridors **3 cells** wide (same as maze). Prefer **loops**: at least
  **4** extra links so the dual graph is not a tree. No single chokepoint
  that splits the map.
- All floor cells reachable from all others (flood fill).
- **No doors, no seal cells, no secrets, no enemies, no key.**
- `GameMap` still has the existing required fields. Fill them so the
  world renderer does not crash:
  - `doors: []`
  - `seal: { cells: [], x: 0, z: 0 }` (or whatever `SealDef` needs;
    **empty `cells`** so no seal mesh)
  - `sealBreak: { type: 'gun', gun: 7 }` (unused)
  - `secrets: []`, `enemies: []`
  - `arenaRoomId` / `startRoomId` / `antechamberId` = some real room ids
    (largest room is fine for `arenaRoomId`)
  - `vaultRoomId: -1`
  - `playerStart` = center of a mid-size room (unused by ArenaSim spawns
    but valid)
  - `w/h` = 128, `version` = `ARENA_GEN_VERSION`, `seed` set, `difficulty:
    'normal'`
- Themes: cycle the existing four (`industrial` / `organic` / `stone` /
  `tech`). Courtyards `outdoor: true`.
- Cosmetics: reuse `placeCosmetics` / equivalent from `cosmetics.ts` with
  the layout rng **after** rooms exist. Do not call maze `generateMap`.
  Do not change maze cosmetics rng order.

**Pads (content stream):**

| Kind | Count (approx) | Respawn |
|---|---|---|
| gun 2 (Ripjaw) | 2 | 25 s |
| gun 3 (Hornet) | 2 | 25 s |
| guns 4, 5, 6, 7 | 1 each | 25 s |
| ammo boxes | ~1.2 × roomCount, mixed types | 12 s |
| medikits | ~0.6 × roomCount | 20 s |

Place on walkable cells, not stacked on the same cell, not in 1-cell
alcoves. Guns prefer room interiors; ammo may sit in corridors. No pistol
pad (spawn weapon).

Export respawn constants from `src/sim/arena.ts` so sim and tests agree:

```
ARENA_RESPAWN_GUN = 25
ARENA_RESPAWN_AMMO = 12
ARENA_RESPAWN_MEDIKIT = 20
ARENA_SPAWN_PROTECT = 2
ARENA_DEATH_LOCKOUT = 2
ARENA_IDLE_S = 120
ARENA_LAST_HIT_S = 5
```

Do **not** put respawn seconds on `PickupDef` if that changes the codec.
Store them in `ArenaSim` by `kind` / `gun`.

### 3.2 `ArenaSim`

File: `src/sim/arena.ts`.

```
class ArenaSim {
  map: GameMap;
  time: number;
  players: ArenaPlayer[];
  projectiles: ArenaProjectile[];
  pickups: ArenaPickup[];   // taken, takenAt, respawnAfter
  events: ArenaEvent[];
  rng: Rng;                 // makeRng(`arena|${seed}|v${ARENA_GEN_VERSION}`)
  nextPlayerId: number;     // 1.. reuse freed ids
  nextProjId: number;
}
```

`ArenaPlayer`:

```
id, name, x, z, yaw, pitch, hp, maxHp,
gun, owned: boolean[8], ammo: Record<AmmoType, number>,
fireCd, dryCd, bloom, useCd,
alive: boolean, deathTimer: number, spawnProtectUntil: number,
frags, deaths, lastHitBy: { id: number; at: number } | null,
input: SimInput,     // last applied
idleFor: number,
colorIndex: number   // 0..9, assigned at join
```

Construction: `new ArenaSim(seed)` → `generateArena(seed)`, empty
`players`.

**API:**

- `join(name: string): ArenaPlayer | 'full'` — cap 10. Sanitize name.
  Spawn. `colorIndex` = lowest free 0..9.
- `leave(id: number): void` — drop player; projectiles they fired remain
  (owner id on projectile). If `players.length === 0` the **room** (PR 2)
  destroys the sim; `ArenaSim` itself just sits empty.
- `setInput(id, input: SimInput): void`
- `step(dt = STEP_DT): void` — 60 Hz. For each alive player: gun switch,
  yaw/pitch from input, `moveCircle` at 6.5 u/s, separate players
  (`pushCircleOut` with `PLAYER_RADIUS`), fire, pickups. Step
  projectiles. Respawn timers. Per-player death lockout → `respawn(p)`.
- `takeEvents(): ArenaEvent[]`
- `snapshot(): ArenaSnapshot` — the 20 Hz payload (pure data).

**Spawn.** Collect walkable cells where `circleFits`. Prefer rooms, not
thin corridors. Try 12 candidates: farthest from the nearest living
player, min 16 u if possible, else accept. Yaw random from player rng
slice `makeRng(\`spawn|${seed}|${id}|${spawnCount}\`)`. Reset loadout to
pistol + 70 bullets, HP 100, bloom/cds 0, `spawnProtectUntil = time + 2`.

**Fire.** Copy the personality of `Sim.tryFire` / `hitscanShot` /
`stepProjectiles` **against players instead of enemies**. Do not call
into `Sim`. Do not apply difficulty or powerup multipliers. Hitscan
cylinder = `PLAYER_RADIUS` (gun radius = same; no crawler overhang),
y = `[0, PLAYER_HEIGHT]`. Sunlance pierces players. Ignore the shooter.
Ignore spawn-protected targets for **incoming** damage. Projectiles
carry `ownerId`. Splash damages every non-protected player in radius;
owner takes `damageSelfPct` as today.

**Kill.** `hp <= 0` → `alive = false`, `deathTimer = 2`, `deaths += 1`,
credit frags or suicide as in §0.11, event `playerDie`. After 2 s,
`respawn`. Keep a corpse pose (last x/z/yaw) until respawn so the
renderer can play a simple collapse.

**Pickups.** Touch radius ~1.1 u, same as maze if it already has one —
match `Sim` pickup distance. Gun: set `owned[g] = true`, add
`spawnAmmo`, switch to it if new. Ammo: add `boxAmmo` capped at max.
Medikit: heal `DIFFICULTIES.normal.medikitHeal`, cap at 100; do not
take if already 100 (leave it for someone else). On take: `taken =
true`, `takenAt = time`. On `time >= takenAt + respawnAfter`: `taken =
false`. Events `pickup` as today.

**Idle.** `idleFor += dt` if `moveX/Z == 0` and fire false and yaw/pitch
unchanged vs last step. Else reset. Crossing `ARENA_IDLE_S` emits
`kick { id, reason: 'idle' }`; the room (PR 2) closes that socket.
`ArenaSim` just flags it.

**Clamp.** Ignore `moveX/Z` outside `[-1, 1]`. Fire rate is `fireCd` from
`WEAPONS[gun].fireInterval`, never client-supplied. Speed is 6.5, never
client-supplied.

### 3.3 Events / snapshot

Reuse existing `SimEvent` tags where they already drive audio/FX
(`shot`, `dryfire`, `tracer`, `beam`, `spawnProjectile`, `explosion`,
`playerHurt`, `playerDie`, `pickup`). Add:

```
| { t: 'frag'; killerId: number; victimId: number; suicide: boolean }
| { t: 'playerJoin'; id: number; name: string; colorIndex: number }
| { t: 'playerLeave'; id: number }
| { t: 'kick'; id: number; reason: 'idle' | 'full' }
```

`playerHurt` needs `id` in arena (who was hurt). Either extend the event
or add `arenaPlayerHurt { id, damage, fromAngle }`. Do not change the
maze event shape if that breaks audio — keep arena events in
`ArenaEvent` and map them in the client.

Snapshot (JSON-friendly):

```
{
  tick: number,
  players: { id, name, x, z, yaw, pitch, hp, gun, ownedMask, alive,
             spawnProtect, frags, deaths, colorIndex }[],
  projectiles: { id, kind, x, y, z }[],
  pickups: { id, taken: boolean }[],   // id matches map.pickups
}
```

`ownedMask` is a u8 bitfield bits 1–7.

### 3.4 Tests (`tests/unit/arena.test.ts`, `tests/unit/arenagen.test.ts`)

**Generator (100 seeds `arena-0` … `arena-99`):**

- `w === h === 128`, flood-fill connected, no enemies/doors/secrets.
- Room count in range, ≥ 3 courtyards, ≥ 4 extra links (or “cycle count
  ≥ 1” if links are hard to count — pick one assertion and keep it).
- Guns 2–7 present at least once; at least one medikit; at least one
  ammo box.
- Same seed ⇒ identical `grid` + pickup positions (hash).
- Different seeds ⇒ different grid hash (allow a tiny collision slack,
  e.g. < 2/100).

**Sim:**

- Two players, scripted hitscan: pistol kills, frag +1 / death +1,
  victim respawns at a different cell after 2 s, HP 100, pistol only.
- Spawn protect: damage in the first 1 s is ignored; after 2 s it lands.
- Firing during protect strips protect (or wait 2 s — implement
  whichever-first as locked).
- Pickup taken disappears, reappears after the constant (± one step).
- Medikit not consumed at 100 HP.
- 10 joins succeed, 11th returns `'full'`.
- Splash self-kill: frags 0, deaths 1 (start from 0 frags).
- Determinism: two `ArenaSim`s, same seed, same join order, same input
  tape ⇒ equal snapshots at T = 3 s.
- Idle flag after `ARENA_IDLE_S` with zero input.
- `SolidState` refactor: existing `tests/unit/physics.test.ts` and
  `mapgen.test.ts` 300-seed sweep **unchanged hashes**.

Architecture test still green. No e2e in PR 1.

### 3.5 Docs for PR 1

Update `docs/STATUS.md` (arena sim landed, no net yet). Add a short
paragraph to `docs/ARCHITECTURE.md` under a new “Arena sim” heading —
implementation exists, not wired. Do not rewrite GAME-DESIGN numbers
until PR 2 ships the mode.

---

## 4. PR 2 — Server, protocol, client

Playable on localhost with two browser windows. Still no Fly.

### 4.1 Protocol (`src/net/protocol.ts`)

JSON text frames, one object per message, field `v: 1` and `t: string`.
Unknown `t` ignored. `v !== 1` → close.

**Client → server**

```
{ v:1, t:'join', name:string }
{ v:1, t:'input', seq:number, moveX, moveZ, yaw, pitch, fire, switchGun }
{ v:1, t:'ping', at:number }
```

Send `input` at 20 Hz while in the room (client rAF, down-sample).
`seq` increments. `switchGun` is `number | null`.

**Server → client**

```
{ v:1, t:'welcome', id, seed, genVersion, gridHash, tick, snapshot }
{ v:1, t:'snapshot', tick, ackSeq, snapshot }          // 20 Hz
{ v:1, t:'event', e: ArenaEvent }                      // as they happen
{ v:1, t:'full' }
{ v:1, t:'kicked', reason: 'idle' | 'gone' | 'mismatch' }
{ v:1, t:'pong', at, serverTime }
```

`welcome.snapshot` is the first pose so the client can spawn without
waiting a frame. `ackSeq` is the last processed input seq for **that**
client (prediction reconcile).

Keep payloads small; do not send the grid.

### 4.2 Server (`server/index.ts`, `server/room.ts`)

Node 22, ESM. Dependency: **`ws` only** (plus existing tree). Listen
`process.env.PORT ?? 8080`.

- `GET /health` → `200 ok`
- `GET /` and static files: in PR 2, **not required** if Vite proxies.
  Implement a tiny static fallback anyway (`dist/` if present) so PR 3
  is a config change, not a rewrite.
- `GET /arena` (or any HTTP on that path) → **WebSocket upgrade** via
  `ws`. Do not use Socket.IO.

`ArenaRoom` (one global instance):

- `players: Map<WebSocket, { id, lastInputAt, lastSeq }>`
- `sim: ArenaSim | null`
- On first join: `seed = crypto.randomBytes(4).toString('hex')`,
  `sim = new ArenaSim(seed)`, `join(name)`.
- On each `input`: `setInput`, record seq.
- `setInterval` 60 Hz: `sim.step(STEP_DT)`. Every 3rd tick, broadcast
  `snapshot`. Drain `takeEvents()` and send each `event` (or batch as
  `{ t:'events', es }` if volume hurts — either is fine).
- Heartbeat: if no message for 5 s, close.
- On close / kick: `sim.leave(id)`. If `sim.players.length === 0`,
  `sim = null` (map discarded).
- Join while `sim.players.length >= 10` → `full` + close, do not create
  a second room.

Server may use `crypto`. Server must not import Three, DOM, or `src/app`.

Run with `tsx` in dev (`devDependency`). Production bundle is PR 3.

### 4.3 Vite proxy + scripts

`vite.config.ts` (create if missing; today Vite runs on defaults):

```
server: { proxy: { '/arena': { target: 'ws://localhost:8080', ws: true } } }
```

`package.json` scripts:

```
"arena": "npx tsx server/index.ts"
"dev": "vite"    // unchanged; run `npm run arena` in a second shell
```

Document in README: two terminals, `npm run arena` then `npm run dev`.
Client default URL:

```
const arenaUrl = import.meta.env.VITE_ARENA_WS_URL
  ?? `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/arena`;
```

With the proxy, browser talks to `ws://localhost:5173/arena`. No env
needed locally.

### 4.4 Browser client (`src/net/client.ts`)

`ArenaClient`: connect, join, send input, hold latest snapshot, event
queue, `onDisconnect`. Prediction:

- Keep a short buffer of sent `{ seq, input }`.
- On snapshot, set local `x,z` to server pose for **self** if
  `|dx|+|dz| > 0.35` (hard snap) else leave predicted; drop acked seqs;
  replay un-acked inputs through `moveCircle` on a `SolidState` built
  from the local `GameMap` (empty doors/secrets).
- Remote players: interpolate between previous and current snapshot
  with a 100 ms delay. Do not extrapolate in v1.
- Projectiles: render at snapshot positions (20 Hz is enough for nails
  vis; accept stutter on void orbs). Optional: locally advance with
  last velocity if you already have it — not required.

`src/net/` must not import `server/`.

### 4.5 Title / Game wiring

**Title** (`src/ui/screens.ts`): new big button **MULTIPLAYER ARENA** on
its own row under the MAP LOG / CAMPAIGN / EDITOR row (or beside
EDITOR if the row wraps — match existing `.big` tap size). Does **not**
start a maze.

Click → panel (same `#screens` system):

- NAME input, prefilled from `seventh-gun.arenaName`
- JOIN / CANCEL
- status line: `CONNECTING…` / `ARENA FULL` / `ARENA OFFLINE` /
  `KICKED: IDLE` / `GEN MISMATCH`

JOIN saves the name (fail soft on quota), opens the socket, waits for
`welcome`. On welcome: `Game.startArena(welcome)`.

`runKind: 'maze' | 'map' | 'campaign' | 'arena'`.

`startArena`:

- `generateArena(seed)` locally; verify hash; mismatch → kicked copy,
  return to title.
- Do not write map log. Do not touch campaign progress.
- `renderer.setRun` with maze textures (not campaign packs), **fog of
  war off**: fill `explored` with `1` or skip the explored check in HUD
  when `runKind === 'arena'`.
- Pointer lock as maze.
- Loop: poll input from **predicted / last server** yaw (camera stays
  look authority, same `pullAimFromCamera` as maze). Send `input` 20 Hz.
  Do **not** call `Sim.step`. Drain client events into `handleEvent`
  (audio/FX/HUD hurt flash).

Death: **do not** go to title, **do not** epitaph. 2 s lockout (no
move/fire) then server respawns; client follows snapshot. Keep HUD.

ESC: pause overlay variant for arena — RESUME (re-lock pointer) + LEAVE
ARENA (close ws, `sim = null` locally, title). World keeps simulating.
SKILL / RESTART SEED / NEW MAZE hidden.

TAB: scoreboard overlay, not `phase === 'map'`. Minimap stays the 22-cell
window. No full-map overlay in arena.

Disconnect mid-fight → title + `DISCONNECTED`.

### 4.6 Render / HUD

**Other players** — new `src/render/marines.ts` (name is fine). Procedural
box marine, one palette per `colorIndex` (10 distinct, readable on dark
walls). First-person: **do not** draw self (optional blob shadow only).
Walk bob from speed. Death: tip over in 2 s. Nameplate + thin HP bar
above others (depth-tested). Reuse blob-shadow pattern from enemies.

`GameRenderer.update` today takes `Sim`. Add `updateArena(dt, view)`
where `view` has `{ map, local, others, pickups, projectiles, moving }`.
Do not force `ArenaSim` to masquerade as `Sim`. PickupRenderer can take
the pickup list + map. Hide `EnemyRenderer` in arena.

World: `buildWorld` already iterates `map.w/h`. Confirm it does not
assume 88. Camera far plane 500 is enough for 128×2 = 256 u. Fog far
may bump to ~72 so courtyards read; keep color `MAZE_FOG`.

HUD: existing health / ammo / 7 slots from **local** player. Compact
frag list top-left (name, frags), local row highlighted. TAB panel:
all players sorted by frags then deaths, colors matching marines.
Connection `n/10` in the corner.

Audio: map arena events onto existing `shot` / `playerHurt` /
`playerDie` / `pickup` / `explosion`. Spatialise others’ shots if the
engine already has x/z; otherwise play as now. No new synths required.

### 4.7 Debug API (`?e2e=1` only)

```
__GAME__.arena = {
  connected, id, seed, players, scores, tick
}
joinArena(name?: string)
leaveArena()
```

Never drive pointer lock with synthetic mousemove.

### 4.8 Tests

- `tests/unit/protocol.test.ts` — round-trip join/input/snapshot;
  unknown `t` ignored.
- `tests/unit/room.test.ts` — two fake `ws`-like sockets, join, first
  join creates seed, second sees same seed, 11th gets `full`, last
  close nulls the sim, next join gets a **different** seed.
- E2E (`tests/e2e/arena.spec.ts`): start `tsx server/index.ts` alongside
  preview **or** skip if `ARENA_E2E=0`. Desktop only. Title button
  visible; `joinArena('TEST')` via debug; `arena.connected === true`;
  `players.length === 1`. Do **not** require two Playwright contexts in
  v1. Existing maze e2e stays green (button must not break title
  layout / ENTER THE MAZE).

Existing `playwright.config.ts` webServer is `vite preview` without the
arena process. Either:

- document `ARENA_E2E=0` default so CI without a server skips the spec,
  or
- add a second webServer command `npx tsx server/index.ts` (Playwright
  supports one webServer — then use a `pre` script that spawns both, or
  skip e2e until PR 3 when the preview **is** the Node server).

**Locked:** PR 2 e2e may `test.skip` if `/health` on `:8080` is down.
PR 3 makes the preview server the Node process so the spec runs for
real.

### 4.9 Docs for PR 2

`GAME-DESIGN.md`: new “Arena” section (grid 128, pads, respawn times,
spawn kit, no jump, max 10, Normal numbers). `ARCHITECTURE.md`: net
loop. `DECISIONS.md`: the §0 list in short form. `TESTING.md`: new
files. `STATUS.md`. `README.md`: how to run two-terminal arena.

---

## 5. PR 3 — Fly.io production

One deployment. The Fly machine **is** the website and the room.

### 5.1 Dockerfile

Multi-stage, Node 22:

1. `npm ci`, copy sources, `npm run build` (tsc + vite → `dist/`).
2. Bundle the server with esbuild so it inlines `src/sim/**`:

   ```
   npx esbuild server/index.ts --bundle --platform=node --format=esm
     --outfile=server/bundle.mjs --external:ws
   ```

3. Runtime image: copy `dist/`, `server/bundle.mjs`, `package.json`,
   `npm install --omit=dev ws`. `ENV PORT=8080`. `CMD ["node",
   "server/bundle.mjs"]`.

Static: `server/index.ts` uses `node:http` + `ws`. For non-upgrade GET:

- `/health` → `ok`
- files under `dist/` (mime types for `.html .js .css .svg .ico .png
  .woff2`)
- SPA fallback: `dist/index.html` for unknown paths
- never cache `index.html`; cache hashed `/assets/*` for 1 y

WebSocket: only path `/arena`.

Do not import Vite at runtime.

### 5.2 `fly.toml`

```
app = "seventh-gun"          # or seventh-gun-arena if taken
primary_region = "iad"       # change if the owner is EU; do not multi-region

[http_service]
  internal_port = 8080
  force_https = true
  auto_stop_machines = "off"
  auto_start_machines = true
  min_machines_running = 1   # always-on; PoC cost is the point of a global room

[[vm]]
  size = "shared-cpu-1x"
  memory = "512mb"
```

512 MB: Node + one 128² map + Ten WebSockets is comfortable; 256 MB is
tight with a Vite-sized `dist` mapped into the process. Do not add a
volume — the map is in memory.

`ws` over Fly HTTPS works on the same port. Do not open a second
service.

### 5.3 GitHub Action

Repo has no `.github/` yet. Add `.github/workflows/fly.yml`:

- on push to `main`
- `flyctl deploy --remote-only`
- secret `FLY_API_TOKEN` (owner sets this; the agent documents it, does
  not invent a token)

Do **not** deploy Fly from PR branches in v1 (no preview apps).

### 5.4 Netlify

Leave `netlify.toml` as-is so Deploy Previews keep working for maze /
campaign / editor. On a preview, `/arena` is not a WebSocket → JOIN
shows **ARENA OFFLINE**. That is acceptable.

Production: Fly is canonical. In `README.md` / `AGENTS.md` / `DECISIONS.md`
state: verify maze previews on Netlify; verify arena on Fly (or local
`npm run arena`). Optionally unpublish the Netlify production site so
there is one public URL — that is the owner’s click in the Netlify UI,
not something to script in v1.

### 5.5 Client URL

Production needs no env var (same origin). If someone still serves the
static build from Netlify and wants to point at Fly, they can set
`VITE_ARENA_WS_URL=wss://<app>.fly.dev/arena` at build time. Default
code path stays same-origin. Do not hardcode a fly.dev host in source.

### 5.6 Playwright / preview

Change `playwright.config.ts` `webServer.command` to the Node server
serving `dist/` (build once, `PORT=4173 node server/bundle.mjs` or
`npx tsx server/index.ts` with `PORT=4173`). Then e2e hits the same
origin as production and the arena spec can run without skip. Maze e2e
must still pass (static assets + debug API).

### 5.7 Docs for PR 3

`AGENTS.md` Run / Deploy sections: Fly is production, `fly deploy`,
Netlify previews. `README.md` likewise. `STATUS.md`. Record the live
app name in DECISIONS once created.

---

## 6. Files to add / touch (summary)

**New**

- `src/sim/arena.ts` — ArenaSim, constants, snapshot types
- `src/sim/arenagen.ts` — generateArena
- `src/net/protocol.ts` — message types + tiny guards
- `src/net/client.ts` — ArenaClient + prediction
- `src/render/marines.ts` — other-player meshes
- `server/index.ts` — http + ws + static
- `server/room.ts` — ArenaRoom
- `tests/unit/arena.test.ts`
- `tests/unit/arenagen.test.ts`
- `tests/unit/protocol.test.ts`
- `tests/unit/room.test.ts`
- `tests/e2e/arena.spec.ts`
- `Dockerfile`
- `fly.toml`
- `.github/workflows/fly.yml`
- `vite.config.ts` if not present (proxy)

**Touch**

- `src/sim/physics.ts` — `SolidState`
- `src/sim/types.ts` — arena constants (or keep them in arena.ts and
  re-export)
- `src/sim/index.ts` — re-export arena / arenagen
- `src/app/game.ts` — `runKind: 'arena'`, loop branch, debug API, ESC/TAB
- `src/ui/screens.ts` — button, name panel, arena pause copy
- `src/ui/hud.ts` — scoreboard, skip fog-of-war when arena
- `src/render/renderer.ts` — `updateArena`, fog far, hide enemies
- `src/audio/audio.ts` — only if new event tags need a case
- `package.json` — `ws`, `tsx` (dev), scripts `arena`
- `playwright.config.ts` — PR 3 webServer
- `tests/unit/architecture.test.ts` — sim must not import net/server
- Docs listed per PR

**Do not touch**

- `src/sim/mapgen.ts` (maze) except accidental imports — **no GEN_VERSION
  bump**, no shuffle change
- Campaign JSON, editor model, mapcodec
- Weapon numbers

**Allowed new npm deps:** `ws`, `@types/ws`, `tsx` (dev). Nothing else
(`socket.io`, Redis, Express, Three on the server — no). esbuild is
already in the tree via Vite.

---

## 7. Invariants (break these and the PR is not done)

- `npm test` green, including the 300-seed **maze** sweep at `GEN_VERSION
  4` with **identical** hashes.
- `npm run test:e2e` green for existing desktop + mobile maze/campaign
  flows.
- `tsc --noEmit` clean.
- Architecture: `src/sim` has no Three, `Math.random`, DOM, `localStorage`,
  and no imports from `render` / `ui` / `audio` / `app` / `net` / `server`.
- Maze title, death, victory, campaign, editor: no copy or control
  changes except the extra title button.
- One room. Ten players. Last leave deletes the map. Next join is a new
  seed.
- Clients never decide hits or pickups.
- Production is one Fly process serving both HTTP and `/arena`.
- No second GitHub repository.
- No jump.

---

## 8. Implementation notes the first agent always forgets

- **`GameMap.w/h` is already the size.** Renderer, physics, HUD minimap
  use `map.w`, not `GRID_W`. Editor and maze mapgen still hardcode 88 —
  leave them. Arena maps must set `w/h = 128` or the world is 88 of
  garbage.
- **`owned` is length 8, index 0 unused, 1–7 guns.** Match `Sim`.
- **`isSolidCell` out-of-bounds is solid.** A 128 map with a 1-cell
  border is enough; still clamp spawns to `circleFits`.
- **Do not JSON.stringify `Uint8Array` grids.** Hash with a small
  djb2/fnv in both server and client (`src/sim` helper) for the welcome
  mismatch check.
- **Camera is look authority** in `game.ts` (`pullAimFromCamera`). Arena
  must keep that: send yaw/pitch from the camera, do not let snapshots
  snap the view (snapping x/z is OK; snapping yaw feels like rubber).
- **TAB and ESC are already bound.** Arena must branch on `runKind`
  inside the existing input handlers, not add a second listener that
  fights the map overlay.
- **Pointer lock:** name panel is DOM (pointer-events on). After JOIN
  succeeds, lock on canvas click like maze. Failure paths must not leave
  a stuck lock.
- **`ws` and Vite proxy:** the browser URL is `/arena` on the Vite
  origin. The Node server must listen for the upgrade on `/arena`, not
  `/`. Fly same.
- **First-player seed:** `crypto.randomBytes`, not `Math.random`, even
  in `server/` (habit; also avoids pulling a non-deterministic value
  into a test if someone later imports it).
- **Empty room:** destroy `ArenaSim` on last close, including idle-kick
  of the last player. A lingering empty sim with an old map violates
  §0.1.
- **Pickup `id`s** must be stable in `generateArena` (0..n in placement
  order) so snapshot `{ id, taken }` matches the client’s generated
  list.
- **Sunlance pierce** hits multiple players along the ray, stops at
  walls. Copy maze wall test (`raycastWall`).
- **Grenade floor:** maze uses `ny <= radius && gravity > 0` as impact.
  Copy that or bile never explodes.
- **Mobile:** new button same `.big` hit target. Name field must be
  `pointer-events: auto` and not steal the later look-stick. Skip extra
  netcode.
- **Do not serve `src/` from Fly.** Only `dist/` + the bundled server.
- **Fly auto_stop off + min 1** is intentional so the global room is
  not a cold start. Do not “optimize” back to sleep; that reopens the
  Netlify-shaped problem.
- **PR size:** PR 1 is sim-only so the 300-seed sweep review is
  isolated. Do not sneak title-button CSS into PR 1.
- **Secrets / fog / powerups** are campaign features. Arena generator
  must not place them; HUD must not wait on `explored`.
- **E2E and pointer lock:** use `joinArena` on the debug API, then
  assert HUD/state. Do not synthesize mousemove.

---

## 9. Suggested implementation order inside each PR

Work the list; do not start Fly in PR 1.

**PR 1:** physics `SolidState` → compile green → `arenagen` + 100-seed
test → `ArenaSim` join/step/fire/pickup/respawn tests → architecture
guard → STATUS.

**PR 2:** protocol types → `ArenaRoom` + fake-socket tests → `server/`
listens → Vite proxy → `ArenaClient` → title panel → `Game.startArena`
loop → marines + scoreboard → death/ESC/TAB → debug API → optional e2e
skip.

**PR 3:** static file serving in `server/index.ts` → Dockerfile local
`docker run` smoke (`/health` + `index.html`) → `fly.toml` → first
`fly launch` / `fly deploy` (owner token) → GH action → point
playwright at Node → docs.

Human playtest after PR 2 (two local browsers) and after PR 3 (two
devices on Fly). No amount of unit tests replaces “did I shoot my
friend.”
`)