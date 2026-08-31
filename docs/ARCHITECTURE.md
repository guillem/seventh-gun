# ARCHITECTURE

## Layers (strict, one-directional)

```
app (Game, input, debug API)
 ├─> ui     (HUD canvas/DOM, screens, map overlay)   reads sim state
 ├─> audio  (WebAudio synth)                          consumes sim events
 ├─> render (Three.js scene)                          reads sim state + events
 └─> sim    (deterministic, headless)                 THE authority
```

- `src/sim/` is pure TypeScript: no Three, no DOM, no `Math.random`. Fixed
  timestep 1/60 (`STEP_DT`). All randomness flows from seeded sfc32 streams
  (`rng.ts`). An architecture unit test enforces this.
- The renderer/audio/UI never decide gameplay outcomes; they consume
  `Sim.takeEvents()` and read state. Anything gameplay-visible must come from
  the sim so the unit tests actually cover it.
- `Game` (app layer) owns the loop: gather input → `sim.step(input)` (0..n
  times per frame with an accumulator) → drain events → update render/audio/ui.

## Determinism

- Two RNG streams in mapgen: layout (seed only — geometry identical across
  difficulties) and content (seed+difficulty — economy scales).
- Per-enemy RNG streams keyed by seed+enemy id, so update order cannot change
  outcomes.
- Same seed + GEN_VERSION + difficulty ⇒ identical grid, pickups, enemies
  (unit-tested by snapshot comparison and grid equality).

## Map representation

88×88 cell grid, 1 cell = 2 world units (`CELL`). Rooms are cell rects with
theme/outdoor/kind; corridors are 3-cell-wide carved rects. Dynamic solidity:
closed doors and the arena seal (see `physics.ts: isSolidCell`). A* on the
grid for enemy chase paths (4-dir, staggered repaths).

## Rendering approach

- Native-resolution WebGL (no low-res blit/upscale). Nearest-filtered canvas
  textures with nearest-mipmap filtering: crunchy but not muddy.
- World geometry is merged per-theme `BufferGeometry` with baked per-vertex
  light colors (room lights) + black fog: cheap, Quake-ish.
- Enemies/viewmodels/pickups are procedural Three meshes (no sprites, no
  billboards) with blob contact shadows.
- Viewmodels render in a second pass after `clearDepth()` so they never clip
  into walls; muzzle flash lives in the same pass, a point light in the world.
- Fog of war: sim tracks explored cells; minimap/full map draw from that.

## Debug/E2E

`?e2e=1` exposes `window.__GAME__` (state, teleport, give, fire, pose for
screenshots, scripted input). Tests never drive pointer lock with synthetic
mouse moves.
