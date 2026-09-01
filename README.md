# SEVENTH GUN

A seeded, late-1990s-style first-person shooter that runs entirely in the
browser. Every maze, texture, sound and demon is generated from a seed —
no asset packs, no backend, no accounts.

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
npm run build      # static build -> dist/ (Netlify-ready, see netlify.toml)
```

URL tricks: `?seed=anything` pre-fills a maze seed; `#m=SGMAP.v1.…` loads an
authored map (hash, not query; wins over `?seed=`); `?e2e=1` exposes the
`window.__GAME__` debug API used by the test suite (not present in normal
play). `#m=` maps offer RETRY MAP / TITLE / COPY LINK instead of a new maze.

## Under the hood

- **Vite + TypeScript + Three.js**, native-resolution WebGL, procedural
  canvas textures, procedural meshes, WebAudio-synthesized SFX.
- **Deterministic headless sim** (`src/sim/`): fixed 60 Hz timestep, seeded
  RNG streams, zero DOM/Three imports — that's what the unit tests run.
  Same seed + generator version + difficulty ⇒ identical world (tested by
  snapshot equality over a 300-seed sweep).
- Five enemy species with sight cones, hearing, telegraphed dodgeable
  projectiles; closed doors block line of sight, bullets and rendering.
- Three difficulties scale the whole economy; the layout stays identical.

Start with [AGENTS.md](AGENTS.md) and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
Balance numbers live in [docs/GAME-DESIGN.md](docs/GAME-DESIGN.md).
