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
  (`rng.ts`). An architecture unit test enforces this on `src/sim`,
  `src/campaign`, and `src/editor/model.ts`. `ECONOMY_FLOOR` (2.2×) lives
  in `src/sim/types.ts`.
- The renderer/audio/UI never decide gameplay outcomes; they consume
  `Sim.takeEvents()` and read state. Anything gameplay-visible must come from
  the sim so the unit tests actually cover it.
- `Game` (app layer) owns the loop: gather input → `sim.step(input)` (0..n
  times per frame with an accumulator) → drain events → update render/audio/ui.
- Persistence (settings, map log, campaign continue, editor library) lives
  in the app/ui layers — never in `src/sim/`. Map history is
  `src/app/mapLog.ts` (`seventh-gun.maplog`). Campaign continue is
  `src/app/campaignProgress.ts` (`seventh-gun.campaign`). User maps are
  `src/editor/library.ts` (`seventh-gun.mymaps`). Share URL
  parse/deflate/clipboard is `src/app/mapShare.ts`. The binary codec
  itself is pure and lives in `src/sim/mapcodec.ts`. Authored campaign
  maps live in `src/campaign/` (JSON DSL → `compileDsl` → baked
  `MapBlueprint` / `GameMap`). The editor model (`src/editor/model.ts`)
  is also pure and authors a `MapBlueprint`; the canvas/DOM lives in
  `src/editor/view.ts`.

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
closed doors and the arena seal (see `physics.ts: isSolidCell`). Visual
LOS (`hasVisualLineOfSight`) treats a door as see-through as soon as it
starts opening so enemies already in the world do not pop in after the
slab lifts; collision still uses `offset < 0.65`. A* on the
grid for enemy chase paths (4-dir, staggered repaths).

Authored maps use three layers: `MapBlueprint` (cell-int document) →
`compileBlueprint` (carves the 88×88 grid, expands doors, infers seal,
places cosmetics from `cosmeticSeed` when lights/decors are absent) →
`GameMap` (what `Sim` already consumes). `Sim.fromMap` is the second
constructor path; maze mode still uses `new Sim(seed, difficulty)` →
`generateMap`. Seal break is `GameMap.sealBreak` (gun N or key), not
hardcoded to gun 7. Share links live in the URL hash (`#m=SGMAP.v1.…`).

## Rendering approach

- Native-resolution WebGL (no low-res blit/upscale). Nearest-filtered canvas
  textures with nearest-mipmap filtering: crunchy but not muddy.
- World geometry is merged per-theme `BufferGeometry` with baked per-vertex
  light colors (room lights) + black fog: cheap, Quake-ish. Campaign runs
  (`runKind === 'campaign'`) bind
  `getCampaignTextures(artId)` for walls/floors/ceilings/door/sky and add
  renderer-only extras from `campaignDecor.ts`. Hero plates come from
  optional `CampaignTextureLib.heroDecals`, sibling `CAMPAIGN_HERO_DECALS`,
  or `getCampaignHeroDecals()` / `CAMPAIGN_HERO_MARKERS` (hint-driven
  ClampToEdge quads). Empty/missing is a no-op. Maze and `#m=` keep
  `getTextures()` themes even if a seed string looks like `campaign:`.
  Packs are cached. Painting stays canvas-only.
- Enemies/viewmodels/pickups are procedural Three meshes (no sprites, no
  billboards) with blob contact shadows. Enemy/pickup programs are
  compiled at `setRun` so the first door reveal does not hitch.
- Viewmodels render in a second pass after `clearDepth()` so they never clip
  into walls; muzzle flash lives in the same pass, a point light in the world.
- Fog of war: sim tracks explored cells; minimap/full map draw from that.

## Debug/E2E

`?e2e=1` exposes `window.__GAME__` (state, teleport, give, fire, pose for
screenshots, scripted input, `startMap`, `startCampaign`, `loadBlueprint`).
Tests never
drive pointer lock with synthetic mouse moves.
