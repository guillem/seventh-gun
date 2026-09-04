# STATUS

Updated: 2026-09-04 — open-source packaging: MIT, plus a portable Node
server and four self-host distribution targets. Branch
`feat/open-source-packaging`, not yet merged.

GEN_VERSION still 4. Maze layout unchanged. `ARENA_GEN_VERSION` is 1.

## State: Arena deathmatch

Title **MULTIPLAYER ARENA** joins one global Cloudflare Durable Object room
(`/arena`). Server ticks `ArenaSim` at 60 Hz, snapshots at 20 Hz. Clients
predict movement and interpolate others. Last player to leave deletes the
map; next join reseeds.

Combat helpers live in `src/sim/combat.ts` (shared with maze `Sim`). The
projectile-spreadDir pitch normalise vs pre-extraction is accepted
(`DECISIONS.md`). Golden tape owns guns 1–7 with pitched aim.

## Arena playtest fixes (2026-09-04)

First human two-window playtest found four bugs; investigating them found five
more. All fixed, all covered by tests.

- **Silent arena.** `unlock()` is the only place the AudioContext is built, and
  `startArena()` never routed through `beginPlay()`. `joinArena()` now unlocks
  as its first statement, inside the click's user-gesture window.
- **RESUME did nothing — three independent causes**, all needed:
  1. `resume()` guarded on `phase === 'paused'`; arena only sets `arenaMenu`.
  2. An empty but opaque `#scoreboard-screen` `.screen` div was appended after
     `#pause-screen`, so it painted over the menu and swallowed the click.
     Deleted — the scoreboard is canvas-drawn on `#hud` and the div did nothing.
  3. **`openArenaMenu()` never released pointer lock.** With the mouse captured
     there is no cursor to click RESUME with. It now mirrors `togglePause()`
     (`input.paused = true` + `releaseLock()`), and `closeArenaMenu()` clears
     `paused` or the player resumes into a frozen body.
- **"Map shows a grey layer".** `m`/Tab is the scoreboard in arena, not the map;
  the grey layer was the empty div above. Arena full-map draw also wired up.
- **Pickup cross-talk.** The `pickup` handler showed a HUD message for any
  player's pickup — no `e.id === selfId` filter. A genuine bug for real players
  on separate machines, not a shared-browser artifact. Frag messages stay global.
- **Remote players fogged wrong.** `players.ts` never called `applyRadialFog`.
- **`pose()` showed enemy backs.** `e.yaw = p.yaw + Math.PI` pointed them away
  (rig local +z is forward, see `sim.ts` `atan2(dx, dz)`). Every posed review
  screenshot before this was of the enemies' backs.
- **Enemy eyes stuck flared.** Three writers to `eyeMat.color`, no idle restore,
  and the attack flare compounded off its own mutated value. Flares now derive
  from a stored `EnemyRig.eyeBase`, so each species flares in its own hue.

No cross-window keypress leak was found — no `BroadcastChannel`, `SharedWorker`,
or shared client id. The pickup messages made input look like it was leaking.

## Character art redesign (2026-09-04)

Player feedback: crawler and wisp good, husk/slab/hierophant/fiend bad. The
measured correlation was inverted from intuition — the two liked designs were
the *least* elaborate in the codebase (crawler 76-line mesh / 33-line skin) and
the four disliked ones the *most* (fiend 96/108). Detail was never the winning
variable; silhouette and a restrained palette were.

Redesigned husk, slab, hierophant, fiend; **crawler and wisp deliberately
untouched**. Recipe: one lathe or scaled-sphere body mass, limbs as
`TubeGeometry` on `CatmullRomCurve3`, pose asymmetry baked into child groups so
the animation cannot clobber it, a map-less pale Lambert for hard parts (a
Lambert tint can only darken a map), 64px skins, and exactly one accent hue on
the eyes with any second accent kept small and far from the face.

Skins went 84/91/98/108 → 30/33/25/24 lines. **No 128px canvas remains.**
Accents: crawler red, husk acid-green, slab molten yellow, hierophant violet,
fiend ember orange-red, wisp blue.

`src/render/players.ts` was a placeholder (capsule + sphere, no rig, no
animation). Now a marine: helmet/visor, pauldrons, cuirass, gauntlets, boots,
rifle, walk cycle from smoothed positional delta, fall-and-topple death, blob
shadow. Skins in the new `src/render/playerArt.ts`. `PLAYER_PALETTES` kept its
length and slot order; two colliding values were replaced (olive read as dim
yellow, steel-blue sat between blue and teal).

Retro-unlit still holds — Lambert/Basic only, no lights, no shadow maps. See
`DECISIONS.md`; the PBR pass was rejected in PR #20 and is not to be revisited.

## Hit volumes now match the art

The redesigns grew heads, horns and mitres, and art rendering above
`enemyVolumeY(def).yMax` is unhittable — a shot at a visible skull misses. The
hierophant's mitre had 0.14u above the ceiling; husk and fiend had zero margin.

`tests/unit/enemyHitbox.test.ts` now measures built geometry against the volume
the sim shoots at, per enemy, with headroom for each locomotion branch's bob.
Thin held props (staff shaft/finial, wisp tentacles) are excluded by thickness
(`< 0.12`), not by a per-enemy slack allowance — a blanket allowance hides fat
masses like a mitre.

The wisp's flying volume ignored its hover bob entirely, so it left the box at
both ends of every cycle. `EnemyDef.hoverBob` now widens the flyer volume, and
`EnemyRenderer` reads the same field, so animation and hit volume cannot drift.
`combatGolden` hashes were checked and did not move.

## Playtest round 2 (2026-09-04, Chromium + Firefox)

Confirmed fixed by a human: sound, pointer capture, RESUME, kill counting,
remote players. Three new issues found, all fixed:

- **`m` was swallowed by text inputs** ("chromium" typed as "chroiu"). The
  global keydown handler `preventDefault()`s KeyM/Tab and ran for every
  target; only the seed input defended itself with `stopPropagation`.
  Pre-existing, not a regression. `isEditableTarget()` in `input.ts` now makes
  the whole handler bail on input/textarea/contenteditable, which also stops
  WASD driving the player while you type a name. The seed input's ad-hoc
  guard was then dead and was removed.
- **`m` now opens the MAP in arena, `Tab` the scoreboard.** They previously
  shared one `onMapToggle` callback; now split into `onMapToggle` (KeyM) and
  `onScoreboardToggle` (Tab). Campaign keeps Tab-opens-map. Arena movement and
  fire are now frozen while the map is open, matching campaign.
- **The always-on roster covered SEED/KILLS.** Roster panel moved to y=46.

## Enemy projectiles leave the muzzle

`EnemyDef.muzzleOffset` ({forward,right,up}, local frame, rotated by `e.yaw`)
replaces the old centre-of-body spawn. Values derived by reading the meshes.
Subtlety worth knowing: `e.timer` counts DOWN to 0 and the shot leaves at
`timer<=0`, so the render arm is at its UN-aimed pose at the firing instant —
the slab's bell offset is computed there, not at the windup pose.

`combatGolden` hashes moved and were updated with evidence: final enemy HP sum
is bit-identical, late checkpoints are byte-identical, only in-flight
projectile coordinates shifted. **Coverage gap flagged:** the golden tapes fire
husk only, so the other five offsets rest on mesh derivation plus
`enemyMuzzleOffset.test.ts`'s rotation maths.

One real trajectory change: the slab's fireball `dy` flips sign, so it now
rises toward chest height instead of dropping into it. Not compensated for.

## Viewmodels

All seven guns rebuilt on a shared language documented at the top of
`viewmodels.ts`: one set of armoured hands matching the marine, six materials
defined once in the new `src/render/gunArt.ts`, 64px skins, and at most one
unlit hot element per gun in that gun's muzzle-flash colour.

`GUN_FLASH` in `gunArt.ts` is the single source of truth for those colours —
`renderer.ts` fireVisual and every builder index it. They had drifted while the
list existed twice (the Sunlance wore yellow rings while flashing cyan, and
that yellow was the slab's accent). `tests/unit/gunArt.test.ts` locks it.

`buildWorldGun` shares these builders, so the pedestal pickups changed too.

## Deployment

Two live targets, plus a portable target other people run themselves. The live
two auto-deploy from `main`; neither needs a manual step.

| | URL | Serves | Trigger |
|---|---|---|---|
| Netlify | https://seventh-gun.netlify.app | static client only, **no arena** | auto on push |
| Cloudflare | https://seventh-gun.default-428.workers.dev | client **and** arena | GitHub Actions on green tests |
| Self-host | whatever the operator runs it on | client **and** arena | `v*` tag → release.yml |

**Self-host is not a live target we operate.** `server/node/main.ts` bundles to
`dist/node/server.mjs` and ships three ways: `ghcr.io/guillem/seventh-gun`,
`npx seventh-gun`, and a static-client tarball with no arena. It runs the same
`ArenaRoom` as the Worker — one in-memory global room, no Durable Object, so
none of the cost model below applies to it and hibernation is irrelevant there.
Room state dies with the process, which is what a friends-and-LAN server wants.

**The Worker serves the whole game, not just the socket.** `wrangler.jsonc`
sets `assets.directory: ./dist/client` with `run_worker_first: ["/arena",
"/health"]`, so the Cloudflare URL is the complete product.

**No env var is needed for the arena.** `game.ts` resolves the socket as
`VITE_ARENA_WS_URL ?? ${wss|ws}://${location.host}/arena`, and
`server/index.ts` always allows same-origin — so on Cloudflare it just works.
`VITE_ARENA_WS_URL` + `ALLOWED_ORIGINS` are only needed for the other shape
(Netlify-hosted client dialling Cloudflare), which we deliberately do not use.

**Netlify degrades correctly.** Its host has no `/arena`, so a join attempt
fails in ~5s and shows **ARENA OFFLINE**; the maze/campaign game is unaffected.
Verified against the live site, not just locally — note `vite preview` runs
workerd via `@cloudflare/vite-plugin` and DOES serve the arena, so it is NOT a
valid stand-in for Netlify. Test the static path by serving `dist/client` with
a plain HTTP server.

### Cost — free tier, structurally safe

Cloudflare free plan, no payment method on the account. **Exceeding a free
limit returns an error rather than billing.** Durable Objects are the
SQLite-backed kind (`new_sqlite_classes`), which is what the free plan allows;
KV-backed DOs are paid-only.

Limits: 100k requests/day, 13,000 GB-s/day, 5 GB storage; Workers Builds (not
used) would be 3,000 min/month. GitHub Actions on a private repo: 2,000
min/month with a $0 default spending limit.

`server/index.ts` uses `server.accept()`, **not** the WebSocket Hibernation
API, so the room object stays resident while anyone is connected — about 28
hours of room-alive time per day at 128 MB. `shutdown()` stops the tick loop
and drops idle sockets (15s) when the room empties, so it does not accrue
overnight. **If the compute cap is ever approached, switching to Hibernation
is the single highest-leverage change** — it removes the cost of idle players.

### CI

`.github/workflows/deploy.yml`. Push to `main` → typecheck + unit + e2e, then
deploy the Worker only if all pass, then retry `/health` until 200. Pull
requests run checks and never deploy. Auth is the repo secret
`CLOUDFLARE_API_TOKEN`; the account ID is the repo *variable*
`CLOUDFLARE_ACCOUNT_ID` (not sensitive).

Chosen over Cloudflare Workers Builds — which is simpler and needs no token —
because Workers Builds only runs a build command and cannot refuse to ship a
red suite. In one session the tests caught an unhittable hierophant mitre,
enemy eyes stuck permanently flared, and gun accents drifting off their own
muzzle-flash colours. None of those break a build.

## Open source + self-host packaging (2026-09-04)

On `feat/open-source-packaging` (2 commits, not merged). MIT license, and the
same game now runs on hardware other people own.

**The port was nearly free** because `server/room.ts` was already
runtime-agnostic: clock, seed source and scheduler are constructor-injected and
sockets are a two-method `RoomSocket`, with no `ctx.storage` and no hibernation
API. The Worker and the Node server share every line of arena logic. Keep it
that way — Cloudflare specifics stay in `server/index.ts`, Node specifics in
`server/node/`. `intervalScheduler()` moved to `server/scheduler.ts` unchanged
and both entries import it.

New: `server/node/main.ts` (node:http + `ws`, one in-memory global room),
`bin/seventh-gun.mjs`, `Dockerfile`, `docker-compose.yml`,
`.github/workflows/release.yml`, `LICENSE`, `CONTRIBUTING.md`, `THIRD-PARTY.md`,
issue templates. `deploy.yml` is untouched.

**Three build gotchas, all already handled — do not undo them:**

- `vite.config.ts` selects a target by `--mode`, not an env var, so scripts work
  on Windows. The `isSsrBuild` branch is load-bearing: without it the `--ssr`
  pass inherits `dist/client` + `emptyOutDir` and deletes the client build.
  Always client first, then server.
- `.npmignore` exists only because npm falls back to `.gitignore` otherwise,
  which lists `dist/` — publishing a package with no build in it.
- `server/node` needs `@types/node`, which `tsconfig.server.json` deliberately
  excludes, hence `tsconfig.node.json`. `npm run typecheck` runs all three.

`three` is now a devDependency: the published artifact is prebuilt and three is
bundled into it. `ws` is the only runtime dependency.

**A crash was found and fixed in the second commit.** `curl 'http://host/%zz'`
killed the process permanently — `decodeURIComponent` throws and a throw inside
a Node request listener is uncaught. All parsing goes through `safePathname()`
now, which returns null rather than throwing on a bad escape or a bad Host
header. Regression tests in `tests/unit/nodeServer.test.ts`.

### Verified by actually running each target

- Two clients joined one arena room on plain Node, matching seed and grid hash,
  movement propagated. This is the check that proves the DO-free path.
- Packed tarball installed into a clean directory and booted (`npm pack`).
- Container built, ran as non-root, served the game (171 MB).
- Static tarball (248 KB) served by `python3 -m http.server`; arena correctly
  reports offline.
- `npm test` 281 passed, `npm run test:e2e` 83 passed, both builds intact.
- Malformed requests (`/%zz`, `/%`, bad Host) return 400 and the process
  survives; traversal resolves to `index.html` and leaks nothing.

### Left to do — all outward-facing, all needing a human

1. Open the PR for `feat/open-source-packaging` and merge it.
2. Flip the repo public. History was scanned for secrets and is clean.
3. **Click the Deploy-to-Cloudflare button once and fix or remove it.** It is
   the only one of the four targets that could not be tested while the repo was
   private. The README leads with `wrangler deploy` because that path is known
   to work; the button is offered second.
4. Add `NPM_TOKEN` as a repo secret, then tag `v0.1.0` to cut the first release.
   The workflow refuses a tag that disagrees with `package.json`.

Going public does not change the billing posture — still no payment method on
the Cloudflare account, so the worst case is 429s, never a bill. It does mean
strangers can find the live arena URL and share a room with friends; dropping
the live link from the README is the lever if that is unwanted.

## Open / next

- **Product race: a client joining as the last player leaves can be dropped.**
  `shutdown()` in `server/room.ts` closes every socket with no `playerId` yet,
  and a client that is mid-join has none — so it is torn down along with the
  empty room. Surfaced on CI as `arena()` reporting `connected` and then going
  null a moment later. Self-heals in play (the client shows ARENA OFFLINE and
  can rejoin), so it is not a blocker, but it is a real race and not a test
  artifact. Fix would be to skip sockets that are mid-join in `shutdown()`, or
  to re-check the player count after the join completes.
  `tests/e2e/arena.spec.ts` "an emptied room is recycled" retries through it
  rather than pretending it does not happen.
- **Playtest round 3.** Specifically: does the slab's raised fireball arc feel
  worse, and do the new viewmodels read at a glance in a real fight?
- **Viewmodels want a second art pass.** The pistol and shotgun got full
  design attention; the other five were built to the same language but more
  quickly, and the Sunlance needed its emitter reworked after the fact.
- Lattice density (#7) if maps feel samey.
- Lag compensation is explicitly out of v1.

## Where things are

- Arena sim/gen: `src/sim/arena.ts`, `arenagen.ts`, `arenaConstants.ts`, `combat.ts`
- Net: `src/net/protocol.ts`, `src/net/client.ts`
- Arena room (shared by both runtimes): `server/room.ts`, `server/scheduler.ts`
- Worker: `server/index.ts`, `wrangler.jsonc`
- Self-host server: `server/node/main.ts`, `bin/seventh-gun.mjs`, `Dockerfile`
- Enemy art: `src/render/enemies.ts` + `skin*` in `src/render/textures.ts`
- Player art: `src/render/players.ts`, `src/render/playerArt.ts`
- Hit volumes: `enemyVolumeY` in `src/sim/enemyTypes.ts`
- Render/HUD: `src/ui/hud.ts` roster/scoreboard (canvas, no DOM overlay)
- Debug: `joinArena` / `leaveArena` / `arena()` / `pose()` / `snapshot()` on `?e2e=1`
