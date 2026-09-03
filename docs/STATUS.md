# STATUS

Updated: 2026-09-03 — multiplayer Arena v1 in this tree.

GEN_VERSION still 4. Maze layout unchanged. `ARENA_GEN_VERSION` is 1.

## State: Arena deathmatch

Title **MULTIPLAYER ARENA** joins one global Cloudflare Durable Object room
(`/arena`). Server ticks `ArenaSim` at 60 Hz, snapshots at 20 Hz. Clients
predict movement and interpolate others. Last player to leave deletes the
map; next join reseeds.

Combat helpers live in `src/sim/combat.ts` (shared with maze `Sim`). The
projectile-spreadDir pitch normalise vs pre-extraction is accepted
(`DECISIONS.md`). Golden tape owns guns 1–7 with pitched aim.

## Open / next

- Owner: Cloudflare Workers Builds on `guillem/seventh-gun`, first join from
  home to pin the DO in Europe.
- Human two-window playtest (hitscan lead, spawn distances, pad pacing).
- Owner: two-window playtest, then lattice density (#7) if maps feel samey.
- Lag compensation is explicitly out of v1.

## Where things are

- Arena sim/gen: `src/sim/arena.ts`, `arenagen.ts`, `arenaConstants.ts`, `combat.ts`
- Net: `src/net/protocol.ts`, `src/net/client.ts`
- Worker: `server/index.ts`, `server/room.ts`, `wrangler.jsonc`
- Render/HUD: `src/render/players.ts`, `src/ui/hud.ts` roster/scoreboard
- Debug: `joinArena` / `leaveArena` / `arena()` on `?e2e=1`
