# STATUS

Updated: 2026-09-04 — arena playtest bugfixes + character art redesign.

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

## Open / next

- Owner: Cloudflare Workers Builds on `guillem/seventh-gun`, first join from
  home to pin the DO in Europe.
- **Re-run the two-window playtest** against these fixes. Headless cannot
  meaningfully verify audio output; that needs a human.
- **Fireball spawns at the enemy's centre, not the launcher.** Harmless before,
  visible now that the slab has a mortar bell. Needs a per-type spawn offset in
  the sim — that changes projectile origin (collision, LOS) and will move the
  `combatGolden` hashes, so it is a deliberate call, not a drive-by.
- Lattice density (#7) if maps feel samey.
- Lag compensation is explicitly out of v1.

## Where things are

- Arena sim/gen: `src/sim/arena.ts`, `arenagen.ts`, `arenaConstants.ts`, `combat.ts`
- Net: `src/net/protocol.ts`, `src/net/client.ts`
- Worker: `server/index.ts`, `server/room.ts`, `wrangler.jsonc`
- Enemy art: `src/render/enemies.ts` + `skin*` in `src/render/textures.ts`
- Player art: `src/render/players.ts`, `src/render/playerArt.ts`
- Hit volumes: `enemyVolumeY` in `src/sim/enemyTypes.ts`
- Render/HUD: `src/ui/hud.ts` roster/scoreboard (canvas, no DOM overlay)
- Debug: `joinArena` / `leaveArena` / `arena()` / `pose()` / `snapshot()` on `?e2e=1`
