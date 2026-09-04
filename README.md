# SEVENTH GUN

A seeded, late-1990s-style first-person shooter that runs entirely in the
browser. Every maze, texture, sound and demon is generated from a seed; the
seven campaign maps are authored. There are no asset packs or accounts. The
optional arena runs on Cloudflare Workers or the portable Node server.

*Every run builds a new nightmare. The Seventh Gun ends it.*

## Play

Find seven guns scattered along a twisted maze of industrial halls, organic
gullets and open courtyards under an alien sky. Each gun changes how you
fight. The Seventh — a void-cannon that erases whole packs — shatters the
seal on the finale arena. Clear the arena to win.

- Same seed + skill = the exact same maze, demons and loot. Share a seed,
  race a friend. **MAP LOG** on the title screen remembers seeds you already
  played (time, skill, won/died/quit) so you can replay without writing
  the code down. Stored in this browser only.
- **CAMPAIGN** is seven authored maps listed by name. Map 1 is always
  open; each win unlocks the next. The guns stay with you; HP resets
  each map. Hidden pockets and powerups reward exploration. Progress is saved
  in this browser (`CONTINUE` from map 2 on).
- Runs are ~20–30 min on Normal. Easy if you die in the first minute, Hard
  if you don't.

## Controls

| Desktop | |
|---|---|
| WASD | move (camera-relative) |
| Mouse | look (pointer lock on click) |
| Left click / hold | fire |
| 1–7 / wheel | switch guns |
| E | use doors |
| TAB / M | full map (pauses combat) |
| ESC | pause |

Phones/tablets: floating left stick to move, drag right side to look,
FIRE / USE / MAP buttons above the HUD.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
```

```bash
npm test           # unit: mapgen sweep, weapon contracts, determinism
npm run test:e2e   # playwright: desktop + mobile projects
npm run build      # typecheck + Vite/Cloudflare build -> dist/client + worker
```

URL tricks: `?seed=anything` pre-fills a maze seed; `#m=SGMAP.v1.…` loads an
authored map (hash, not query; wins over `?seed=`); `?edit=1` opens the
level editor; `?e2e=1` exposes the `window.__GAME__` debug API used by the
test suite (not present in normal play). `#m=` maps offer RETRY MAP / TITLE
/ COPY LINK / SAVE TO LIBRARY instead of a new maze. Title **CAMPAIGN**
is seven authored maps with persistent guns; **EDITOR** authors a
shareable map (library in this browser only). **MULTIPLAYER ARENA** joins
the global deathmatch room (`npm run dev` serves `/arena` locally; open two
windows). Campaign debug:
`startCampaign(n)`, `completeMap()`, `campaign`. Arena debug (`?e2e=1`):
`joinArena(name)`, `leaveArena()`, `arena()`.

## Run it on your own machine

There is no hosted service to sign up for and no accounts anywhere. You run it,
your friends connect to you, and nothing leaves the box.

**Docker** — the whole game plus the arena, one command:

```bash
docker run -p 8080:8080 ghcr.io/guillem/seventh-gun
```

**npx** — same thing if you already have Node 22+:

```bash
npx seventh-gun            # --port 8080 --host 0.0.0.0
```

Both print a LAN URL on startup. Anyone who can reach that address can open it
and join **MULTIPLAYER ARENA** — one shared room, running on your hardware.
Behind a reverse proxy on another domain, set `ALLOWED_ORIGINS=https://your.domain`.

**Static files only** — grab `seventh-gun-<version>-static.tar.gz` from
[Releases](https://github.com/guillem/seventh-gun/releases) and drop it in any
web server. Campaign, random mazes and the editor all work; the arena needs a
server, so it reports offline. Point unknown paths at `index.html` so shared
`#m=` map links survive a refresh.

**Your own Cloudflare account** — the arena on the Workers free plan, in *your*
account, on your own subdomain. Clone and deploy:

```bash
npm ci && npm run build && npx wrangler deploy
```

This is the supported deployment path. Configure the account and domain in the
Cloudflare dashboard before using it.

## Under the hood

- **Vite + TypeScript + Three.js**, native-resolution WebGL, procedural
  canvas textures, procedural meshes, WebAudio-synthesized SFX.
- **Deterministic headless sim** (`src/sim/`): fixed 60 Hz timestep, seeded
  RNG streams, zero DOM/Three imports — that's what the unit tests run.
  Same seed + generator version + difficulty ⇒ identical world (tested by
  snapshot equality over a 300-seed sweep).
- Six enemy species (the Fiend is campaign-only) with sight cones, hearing,
  telegraphed dodgeable projectiles; closed doors block line of sight,
  bullets and rendering.
- Three difficulties scale the whole economy; the layout stays identical.

Start with [AGENTS.md](AGENTS.md) and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
Balance numbers live in [docs/GAME-DESIGN.md](docs/GAME-DESIGN.md).

## License

[MIT](LICENSE). Textures, meshes and sounds are generated at runtime; random
mazes are seed-generated and campaign maps are authored here. There are no
asset packs, fonts or third-party art. The client bundles
[three.js](https://threejs.org) and the Node server uses `ws`; see
[THIRD-PARTY.md](THIRD-PARTY.md).
