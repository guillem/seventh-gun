# Security review — public arena

2026-10-07. Read-only review of the internet-facing arena: the Cloudflare
Worker (`server/index.ts`, one Durable Object named `global`) and the
portable Node server (`server/node/main.ts`). Three `pi` reviews
(`deepseek/deepseek-flash`, `kimi-coding/k3`, `zai/glm-5.3`) read the tree
independently. This note is the unified conclusion after those reports were
checked against the code.

No accounts, no remote code execution, no file disclosure, no path for one
client to rewrite another player's ammo, position, or score. The exposure
is availability of the single shared room.

## Findings

### 1. High — a finite yaw wedges the room forever

`pushInput` clamps movement and pitch and copies yaw through unchanged:

```ts
// src/sim/arena.ts, pushInput
moveX: Math.max(-1, Math.min(1, raw.moveX)),
moveZ: Math.max(-1, Math.min(1, raw.moveZ)),
pitch: Math.max(-Math.PI / 2, Math.min(Math.PI / 2, raw.pitch)),
```

`isInputFrame` only requires `Number.isFinite` on yaw
(`src/net/protocol.ts`). The next tick assigns that value to the player
(`src/sim/arena.ts`, look authority in `step`).

Damage then wraps the hurt angle with an unbounded loop
(`src/sim/arena.ts`, `damagePlayer`):

```ts
let rel = ang - (victim.yaw + Math.PI);
while (rel > Math.PI) rel -= Math.PI * 2;
while (rel < -Math.PI) rel += Math.PI * 2;
```

Past roughly `1e17`, subtracting `2π` does not change the IEEE value, so
the condition stays true. Below that threshold the iteration count is
`|yaw| / 2π`, which is already a permanent stall for magnitudes well under
`1e17`. Checked under Node 24: `1e16 + 2π` still changes; `1e17 + 2π`
does not.

The loop runs for any hit on that player, including owner splash from the
Bile Launcher and The Seventh (`src/sim/weapons.ts` splash
`damageSelfPct`, applied in `stepProjectiles`). `ArenaRoom.tick` calls
`step` with no isolation (`server/room.ts`). A `try/catch` does not stop
a loop that never throws.

On the Worker the platform eventually kills the Durable Object and every
connection on `idFromName('global')` drops. A new connection starts a fresh
room, and the same input wedges it again. On Node the event loop stays
pegged, so the arena and the static site both stop answering. The process
does not exit. `docker-compose.yml` restarts on exit only, so a public
self-host stays dead until someone kills it.

The same wrap exists in the single-player sim (`src/sim/sim.ts`,
`damagePlayer` and `canSeePlayer`). Those copies freeze only the local
tab. Fix them together so the idiom does not survive.

**Fix.** Normalize with `Math.atan2(sin, cos)` instead of a `while` loop.
Reject or wrap yaw where pitch is already clamped. Add a regression in
which a huge finite yaw still lets the room apply damage and tick.

All three `pi` reviews missed this. `glm-5.3` concluded there was no
reachable way to crash the room.

### 2. High — one client can hold every slot

`ARENA_MAX_PLAYERS` is 10 (`src/sim/arenaConstants.ts`). One socket owns
at most one player (`server/room.ts`, `handleJoin`), so ten sockets from
one host fill the only room. There is no second room and no per-IP cap.

The 15-second socket idle timer resets on any message, including `ping`
(`server/room.ts`, `onMessage` / `tick`). The 120-second gameplay kick
resets when look changes (`src/sim/arena.ts`, idle accounting). Other
players receive `full` and are disconnected.

Agreed by all three reviews. `deepseek-flash` and `k3` rated it high;
`glm-5.3` rated the same behavior medium because it bundled it with
connection floods. Permanent denial of the only multiplayer room, with
no flood required, is high.

**Fix.** Cap concurrent sockets and joins per source address. The Worker
sees the connecting IP on the request it forwards to the Durable Object.
Node sees the remote address. Cap unjoined sockets separately.

### 3. Medium — no aggregate limit on connections, egress, or map rebuilds

Per-socket limits exist (40 messages/second, 3 violations, 8192 bytes).
Nothing limits how many sockets share the one room.

- Sockets that never join live 15 seconds, and nothing caps how many are
  open (`server/room.ts`, `onOpen`). `broadcast` delivers snapshots and
  events to those sockets too, and `JSON.stringify` runs once per socket
  (`server/room.ts`, `send` / `broadcast`).
- The Worker uses `server.accept()` plus a 60 Hz `setInterval`
  (`server/index.ts`, `server/scheduler.ts`), so the Durable Object stays
  billed and awake while any socket is connected. Static assets stay up:
  `run_worker_first` is only `/arena` and `/health`.
- Node binds `0.0.0.0` (`Dockerfile`, `server/node/main.ts`) and serves
  the site and the arena in one process. `toRoomSocket.send` checks
  `readyState` and never `bufferedAmount` (`server/node/main.ts`). A
  joined client that stops reading, while still sending enough to refresh
  the idle timer, queues outbound snapshots with no ceiling. `deepseek-flash`
  rated this high for self-host. That is the sharpest case of this
  finding: ten slow readers can grow the process without a bound. The
  Worker uses the same `broadcast` and exposes no backpressure signal;
  workerd's own buffer ceiling is not in this repo.
- The last player leaving drops the sim (`server/room.ts`, `shutdown`).
  The next join builds a new 96×96 arena (`glm-5.3`). Join/leave cycling
  is a CPU amplifier against the one object.

Node 24 already applies default header and request timeouts (60 seconds /
300 seconds). The missing piece is a connection ceiling, not the absence
of any timeout. `k3` and `glm-5.3` both flagged the uncapped Node accept
path.

**Fix.** Terminate a peer whose outbound buffer crosses a fixed threshold.
Cap total sockets. Broadcast only to sockets that have a `playerId`. A
Cloudflare rate-limit rule on `/arena` covers the Worker until the
admission cap exists. Reusing the map across an empty-room gap removes
the rebuild amplifier.

### 4. Low — Node origin check trusts the Host header

Both entry points allow a missing `Origin` (intentional, and tested for
Node in `tests/unit/nodeServer.test.ts`) and allow any origin whose host
equals the request host (`server/index.ts`, `server/node/main.ts`).

On Node that host is the client-supplied `Host` header. A DNS-rebinding
page can make a browser send a matching `Origin` and `Host` while the
socket lands on a LAN or localhost server. There is no cookie and no
privileged HTTP route, so the result is an unwanted player in a private
arena, plus a copy of the public client files. Browser private-network
restrictions may block some of this. On Cloudflare, `Host` is the hostname
the edge routed, so the same trick does not admit a third-party page to
the public Worker.

The check is duplicated. Only the Node copy has a unit test (`k3`).

**Fix.** Compare against a configured hostname, including scheme, rather
than the request `Host`. Share one implementation.

### 5. Low — the art-branch deploy token can deploy production

`.github/workflows/deploy-art.yml` deploys with `CLOUDFLARE_API_TOKEN`.
The workflow comment states that this token can deploy production.
`scripts/check-art-deploy-target.mjs` refuses any target other than the
Worker `seventh-gun-art` on `art.seventhgun.com`. The guard lives in the
same commit a pusher of `codex/experimental-modern-art` can edit.

This needs write access to that branch. It is not an anonymous internet
bug. All three reviews rated it low. Token scope in the Cloudflare
dashboard was not visible from the repo.

**Fix.** Use a token that cannot deploy or take the domain of `seventh-gun`.

### 6. Info — accepted surface and hardening

- `?e2e=1` and `?test` install `window.__GAME__` on the public site
  (`src/main.ts`, `getDebugApi` in `src/app/game.ts`). Local cheat
  console. The server does not trust it.
- No Content-Security-Policy on Node responses or `index.html`. Arena
  names go through `sanitizeName` (`src/sim/arena.ts`) and are drawn with
  canvas `fillText`. No HTML sink for remote strings was found.
- Yaw, pitch, and full snapshots are client-visible and aim is
  client-authoritative (`src/sim/arena.ts`, `step` and `snapshot`). A
  modified client can aimbot and wallhack. Speed, fire rate, ammo,
  ownership, and damage stay on the server.
- `wrangler.jsonc` leaves `workers_dev` on, so the art Worker has a second
  public hostname besides `art.seventhgun.com`. Zone rules on the custom
  domain do not apply to `*.workers.dev`.
- Message callbacks and the tick timer are not wrapped (`server/node/main.ts`,
  `server/index.ts`, `server/scheduler.ts`). Worth doing for a future
  throw. It would not have contained finding 1.

## What holds

- 8192-byte cap before `JSON.parse` (`server/room.ts`). Node sets `ws`
  `maxPayload` to the same value and rejects binary frames
  (`server/node/main.ts`).
- 40 messages/second per socket, then a kick after 3 violations
  (`server/room.ts`).
- Input batches are at most 32 frames. The server queue is 8. Sequence
  numbers must be contiguous for the current life (`src/net/protocol.ts`,
  `src/sim/arena.ts`).
- Tick catch-up is at most 5 steps (`server/room.ts`).
- Static files: the URL parser collapses dot-segments, `safePathname`
  fails closed, and the resolved path must stay under `clientDir`
  (`server/node/main.ts`, `tests/unit/nodeServer.test.ts`).
- Browser cross-origin WebSocket upgrades are rejected. Same-host is
  allowed.
- Pull requests do not deploy. The art Worker name and domain are
  distinct from production. No secrets are committed. The container runs
  as `USER node`.

## Not verified from the repo

Cloudflare WAF and rate-limit rules, the real scope of
`CLOUDFLARE_API_TOKEN`, response headers on the deployed hosts, and
workerd's outbound WebSocket buffer limit. Any of those would change how
hard finding 3 is in production. None of them changes finding 1.

## Fix order

1. Safe angle wrap, and a regression for a huge finite yaw.
2. Per-source connection and join caps. Broadcast only to joined sockets.
3. Outbound backpressure and a Node connection ceiling.
4. An art-only Cloudflare token, and a rate-limit rule on `/arena`.
