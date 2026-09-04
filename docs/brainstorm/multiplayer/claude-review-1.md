# Arena review 1 — commit d06a120 vs `claude-plan.md`

Reviewed by Claude (Fable 5.1) on 2026-09-03. Scope: the single commit
`d06a120 feat: add multiplayer Arena mode` on `feat/arena-multiplayer`.
Verified locally: `npm test` green, `npm run typecheck` clean (both
configs), `npm run test:e2e` 75 passed / 5 skipped on the workerd preview.

Overall: the shape is right and the layering held. Four bugs must be fixed
before any playtest over a real network, and two plan deviations need an
owner decision. Everything below has a repro or was verified.

---

## P0 — fix before playtest (all reproduced)

### 1. Input batching / ack is wrong (movement desync at real RTT)

Two coupled bugs that cancel out on localhost and break on the internet.

- `ArenaSim.pushInput` (`src/sim/arena.ts:242`) assigns the message's single
  `seq` to every input in the batch. After one tick with a 4-input batch
  the server reports `lastSeq = 4` while 3 inputs are still queued. The
  client (`reconcile`, `src/net/client.ts:244`) then drops those 3 pending
  inputs and snaps to a server pose that is 3 ticks behind → backwards
  rubber-band every snapshot while moving.
- `ArenaClient.flushInputs` (`client.ts:217`) sends `pending.slice(-8)` —
  the whole un-acked buffer — every 66 ms, not "inputs since the last
  send". The server has no de-dup, so at ≥ 50 ms RTT the same inputs are
  queued twice, the queue hits the cap of 8 and **newest** inputs are
  dropped (`break`). Server pose drifts ahead of / behind the prediction.

Fix: `input` message carries the seq of the **first** input; inputs are
consecutive (`seq + i`). Server ignores any input with
`seq <= lastQueuedSeq` and sets `lastSeq` to the seq of the input it
actually consumed. Client tracks `lastSentSeq` and sends only newer inputs
(resend of un-acked is then safe). Add a unit test: fake 100 ms RTT, 2 s of
`moveZ = 1`, assert server pose == predicted pose within 0.05 u after
settle, and `pending.length <= RTT / STEP_DT + 4`.

### 2. Room tick crashes when the last player leaves inside `tick()`

`server/room.ts:107-133`: the socket loop calls `this.onClose(sock)` for
socket-idle (15 s) or sim idle kicks; when that was the last player,
`shutdown()` nulls `sim`, then `this.sim.takeEvents()` throws
`TypeError: Cannot read properties of null`. Repro: join one player, advance
`now` by 16 s, fire one tick. Fix: `if (!this.sim) return;` after the loop.
Add the test.

### 3. Non-finite inputs make an invulnerable ghost

`isInputFrame` (`src/net/protocol.ts:45`) only checks `typeof === 'number'`.
`yaw: NaN` → position becomes `NaN`, snapshot serialises `null`, cylinder
raycasts return null → the player cannot be hit and appears nowhere.
Reproduced. Fix: `Number.isFinite` on `moveX/moveZ/yaw/pitch/seq/at`,
clamp `pitch` to ±π/2, validate `switchGun` is `null` or an integer 1–7,
`seq` a non-negative integer. Add protocol tests.

### 4. LEAVE ARENA lands on the arena panel saying DISCONNECTED

Verified in Chromium: after `leaveArena()` the title screen is hidden and
`#arena-join-screen` shows `DISCONNECTED`. Cause: `ArenaClient.close()`
(`client.ts:104`) does not clear `onClose`; the browser fires the close
event after a client-side `close()`, and the callback in `joinArena`
(`game.ts`) re-shows the panel and forces `phase = 'title'`. Fix: null
`onClose` in `close()` (or in `leaveArenaSilent`). Cover with an e2e assert
in `arena.spec.ts`: after `leaveArena()`, title visible, arena panel hidden.

---

## P1 — plan deviations that matter

### 5. Golden test was recorded after the extraction, and is weak

STATUS.md says so honestly. I re-ran a stronger tape against the
pre-extraction tree (`40b1c7d`) and this commit: 4 seeds × 3600 steps, all
seven guns via `giveGun`, pitch varying, hp topped up so the player never
dies, hash every 30 steps.

Result: **byte-identical except when the nailgun or grenade launcher fires
with pitch ≠ 0.** Cause: `spreadDir` normalises the right vector
(`hypot(dirZ, dirX)`, which is `cos(pitch)`), as the hitscan path always
did; the old projectile branch did not. The plan required byte-identical or
"copy and say so"; neither happened. It is a tiny, arguably correct
change (projectile spread cone now matches hitscan), and seed
reproducibility is unaffected on the same build.

Owner decision: **accept** (recommended: record in `DECISIONS.md`, no
`GEN_VERSION` bump needed) or restore with a `normalizeRight` flag.

Either way, replace `combatGolden.test.ts`: the committed tape never owns
guns 2–7 (`switchGun` to an un-owned gun is a no-op), so only the pistol
fires, and the player dies at ~19 s so 12 of 30 hashes are the same
dead-state hash. Use: `giveGun(1..7)`, pitched aim, `hp = 100` each step,
3 seeds. Record hashes after the decision above.

### 6. No hit feedback, and self-fire waits for the server

- The plan's `hitPlayer { id, x, y, z, killed }` event is missing from
  `ArenaEvent`. The shooter gets no blood FX and no confirm at all.
- `game.ts` `handleArenaEvent` plays the muzzle flash and shot sound only
  when the server's `shot` echo arrives. The plan said play them locally on
  fire and de-duplicate the echo. At 80 ms RTT every trigger pull feels
  late. `ArenaClient` already tracks `lastShotSeq` (unused) — use it.

### 7. Generator keeps almost the full lattice

`arenagen.ts:252-266` removes at most **2** edges, not ~20 %; the comment
admits it. Root cause is the plan: "cycle count ≥ 4" on 13 rooms cannot
coexist with 20 % removal (13 rooms ≈ 18 edges, spanning tree 12, cycles
6, minus 4 → 2). That inconsistency is on me. The consequence is that
every seed has nearly the same topology (only room jitter and 2–3 skipped
slots vary). Options: (a) keep dense (good for DM pacing, low variety), or
(b) remove 20 % and set the test to cycles ≥ 2. Recommend playtesting
first; if the map feels samey, do (b).

### 8. Sockets that never join keep the DO alive forever

The 15 s socket-idle check runs only inside `tick()`, which only runs while
a sim exists. A client that opens `/arena` and never sends `join` on an
empty room is never closed, so the non-hibernating DO stays resident and
burns the daily duration quota (the only Free-plan limit that a stuck
socket can actually exhaust). Fix: extend `TickScheduler` with a one-shot
`timeout(fn, ms)`, arm it in `onOpen` when `!this.sim`, or run a 1 Hz
housekeeping loop whenever `socks.size > 0`. Add a room test.

### 9. Death / respawn UI is a stub

`rebuildView` sets `phaseTimer` to a constant 2 (`client.ts:332`, the
expression is dead code). `hud.died()` picks a random maze epitaph; the
plan wanted no epitaph and `FRAGGED BY X`. `playerSpawn` for self does
nothing (no camera-roll reset). Small, but it is what the player sees
every 20 seconds.

---

## P2 — quality

- **Input queue policy.** `pushInput` drops the *newest* inputs when the
  queue is at 8. With `setInterval` drift in workerd the server ticks
  slightly under 60 Hz, so the queue fills and adds permanent latency, then
  drops. Prefer: drop oldest, or consume 2 per tick while `queued > 4`.
- **Smoothing** is a constant `smoothDx * 0.4` offset that never decays
  between snapshots (`client.ts:303`), not "≤ 0.35 u over 100 ms". Expect
  micro-stutter at 20 Hz.
- **`PlayerRenderer.setName`** (`src/render/players.ts:109`) builds a new
  256×64 canvas and `CanvasTexture` for every remote player every frame.
  Cache per `(name, round(hp/5))`; this will hurt on phones with 9 rigs.
- **Kills by a player who already left** count as suicide (victim loses a
  frag). Should be no credit, no penalty.
- **Dead code / leftovers**: `game.ts` `const yaw = …; // wait, yaw is
  rotation.y; void yaw;` and the no-op `pullAimFromCameraArena`; `client.ts`
  `void ARENA_SPAWN_PROTECT; void emptyInput;` and unused `lastShotSeq`;
  `arena.ts` `eventsVersion` placeholder event, duplicate `p.corpse =`
  lines in `respawn`, empty `if (wall.cell …) { void 0; }` in
  `hitscanShotPlayer`; `arenagen.ts` `void roomIdByOld`; `screens.ts`
  `resumeBtn.textContent = arena ? 'RESUME' : 'RESUME'`;
  `ARENA_MIN_SPAWN_DIST` is never compared against anything.
- `tsconfig.server.json` includes `"DOM"` in `lib`; the plan said
  `ES2022` only so DOM globals cannot leak into Worker code. Harmless today.
- `audio.out()` allocates a new `GainNode` per attenuated sound and never
  disconnects it. Fine for now.
- Snapshots carry `name` and the full `ammo` record for every player at
  20 Hz. Outgoing is free on the Free plan; leave it.

---

## What is right (keep)

- Layering: `src/sim` has no net/server imports (guard added), `src/net`
  has no Three, `server/` imports only sim + protocol. `SolidState` and
  `WorldView` swaps are clean type-only changes.
- Cloudflare wiring matches the plan exactly: SQLite-backed DO class,
  `run_worker_first` only `/arena` + `/health`, `ALLOWED_ORIGINS` var,
  observability on, no extra products, `netlify.toml` → `dist/client`,
  `.wrangler` ignored. Cost guardrails intact (except P1 #8).
- Tests: 100-seed arenagen, arena sim incl. determinism and 11th-join
  full, room fake-socket tests, protocol guards, two-context e2e, maze /
  campaign / editor e2e green on workerd. Mobile title panel still fits.
- ESC / TAB branch inside the existing callbacks; pause copy for arena;
  name persisted under `seventh-gun.arenaName`; `?e2e=1` debug API as
  specified. Docs (STATUS, DECISIONS, GAME-DESIGN, ARCHITECTURE, TESTING,
  AGENTS, README) updated and honest.

## Process notes

- Everything landed as one 6.5k-line commit instead of the four PRs in
  §4–§7. Not worth splitting now. Open **one PR** from
  `feat/arena-multiplayer` to `main` and push the fixes as follow-up
  commits on the same branch so the review diff is small.
- Golden-first ordering (§4.1) was skipped; #5 above closes that gap.

## Status

| Plan slice | State |
|---|---|
| PR 1 arena sim | Landed. Extraction verified by me (one accepted-or-reverted delta, #5). |
| PR 2 server | Landed. #2, #3, #8 open. |
| PR 3 client | Landed. #1, #4, #6, #9 open. |
| PR 4 ship | Not started. Owner task (Workers Builds, first join from home). |

## Next steps, in order

1. Cursor: P0 #1–#4 with the tests named above. Then #5 (golden rewrite),
   #6, #8, #9. Do #7 only after the owner decides.
2. Owner: decide #5 (accept spread change) and #7 (lattice density).
3. Open the PR; I review the diff.
4. Owner: two-window playtest on `npm run dev` (collect: hitscan lead,
   spawn distances, pad pacing, remote-player smoothness).
5. Owner: §7 steps — Cloudflare Workers Builds on `guillem/seventh-gun`,
   Worker name `seventh-gun`, first production join from home. Verify the
   Netlify deploy preview still boots the maze from `dist/client`.
6. Merge, then two-device playtest on the Cloudflare URL.

---

# Review 2 — uncommitted fix pass (2026-09-03, later)

Re-verified on the working tree: `npm test` 231 passed, `npm run
typecheck` clean, e2e re-run (result in the chat summary). `sim.ts` /
`combat.ts` untouched since review 1, so the extraction verdict stands.

## Closed (verified)

| # | Item | How verified |
|---|---|---|
| 1 | Input ack / batching | Per-input seq, server de-dup on `lastQueuedSeq`, `lastSeq` = consumed seq, client sends only fresh inputs, drop-oldest at cap, drain 2/tick when > 4. New 100 ms RTT walk test passes. |
| 2 | Tick crash on last leave | `if (!this.sim) return` + room test. |
| 3 | Non-finite input | `Number.isFinite` on all numerics, `seq` integer ≥ 0, `switchGun` 1–7 or null, server pitch clamp. Protocol test added. |
| 4 | LEAVE ARENA → DISCONNECTED | `close()` nulls `onClose`; unit + e2e assertions. |
| 5 | Golden tape | Rewritten (guns 1–7, pitched, HP topped, 3 seeds); spread change recorded in DECISIONS. |
| 6 | Hit feedback / local fire | `hitPlayer` event → blood FX; local muzzle + sound on fire with 220 ms echo suppression. |
| 8 | Never-joined socket | One-shot timeout armed in `onOpen` when the room is empty; room test. See open #8b. |
| 9 | Death UI | `phaseTimer` from a real death timestamp; epitaph `FRAGGED BY X`, none on suicide. |
| P2 | Label texture cache, killer-left credit, dead code, `WebWorker` lib, decaying smoothing capped at 0.35 u. | Diff read. |

## Open

### 10. Respawn teleport (new, reproduced) — P1

The client keeps predicting and queueing inputs while dead. The server
skips input consumption for dead players, so `lastSeq` freezes and the
pending buffer grows to ~120 entries over the lockout. On respawn the
server resets `lastSeq` to 0, the client's `reconcile` keeps all of them
and replays them from the spawn cell: with a movement key held, the
predicted self is **9.4 u** from the spawn point until the first fresh
input is acked (≈ one RTT), then snaps back. Repro: kill the player,
`stepLocal` with `moveZ = 1` for 2.05 s, ingest the respawn snapshot,
compare `worldView().player` with the server pose.

Fix (client, `stepLocal` / `reconcile`): while `me.alive` is false, do not
call `predictStep` and clear `pending` (still send pings). On the first
snapshot with `alive` true after a death, set `localX/Z` from the snapshot
and start predicting again. Optionally the server should also reject
in-flight pre-death inputs by keeping `lastQueuedSeq` across respawn
instead of resetting it (the reset is what lets stale seqs in). Add the
repro as a unit test.

### 11. Cosmetic shot ignores ammo and death — P2

`predictStep` plays the local muzzle flash + gun sound whenever `fire` is
held and the local cooldown is up. No check for `me.alive` or for
`me.ammo[WEAPONS[gun-1].ammo] > 0`, so an empty gun plays *bang* locally
followed by the server's dry-fire click, and a corpse "fires". Gate on
both; the snapshot already carries `ammo` and `alive`.

### 8b. Never-joined socket, occupied-room variant — P2

The join timeout is only armed when the room is empty. A socket that opens
while someone is playing, never joins, and outlives that player (room
shuts down, ticking stops) lingers forever — same DO-residency issue as
#8. Fix: arm the timeout in `onOpen` unconditionally (cancel on join), or
close every non-joined socket in `shutdown()`.

### Minor

- `game.ts` sets `camera.rotation.z` on `playerDie` / `playerSpawn`, but
  `renderer.update` already drives roll from `phase === 'dying'` every
  frame, so those two lines are redundant. Harmless; remove.
- Spawn selection now early-exits at the first candidate ≥ 16 u after 4
  samples instead of picking the farthest of 12. Acceptable reading of
  "best effort"; note it if spawns feel too close in the playtest.
- #7 (lattice density) still awaits the owner's call.

## Status after review 2

Ready for a local two-window playtest once #10 is fixed (it fires on every
respawn, so it will dominate the feel notes otherwise). #11 and #8b can
ride along. Then: commit, open the PR, playtest, Cloudflare Workers Builds
(§7), two-device playtest.
