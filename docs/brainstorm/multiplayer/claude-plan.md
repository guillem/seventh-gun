# SEVENTH GUN — Multiplayer Arena implementation plan (final)

Written by Claude (Fable 5.1) on 2026-09-03 after reading the codebase and
`docs/brainstorm/multiplayer/grok-plan.md`. Self-contained: an implementing
agent does not need the brainstorm chat or Grok's plan. Where this plan and
Grok's disagree, this plan wins. Decisions in §0 were made with the owner
and are **locked**.

Maze, campaign, editor and `#m=` stay behavior-identical. All existing unit
and e2e tests stay green. `GEN_VERSION` stays 4. Repo rules apply: branch +
PR per slice, conventional commits, keep `docs/STATUS.md` current.

---

## 0. Locked decisions

1. **Hosting: Cloudflare Workers + one Durable Object (DO), Workers Free
   plan.** No Fly.io. No card on the Cloudflare account, ever. One git
   repo, one Worker that serves the static build *and* upgrades `/arena`
   to a WebSocket. The DO named `global` is the single room.
2. **Netlify stays untouched as a static mirror.** Only change: publish
   path becomes `dist/client` (the Cloudflare Vite plugin moves the
   client build there). The arena button on Netlify shows `ARENA
   OFFLINE`. Retiring Netlify is a later owner decision, not part of this
   work.
3. **Mode.** One global deathmatch room, max **10** players, no monsters,
   permanent frag cycle, respawn on the same map. Roster = frags + deaths.
   Map and scores die when the last player leaves; next first join makes a
   new seed.
4. **Feel.** Grounded Doom-style. No jump / crouch / sprint. Same speed,
   radius, eye height as single-player (`6.5 u/s`, `PLAYER_RADIUS 0.55`,
   `PLAYER_EYE 1.7`, `src/sim/sim.ts:275`, `src/sim/types.ts:12-14`).
5. **Map.** New generator `generateArena(seed)`, **96×96** cells
   (`ARENA_GRID = 96`, a constant so it can change), dense rooms, loops,
   no doors / seal / secrets / key / enemies. Not a stretched maze spine.
6. **Spawn kit.** Pistol + `WEAPONS[0].spawnAmmo` (70). Guns 2–7, ammo,
   medikits sit on pads and respawn. No powerups, no Bone Key.
7. **Balance.** Always Normal numbers (`DIFFICULTIES.normal`). Title SKILL
   does not apply. 100 HP. Self-splash stays (Bile 25 %, Seventh 20 %).
8. **Net model.** Server-authoritative `ArenaSim` at 60 Hz in the DO.
   Snapshots at **20 Hz**. Client sends batched inputs at **15 Hz** (4
   ticks per message). Client predicts its own movement and reconciles;
   remote players are interpolated ~100 ms behind. Hits, pickups, deaths,
   frags are server-only. **No lag compensation in v1** (documented as a
   known feel issue).
9. **Combat code is shared, not copied.** Target-agnostic helpers are
   extracted from `Sim` into `src/sim/combat.ts` and used by both `Sim`
   and `ArenaSim`. A golden determinism test recorded *before* the
   extraction proves the maze is unchanged. If it cannot be made
   byte-identical, copy instead and say so in the PR.
10. **Names.** 2–16 chars, `[A-Za-z0-9][A-Za-z0-9 _\-]*` after trim, else
    `PLAYER`. Stored in `localStorage` key `seventh-gun.arenaName` (app
    layer only). Duplicates in the live room get ` (2)`, ` (3)`.
11. **Idle / full / leave.** Idle kick after **120 s** with no move, look
    change or fire. Room full → `{ t: 'full' }` and close. ESC in the arena
    does not pause anyone: pointer lock drops, overlay RESUME / LEAVE
    ARENA, your body stays hittable. TAB is the **scoreboard**. Maze TAB
    unchanged.
12. **Spawn protection** 2 s or until first shot. Incoming damage 0 while
    protected, outgoing allowed. **Death lockout** 2 s, then server
    respawns you far from the living.
13. **Suicides.** `deaths += 1`, `frags -= 1` (floor 0). Last-hit credit
    window 5 s; no credit → suicide.
14. **Cuts.** No chat, spectators, reconnect-to-same-body, teams, host
    migration, map voting, anti-cheat beyond server authority + clamps,
    mobile-specific netcode (touch already works, reuse it), Fly
    deployment, second repo.

---

## 1. Why Cloudflare, and the cost guardrails

Verified on 2026-09-03 against Cloudflare docs:

| Free plan limit | Arena consequence |
|---|---|
| DO duration 13,000 GB-s / day | One DO at 128 MB running 24 h = 10,800 GB-s. Fits even if someone plays all day. |
| DO requests 100,000 / day, incoming WebSocket messages count 20:1, outgoing free | 15 Hz input = 0.75 billed req per player-second ≈ **37 player-hours per day**. |
| Static asset requests | Free, unlimited, never invoke the Worker. Single-player never goes down. |
| Over the limit | Requests fail until 00:00 UTC. **No charge, ever** — the Free plan has no payment method. |
| Workers Builds | 3,000 build minutes / month, 1 concurrent build. |

Guardrails the implementation must respect (§7 invariants repeat them):

- Never add a payment method to the Cloudflare account. Do not enable
  Workers Paid. Do not add KV / R2 / D1 / Queues / Containers.
- `run_worker_first` is `["/arena", "/health"]` only. Everything else is a
  static asset and costs nothing.
- The DO clears its tick interval when the last socket closes so it goes
  idle and stops accruing duration.
- Per-socket clamps: max message 2 KB, max 40 messages/s (excess dropped),
  invalid JSON or unknown `v` closes the socket. This protects the daily
  quota, not money (there is no money to lose).
- The Fly.io account is unused by this project. Recommend the owner
  deletes the Fly organization or removes the card; nothing in the repo
  references Fly.

Known Cloudflare trade-offs, accepted: a DO can be evicted on deploy
(everyone drops, next join makes a new map); the DO is pinned near the
first-ever requester (the owner should make the first production join from
home so it lands in Europe); the server runs in workerd, not Node (the sim
is already pure, so this is a non-issue).

---

## 2. Ground truth (verified in this repo)

- `src/sim/physics.ts` functions take `Sim` but only read `map`, `doors`,
  `secrets`, `sealIntact` (`isSolidCell` at `physics.ts:9-31`). Widening
  the parameter type is behavior-neutral.
- `Sim.step` (`sim.ts:259`) does movement at 6.5 u/s via `moveCircle`,
  then `separatePlayerFromEnemies`, cooldowns, `tryFire`, `stepProjectiles`,
  `checkPickups` (touch radius 1.1, `sim.ts:976-981`). Death sets a
  sim-wide `phase = 'dying'` (`sim.ts:642-662`) — arena must not use that.
- `fireWeapon` / `hitscanShot` / `stepProjectiles` / `impactProjectile`
  (`sim.ts:380-640`) are enemy-specific only in their target loops; spread,
  cylinder sweep, falloff, projectile integration and splash are generic.
  RNG calls happen in `fireWeapon` before the sweep, per pellet — the
  extraction must keep that order.
- `placeCosmetics(grid, rooms, rng, w, h)` (`src/sim/cosmetics.ts:11`)
  already takes width/height, so the arena generator can reuse it as-is.
- Render/HUD read sizes from `map.w/h`, never `GRID_W` (grep confirms only
  `blueprint.ts`, `compileDsl.ts`, `editor/*` use the constant). A 96-cell
  `GameMap` renders and minimaps without changes.
- `GameRenderer.update(dt, sim, moving)` (`renderer.ts:184`) and
  `Hud.draw(sim, opts)` (`hud.ts:102`) are typed against `Sim` but read a
  small field set: `player`, `map`, `phase`, `phaseTimer`, `doors`,
  `secrets`, `sealIntact`, `enemies`, `pickups`, `projectiles`, `explored`,
  `powerups`, `killCount`, `time`, `arenaEntered`, `secretCell`.
- `Game` (`src/app/game.ts`) has `runKind: 'maze' | 'map' | 'campaign'`
  (`game.ts:66`); the loop at `game.ts:768-860` polls input, pulls aim from
  the camera (`pullAimFromCamera`, `game.ts:378`), steps the sim with an
  accumulator, drains events into `handleEvent` (`game.ts:898`).
  ESC/TAB are wired once in `wireInput` (`game.ts:201-236`); arena must
  branch inside those callbacks, not add listeners.
- Title buttons live in `Screens.build` (`src/ui/screens.ts:114-118`), one
  `.row` of three `.big` buttons; mobile e2e asserts the panel still fits
  390×844.
- No `vite.config.ts` exists; Vite runs on defaults. `npm run build` is
  `tsc --noEmit && vite build`, publish dir `dist` (604 KB). Playwright
  webServer is `npm run build && npm run preview` on :4173.
- Node 24, npm 11. No `.github/`.
- Architecture test (`tests/unit/architecture.test.ts`) walks `src/sim`,
  `src/campaign`, `src/editor/model.ts` for Three / `Math.random` / DOM /
  `localStorage` / layer imports.

---

## 3. Architecture

```
browser                                   Cloudflare
──────────────────────────────            ────────────────────────────────
Game (runKind 'arena')                    Worker fetch()
  ArenaClient (src/net)  ── ws /arena ──▶   /arena → env.ARENA.getByName('global').fetch()
    predict self                            /health → 'ok'
    interpolate others                      everything else → static assets (dist/client)
    events → audio/FX/HUD                 ArenaRoomDO (server/)
                                            ArenaRoom (pure, testable)
                                              ArenaSim.step() 60 Hz   ← src/sim/arena.ts
                                              snapshot 20 Hz → all sockets
```

Layers (extends `docs/ARCHITECTURE.md`):

```
server/      Worker entry + DO adapter. Cloudflare APIs allowed. Imports src/sim and src/net/protocol only.
src/sim/     still pure. + combat.ts, arenagen.ts, arena.ts
src/net/     browser client: protocol types, ArenaClient, prediction. No Three, no server/ import.
src/app/     Game grows runKind 'arena'.
src/render/  + players.ts (other-player rigs). WorldView interface.
src/ui/      title button, name panel, arena pause copy, scoreboard.
```

Map sync uses the determinism gift: the server picks a seed, the client
runs `generateArena(seed)` locally, and `welcome` carries
`ARENA_GEN_VERSION` + a 32-bit grid hash (fnv1a over `grid` bytes + pickup
positions; helper in `src/sim/arenagen.ts`). Mismatch → client shows `GEN
MISMATCH` and leaves. Only live state goes over the wire.

Constants, in `src/sim/arena.ts`:

```ts
export const ARENA_GEN_VERSION = 1;
export const ARENA_GRID = 96;
export const ARENA_MAX_PLAYERS = 10;
export const ARENA_TICK_HZ = 60;         // = 1 / STEP_DT
export const ARENA_SNAPSHOT_HZ = 20;
export const ARENA_INPUT_HZ = 15;        // client batches 4 ticks per message
export const ARENA_RESPAWN = { gun: 25, gun7: 40, ammo: 12, medikit: 20 }; // seconds
export const ARENA_SPAWN_PROTECT = 2;
export const ARENA_DEATH_LOCKOUT = 2;
export const ARENA_IDLE_S = 120;
export const ARENA_LAST_HIT_S = 5;
export const ARENA_MIN_SPAWN_DIST = 16;  // world units, best effort
```

---

## 4. PR 1 — `feat/arena-sim`: physics widening, combat extraction, generator, ArenaSim

Headless only. Nothing on the title screen changes.

### 4.1 Golden test first (before touching `Sim`)

`tests/unit/combatGolden.test.ts`: build `new Sim('golden-1', 'normal')`
and `Sim.fromMap` on one campaign map; drive a scripted 1,800-step input
tape (walk, turn, fire every gun via `giveGun`, let enemies shoot back);
hash `JSON.stringify` of `{ player, enemies: hp/x/z/state, projectiles,
pickups.taken, events tags }` every 60 steps. Commit the hashes as
constants **in a commit before the extraction**. The extraction commit
must not touch them. Also keep `mapgen.test.ts` 300-seed sweep and
`sim.test.ts` determinism as they are.

### 4.2 `SolidState` (`src/sim/physics.ts`)

```ts
export interface SolidState {
  map: GameMap;
  doors: { cells: [number, number][]; offset: number; opening: boolean }[];
  secrets: { cells: [number, number][]; offset: number; opening: boolean }[];
  sealIntact: boolean;
}
```

Replace `state: Sim` with `state: SolidState` in `isSolidCell`,
`circleFits`, `moveCircle`, `pushCircleOut`, `raycastWall`,
`hasLineOfSight`, `hasVisualLineOfSight`, `findPath`. `Sim` already
satisfies it. Type-only change; `physics.test.ts` unchanged.

### 4.3 `src/sim/combat.ts` (extraction)

Pure functions, no class state, no RNG inside (callers pass already-drawn
spread offsets so RNG order is untouched):

```ts
export interface Body { id: number; x: number; z: number; radius: number; yMin: number; yMax: number }

/** Perpendicular-basis cone offset; caller supplies a, r from its rng. */
export function spreadDir(dirX, dirY, dirZ, a: number, r: number): Dir3;
export function damageAtRange(w: WeaponDef, t: number, base: number): number;
/** Wall DDA + sorted cylinder hits along a ray. */
export function sweepHitscan(solid: SolidState, ox, oy, oz, dirX, dirY, dirZ, maxRange: number, bodies: Body[]):
  { wall: ReturnType<typeof raycastWall>; hits: { id: number; t: number }[]; tracerEnd: number };
/** One integration step; returns impact {kind:'wall'|'ground'|'body', bodyId?, x,y,z} or null after mutating p. */
export function integrateProjectile(solid: SolidState, p: ProjectileEnt, dt: number, bodies: Body[]): Impact | null;
/** Splash falloff list: [{ id, factor }] for bodies inside radius (enemy-style f with 0.25 floor). */
export function splashFactors(px, pz, radius: number, bodies: Body[]): { id: number; factor: number }[];
```

`Sim.fireWeapon` keeps its RNG draws and calls `spreadDir`;
`Sim.hitscanShot` builds `bodies` from living enemies (using
`enemyGunRadius` / `enemyGunVolumeY(def, distXZ)` exactly as now) and calls
`sweepHitscan`, then applies `damageEnemy` / `trySecretShot` / tracer
events in the same order as today. `stepProjectiles` uses
`integrateProjectile` for player projectiles (enemy projectiles vs the
single player keep their existing inline check — do not generalize what
the golden test cannot see). `impactProjectile` uses `splashFactors` for
enemies; player self-splash stays inline. Golden hashes must not move.

### 4.4 `generateArena(seed)` (`src/sim/arenagen.ts`)

Two RNG streams, no difficulty stream:

```
layout:  makeRng(`SGA|v${ARENA_GEN_VERSION}|${seed}`)
content: makeRng(`SGA|v${ARENA_GEN_VERSION}|${seed}|pads`)
```

Layout algorithm (simple, loop-heavy, deterministic):

1. Grid 96×96, 1-cell solid border. Divide into a **4×4 lattice** of 22-cell
   slots (offset 4). In each slot place one room, size 8–14 × 8–12, jittered
   inside the slot; skip 2–3 slots at random (`rng.chance(0.18)`, keep
   ≥ 13 rooms). One room per quadrant is a courtyard (`outdoor: true`) at
   +2 size. Themes cycle `industrial / organic / stone / tech` per row.
2. Connect every room to each lattice neighbour that exists with a 3-wide
   L-corridor (horizontal leg then vertical, like `carveLink`,
   `mapgen.ts:262`). That yields a grid graph, i.e. lots of loops.
3. Remove ~20 % of the edges at random but keep the graph connected
   (check with a room-level BFS before deleting). Result: every room still
   has ≥ 2 exits where possible; dead ends allowed for ≤ 2 rooms.
4. Add 2 diagonal shortcuts between rooms two slots apart if the corridor
   rect is free.
5. Flood-fill assert all floor reachable; on failure bump an attempt
   counter that feeds the layout stream and retry (max 10, like mapgen).
6. `placeCosmetics(grid, rooms, layoutRng, 96, 96)` for lights/decors.

`GameMap` fields: `w = h = 96`, `version = ARENA_GEN_VERSION`, `seed`,
`difficulty: 'normal'`, `doors: []`, `secrets: []`, `enemies: []`,
`seal: { cells: [], x: 0, z: 0, axis: 'x' }`, `sealBreak: { type: 'gun',
gun: 7 }`, `arenaRoomId` / `startRoomId` / `antechamberId` = largest room
id, `vaultRoomId: -1`, `playerStart` = centre of room 0.

Pads (content stream, ids 0..n in placement order so snapshots match):

| Kind | Count | Where |
|---|---|---|
| gun 2, gun 3 | 2 each | room interiors, different rooms |
| gun 4, 5, 6, 7 | 1 each | room interiors, gun 7 in the largest room |
| ammo (`amount` = `boxAmmo`, type cycled over guns 1–7 weighted 3:2:2:1:1:1:1) | `round(1.1 × rooms)` | rooms and corridor cells |
| medikit | `round(0.5 × rooms)` | rooms |

Never two pads on the same cell, never in a cell with < 3 floor
neighbours. Respawn seconds are **not** on `PickupDef` (codec untouched);
`ArenaSim` derives them from kind/gun via `ARENA_RESPAWN`.

### 4.5 `ArenaSim` (`src/sim/arena.ts`)

```ts
export interface ArenaPlayer {
  id: number; name: string; colorIndex: number;
  x: number; z: number; yaw: number; pitch: number;
  hp: number; gun: number; owned: boolean[]; ammo: Record<AmmoType, number>;
  fireCd: number; dryCd: number; bloom: number;
  alive: boolean; deathTimer: number; protectUntil: number; spawnCount: number;
  frags: number; deaths: number; lastHitBy: { id: number; at: number } | null;
  input: SimInput; queued: SimInput[]; lastSeq: number;
  idleFor: number; corpse: { x: number; z: number; yaw: number } | null;
}
export class ArenaSim implements SolidState {
  map: GameMap; doors = []; secrets = []; sealIntact = false;
  time = 0; tick = 0; players: ArenaPlayer[] = []; projectiles: ArenaProjectile[] = [];
  pickups: ArenaPickup[]; events: ArenaEvent[] = []; rng: Rng;
  constructor(seed: string)                        // generateArena(seed); rng = makeRng(`arena|${seed}|v${ARENA_GEN_VERSION}`)
  join(name: string): ArenaPlayer | 'full'
  leave(id: number): void                          // projectiles keep ownerId; sim just sits empty
  pushInput(id: number, seq: number, inputs: SimInput[]): void   // clamps moveX/Z to [-1,1], drops > 8 queued
  step(dt = STEP_DT): void
  takeEvents(): ArenaEvent[]
  snapshot(): ArenaSnapshot
}
```

`step`, per living player: gun switch, yaw/pitch from the input, camera-
relative move via `moveCircle` at 6.5 u/s, `pushCircleOut` against every
other living player, cooldowns, fire, pickups, idle accounting. Then
projectiles, pad respawn timers, death lockouts → `respawn`. Input queue:
consume one queued input per tick if available, else reuse `input`
(server never waits for the client). `lastSeq` = seq of the last consumed
input, echoed in snapshots.

Fire: same personality as `Sim.fireWeapon` through `combat.ts`. Bodies =
living, non-shooter players, `radius PLAYER_RADIUS`, `y [0, PLAYER_HEIGHT]`,
spawn-protected players excluded from damage but not from blocking the
ray. Sunlance pierces. Projectiles carry `ownerId`. Splash hits every
unprotected player in radius with `splashFactors`; owner takes
`damageSelfPct` at the 0.8 radius rule as today. No difficulty / powerup
multipliers.

Kill: `hp <= 0` → `alive = false`, `corpse` = last pose, `deathTimer =
ARENA_DEATH_LOCKOUT`, `deaths += 1`; credit `lastHitBy` if within
`ARENA_LAST_HIT_S`, else suicide (`frags = max(0, frags - 1)`); events
`playerDie { id }` and `frag { killerId, victimId, suicide }`.

Spawn: candidate cells = floor cells where `circleFits` and the cell is in
a room; sample 12 with `makeRng(\`spawn|${seed}|${id}|${spawnCount}\`)`,
take the one farthest from the nearest living player (accept < 16 u if
none). Reset loadout, HP 100, `protectUntil = time + 2`, random yaw from
the same rng. Event `playerSpawn { id }`.

Pickups: as `Sim.checkPickups` (1.1 u) but per player, `medikitHeal` 25,
medikit not taken at full HP; on take `taken = true, respawnAt = time +
ARENA_RESPAWN[...]`; `time >= respawnAt` → `taken = false`, event
`padRespawn { id }`.

Idle: `idleFor += dt` when no move, no fire, yaw/pitch unchanged; crossing
`ARENA_IDLE_S` emits `kick { id, reason: 'idle' }` once; the room closes
the socket.

Events (`ArenaEvent`), reusing maze tags where audio/FX already consume
them and adding an actor id:

```ts
| { t: 'shot'; id; gun; x; z; yaw }            | { t: 'dryfire'; id; gun }
| { t: 'tracer'; ...; kind }                    | { t: 'beam'; ... }
| { t: 'spawnProjectile'; kind; x; y; z }       | { t: 'explosion'; x; y; z; radius }
| { t: 'hitPlayer'; id; x; y; z; killed }       | { t: 'playerHurt'; id; damage; fromAngle }
| { t: 'playerDie'; id }                        | { t: 'playerSpawn'; id }
| { t: 'frag'; killerId; victimId; suicide }    | { t: 'pickup'; id; kind; label }
| { t: 'padRespawn'; id }                       | { t: 'playerJoin'; id; name; colorIndex }
| { t: 'playerLeave'; id }                      | { t: 'kick'; id; reason: 'idle' }
```

Snapshot (JSON, no grid):

```ts
{ tick, players: { id, name, colorIndex, x, z, yaw, pitch, hp, gun, ownedMask, alive, protect, frags, deaths, lastSeq }[],
  projectiles: { id, kind, x, y, z }[], pickups: { id, taken }[] }
```

### 4.6 Tests

- `tests/unit/arenagen.test.ts` (100 seeds `arena-0..99`): 96×96, border
  solid, flood-fill connected, ≥ 13 rooms, ≥ 3 courtyards, room-graph
  cycle count ≥ 4, no doors/secrets/enemies, guns 2–7 present, ≥ 1
  medikit and ≥ 1 ammo, no two pads on one cell, same seed → same grid
  hash, distinct seeds → < 2 % hash collisions.
- `tests/unit/arena.test.ts`: two players scripted pistol kill (frag/death
  counters, respawn at a different cell after 2 s with pistol only, HP
  100); spawn protect blocks damage at 1 s and not at 2.1 s; firing strips
  protect; pad taken → back after its constant ± one step; medikit not
  taken at 100; 10 joins ok, 11th `'full'`; splash self-kill = deaths 1,
  frags 0; determinism (two sims, same seed + join order + input tape ⇒
  equal snapshots at 3 s); idle kick event after 120 s; player bodies
  block each other (`pushCircleOut`); input queue caps at 8.
- `tests/unit/combatGolden.test.ts` unchanged hashes; `physics.test.ts`,
  `mapgen.test.ts`, `sim.test.ts`, `weapons.test.ts` untouched and green.
- `architecture.test.ts`: add "sim never imports `../net` or `../../server`".

Docs: `STATUS.md` (arena sim landed, no net). One paragraph in
`ARCHITECTURE.md` under "Arena sim".

---

## 5. PR 2 — `feat/arena-server`: protocol, pure room, Worker + DO, Vite plugin

After this PR `npm run dev` serves the game *and* a live `/arena` socket
locally through workerd. Still no UI. Existing e2e stays green on the new
preview server.

### 5.1 Protocol (`src/net/protocol.ts`)

JSON text frames, `{ v: 1, t: string, ... }`. Unknown `t` ignored, wrong
`v` → close 4000.

Client → server:

```ts
{ v:1, t:'join', name: string }
{ v:1, t:'input', seq: number, inputs: { moveX, moveZ, yaw, pitch, fire, switchGun }[] }  // ≤ 8 per message
{ v:1, t:'ping', at: number }
```

Server → client:

```ts
{ v:1, t:'welcome', id, seed, genVersion, gridHash, tick, snapshot }
{ v:1, t:'snap', snapshot }                                   // 20 Hz
{ v:1, t:'events', es: ArenaEvent[] }                         // batched per tick that had any
{ v:1, t:'full' } | { v:1, t:'kicked', reason: 'idle' | 'mismatch' | 'protocol' }
{ v:1, t:'pong', at, serverTime }
```

Tiny runtime guards (`isClientMessage`, `isServerMessage`) — no schema
library.

### 5.2 `ArenaRoom` (`server/room.ts`, pure)

Transport-agnostic so it is unit-testable with fake sockets and would be
trivially portable to Node if ever needed:

```ts
export interface RoomSocket { send(text: string): void; close(code?: number, reason?: string): void }
export class ArenaRoom {
  constructor(private now: () => number, private randomSeed: () => string, private schedule: TickScheduler)
  onOpen(sock: RoomSocket): void
  onMessage(sock: RoomSocket, text: string): void     // parse, clamp size / rate, dispatch
  onClose(sock: RoomSocket): void
  tick(): void                                        // sim.step(); every 3rd tick broadcast snap; flush events
  get playerCount(): number
}
```

First `join` creates `new ArenaSim(randomSeed())` and starts the 60 Hz
scheduler; last close → `sim = null`, scheduler stopped. Join on a full
room → `full` + close. A socket that sends no message for 15 s is closed
(client pings every 5 s). Message > 2 KB or > 40 msg/s → drop; three
protocol violations → `kicked: protocol`.

### 5.3 Worker + Durable Object (`server/index.ts`)

```ts
export class ArenaRoomDO extends DurableObject<Env> {
  private room = new ArenaRoom(() => Date.now(), () => crypto.randomUUID().slice(0, 8), intervalScheduler);
  async fetch(req: Request) {
    if (req.headers.get('Upgrade') !== 'websocket') return new Response(null, { status: 426 });
    const { 0: client, 1: server } = new WebSocketPair();
    server.accept();                     // NOT hibernation: we tick continuously while occupied
    server.addEventListener('message', e => this.room.onMessage(server, String(e.data)));
    server.addEventListener('close',   () => this.room.onClose(server));
    server.addEventListener('error',   () => this.room.onClose(server));
    this.room.onOpen(server);
    return new Response(null, { status: 101, webSocket: client });
  }
}
export default {
  fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname === '/health') return new Response('ok');
    if (url.pathname === '/arena') {
      if (!originAllowed(req, env)) return new Response('forbidden', { status: 403 });
      return env.ARENA.getByName('global').fetch(req);
    }
    return env.ASSETS.fetch(req);
  },
};
```

`originAllowed`: `Origin` host equals the request host, or is listed in
`env.ALLOWED_ORIGINS` (comma-separated `vars`, empty by default). This is
what lets Netlify point at Cloudflare later without code changes.

### 5.4 Build wiring

- `npm i -D @cloudflare/vite-plugin wrangler`. No `ws`, no `tsx`, no
  Express.
- `vite.config.ts`: `plugins: [cloudflare()]`. Client output moves to
  `dist/client`, worker bundle to `dist/seventh-gun`.
- `wrangler.jsonc`:

  ```jsonc
  {
    "$schema": "./node_modules/wrangler/config-schema.json",
    "name": "seventh-gun",
    "main": "./server/index.ts",
    "compatibility_date": "2026-09-01",
    "assets": { "directory": "./dist/client", "binding": "ASSETS",
                "not_found_handling": "single-page-application",
                "run_worker_first": ["/arena", "/health"] },
    "durable_objects": { "bindings": [{ "name": "ARENA", "class_name": "ArenaRoomDO" }] },
    "migrations": [{ "tag": "v1", "new_sqlite_classes": ["ArenaRoomDO"] }],
    "vars": { "ALLOWED_ORIGINS": "" },
    "observability": { "enabled": true }
  }
  ```

  SQLite-backed class is required on the Free plan; we store nothing in it.
- `tsconfig.server.json` extends the root config with `lib: ["ES2022"]`,
  `types: ["./worker-configuration.d.ts"]` (generated by `wrangler types`,
  committed), `include: ["server", "src/sim", "src/net/protocol.ts"]`.
  `npm run typecheck` runs both configs. Root tsconfig `include` gains
  nothing (server stays out of the DOM-typed program).
- `package.json` scripts: `dev: vite`, `build: npm run typecheck && vite
  build`, `preview: vite preview --port 4173 --strictPort` (now served by
  workerd, DO included), `deploy: npm run build && wrangler deploy`
  (owner-only convenience; production deploys come from Workers Builds).
- `netlify.toml`: `publish = "dist/client"`. Nothing else changes; verify
  the Deploy Preview still boots the maze.
- `playwright.config.ts`: unchanged command; it now serves the Worker.

### 5.5 Tests

- `tests/unit/protocol.test.ts`: guards accept valid frames, reject bad
  `v`, ignore unknown `t`, cap inputs per message at 8.
- `tests/unit/room.test.ts` with fake sockets and a manual scheduler: first
  join creates a seed and welcome carries hash + snapshot; second join sees
  the same seed; 11th gets `full`; snapshots every 3rd tick; events
  batched; idle kick closes the socket; last close nulls the sim and the
  next join has a different seed; oversized / flooding socket is dropped.
- `tests/e2e/arena-server.spec.ts` (desktop): `GET /health` is `ok`; a raw
  `WebSocket('/arena')` from `page.evaluate` receives `welcome` after
  `join`, and `snap` frames follow. Existing maze/campaign/editor e2e
  green on the workerd preview.

Docs: `STATUS.md`, `ARCHITECTURE.md` (net loop + layers), `TESTING.md`.

---

## 6. PR 3 — `feat/arena-client`: title button, name panel, prediction, render, HUD

Playable in two browser windows via `npm run dev`.

### 6.1 `ArenaClient` (`src/net/client.ts`)

- `connect(url, name)` → resolves with `welcome` or rejects with `full |
  offline | mismatch`. URL: `import.meta.env.VITE_ARENA_WS_URL ??
  \`${wss|ws}://${location.host}/arena\``. Never hardcode a host.
- Holds `latest` and `previous` snapshots with receive timestamps, an
  event queue (`takeEvents()`), `rtt` from pings every 5 s, `onClose(reason)`.
- **Prediction.** The client keeps a local `SolidState` (`generateArena`
  map, empty doors/secrets, `sealIntact false`) and a pending buffer of
  `{ seq, input }`. Each rendered frame it accumulates `STEP_DT` steps like
  the maze loop; each step applies `moveCircle` locally and appends the
  input; every `1 / ARENA_INPUT_HZ` seconds it sends the pending inputs
  since the last send as one `input` message. On a snapshot: drop inputs
  with `seq <= lastSeq`, set local pose to the server pose, replay the
  remaining inputs through `moveCircle`. Snap is unconditional (replay
  makes it smooth); a visual smoothing of ≤ 0.35 u over 100 ms hides small
  corrections. Yaw/pitch are never overwritten from snapshots (camera is
  look authority, `game.ts:378`).
- **Interpolation.** Remote players and projectiles render at `now - 100
  ms` between `previous` and `latest`; no extrapolation. Corpses hold the
  death pose from `playerDie` until `playerSpawn`.
- Local gun/ammo/HP/owned come from the snapshot (server-authoritative);
  firing shows the muzzle flash and plays the shot sound immediately
  (cosmetic), the server's `shot` event for self is de-duplicated.

### 6.2 `WorldView` (render/HUD decoupling)

Add `src/sim/view.ts` (pure types):

```ts
export interface WorldView {
  map: GameMap; player: PlayerState; phase: Phase; phaseTimer: number; time: number;
  doors: DoorState[]; secrets: SecretState[]; sealIntact: boolean;
  enemies: EnemyEnt[]; pickups: PickupEnt[]; projectiles: ProjectileEnt[];
  explored: Uint8Array; secretCell: Uint8Array; powerups: PowerupState;
  killCount: number; arenaEntered: boolean; hasKey: boolean;
  arenaEnemiesRemaining(): number;
}
```

`Sim` satisfies it structurally. `GameRenderer.setRun/update`, `Hud.draw /
drawMinimap`, `exploredPct` change their parameter type from `Sim` to
`WorldView` — no logic changes. The client builds an `ArenaView` object
each frame: `player` = predicted self (+ snapshot hp/gun/ammo/owned),
`phase` = `'playing'` while alive, `'dying'` with `phaseTimer` during the
lockout, `explored` all ones, `enemies: []`, `pickups` from the map with
`taken` from the snapshot, `projectiles` interpolated. Renderer fog stays
`MAZE_FOG`; camera far 500 covers 192 u.

### 6.3 Other players (`src/render/players.ts`)

Procedural rig per remote player: capsule body + head + visor + gun stub,
one of 10 palettes keyed by `colorIndex` (readable on dark walls), walk bob
from speed, blob shadow (reuse the enemy pattern), name + thin HP bar as a
depth-tested canvas sprite above the head, death = tip over during the
lockout. Self is not drawn. Visible when within 60 u, in frustum and
`hasVisualLineOfSight` (map only, no doors). `GameRenderer.updateArena
(dt, view, others)` calls it after the normal `update`.

### 6.4 Game wiring (`src/app/game.ts`)

- `runKind: 'maze' | 'map' | 'campaign' | 'arena'`; `screens.setRunKind`
  learns `'arena'` (pause copy: RESUME / LEAVE ARENA, hide SKILL / RESTART
  / NEW MAZE / map row).
- Title: new `.row` under MAP LOG / CAMPAIGN / EDITOR with one `.big`
  button **MULTIPLAYER ARENA** (mobile e2e still fits 390×844). Click →
  arena panel: NAME input (prefilled from `seventh-gun.arenaName`), JOIN,
  BACK, status line `CONNECTING… / ARENA FULL / ARENA OFFLINE / GEN
  MISMATCH / KICKED: IDLE / DISCONNECTED`.
- `startArena(welcome)`: `generateArena(seed)`, verify hash, build
  `ArenaView`, `renderer.setRun(view)` (no campaign art), `beginPlay`-like
  flow without map log / campaign progress, pointer lock as maze.
- Loop branch for `'arena'`: pull aim from the camera, poll input, feed
  `ArenaClient.stepLocal`, drain client events into `handleEvent`
  (`hitPlayer` → blood FX; `frag` → HUD line `X fragged Y`; `playerDie` for
  self → `hud.died()` variant without epitaph + `FRAGGED BY X`, camera tilt;
  `playerSpawn` for self → reset camera roll), `renderer.updateArena`,
  `hud.draw(view, ...)`, `hud.drawArenaRoster`.
- Death never goes to title. ESC → arena pause overlay, socket stays open
  and inputs keep flowing as "no move". LEAVE ARENA → `client.close()`,
  `toTitle()`. Socket close → title + status. TAB → `phase = 'scoreboard'`
  overlay (DOM panel in `Screens`), released on TAB/ESC.
- Audio: `audio.handleEvent` gets an optional `gain` from distance for
  other players' `shot` / `explosion` (linear falloff 4–40 u); own events
  unchanged.

### 6.5 HUD

Existing panel from `view.player`. Top-left roster: up to 10 lines `name
frags`, local row highlighted, `n/10` count. TAB scoreboard: sorted by
frags desc then deaths asc, colours matching rigs, RTT in the corner.
`drawMinimap` skips the explored check when `explored` is all ones (it
already only reads the array, so no branch needed).

### 6.6 Debug API (`?e2e=1`)

```ts
joinArena(name?: string): Promise<void>; leaveArena(): void;
arena(): { connected, id, seed, tick, rtt, players: { id, name, frags, deaths, alive }[] } | null
```

Never drive pointer lock with synthetic mousemove.

### 6.7 Tests

- `tests/unit/client.test.ts` (jsdom-free, fake socket): welcome →
  connected; prediction replays un-acked inputs after a snapshot;
  interpolation returns a pose between two snapshots at 100 ms.
- `tests/unit/hud.test.ts`: roster sorting.
- `tests/e2e/arena.spec.ts` (desktop): title shows MULTIPLAYER ARENA and
  the maze button still starts a maze; `joinArena('TEST')` →
  `arena().connected` and one player; **two browser contexts** join and
  each sees two players in `arena().players`; leaving both → a third join
  gets a different seed. Mobile: button visible, panel fits.

Docs: `GAME-DESIGN.md` "Arena" section (grid 96, pads, respawn seconds,
spawn kit, no jump, 10 players, Normal numbers), `DECISIONS.md` (§0 in
short form), `TESTING.md`, `STATUS.md`, `README.md` (`npm run dev` gives a
live arena; open two windows).

---

## 7. PR 4 — `feat/arena-ship`: production on Cloudflare, docs

Mostly owner clicks plus documentation; the code delta is small.

1. Owner: create a Cloudflare account (no card). Workers & Pages → Create →
   Import a repository → `guillem/seventh-gun`. Worker name **must** equal
   `wrangler.jsonc` `name` (`seventh-gun`). Build command `npm run build`,
   deploy command `npx wrangler deploy`. Production branch `main`;
   non-production branches get preview URLs.
2. Owner: first production join from home (pins the DO in Europe). Play
   with a second device.
3. Repo: `README.md`, `AGENTS.md` (Run / Deploy: Cloudflare is production,
   Netlify is a static mirror + preview for single-player, `ALLOWED_ORIGINS`
   var), `DECISIONS.md` (hosting rationale + cost guardrails from §1),
   `ROADMAP.md` (arena v1 done; lag compensation, spatial audio polish,
   Netlify retirement as "next"), `STATUS.md`.
4. Optional in this PR: `.github/workflows/ci.yml` running `npm test` and
   `npm run test:e2e` per PR (GitHub Actions free for public repos). No
   deploy step in GitHub — Workers Builds does that.

Fly is not mentioned anywhere except `DECISIONS.md` as "considered,
rejected: no spend cap".

---

## 8. Files (summary)

New: `src/sim/combat.ts`, `src/sim/arenagen.ts`, `src/sim/arena.ts`,
`src/sim/view.ts`, `src/net/protocol.ts`, `src/net/client.ts`,
`src/render/players.ts`, `server/index.ts`, `server/room.ts`,
`vite.config.ts`, `wrangler.jsonc`, `tsconfig.server.json`,
`worker-configuration.d.ts`, tests listed above.

Touch: `src/sim/physics.ts` (SolidState), `src/sim/sim.ts` (call
`combat.ts`), `src/sim/index.ts` (re-exports), `src/app/game.ts`,
`src/ui/screens.ts`, `src/ui/hud.ts`, `src/render/renderer.ts`,
`src/audio/audio.ts` (gain arg), `index.html` (arena panel / roster CSS),
`package.json`, `netlify.toml` (publish path), `tests/unit/architecture.test.ts`,
docs.

Do not touch: `src/sim/mapgen.ts` (no `GEN_VERSION` bump, no RNG order
change), campaign JSON, editor model, `mapcodec.ts`, weapon numbers.

Allowed new deps: `@cloudflare/vite-plugin`, `wrangler` (dev). Nothing
else.

---

## 9. Invariants (a PR is not done if any breaks)

- `npm test` green including the 300-seed maze sweep at `GEN_VERSION 4`
  and the combat golden hashes.
- `npm run test:e2e` green for desktop + mobile maze / campaign / editor.
- `npm run typecheck` clean for both tsconfigs.
- `src/sim` has no Three, `Math.random`, DOM, `localStorage`, and no
  imports from `render / ui / audio / app / net / server`. `src/net` has no
  Three. `server/` imports only `src/sim` and `src/net/protocol`.
- One room, ten players, last leave deletes the map, next join is a new
  seed. Clients never decide hits or pickups.
- Static assets are never routed through the Worker except `/arena` and
  `/health`. No payment method on Cloudflare. No new Cloudflare products.
- The DO stops ticking when empty.
- No jump. No second repo. No Fly files.

---

## 10. Order of work inside each PR

**PR 1:** golden test commit → `SolidState` → `combat.ts` extraction (golden
unchanged) → `arenagen` + 100-seed test → `ArenaSim` join/step/fire/pickup/
respawn/idle tests → architecture guard → STATUS.

**PR 2:** protocol + guards → `ArenaRoom` + fake-socket tests → Vite plugin
+ `wrangler.jsonc` + tsconfig split → Worker/DO → `netlify.toml` path →
run existing e2e on the workerd preview → arena-server e2e → docs.

**PR 3:** `WorldView` type swap (no behavior change, e2e green) →
`ArenaClient` + prediction tests → title button + panel → `startArena` +
loop branch → `players.ts` → HUD roster / scoreboard → death / ESC / TAB →
debug API → e2e (single and two-context) → docs.

**PR 4:** Workers Builds connection (owner) → first production playtest on
two devices → docs → optional CI workflow.

Human playtest after PR 3 (two windows locally) and after PR 4 (two
devices on the Cloudflare URL). Expected feel notes to collect: hitscan
lead at real ping, spawn distances, pad respawn pacing on 96×96 with 2–3
players.
