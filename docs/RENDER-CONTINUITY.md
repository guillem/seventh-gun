# Rendering continuity — 2026-10-03

Experimental branch `codex/experimental-modern-art`, draft PR #32 only.
No simulation, map, balance, collision or network changes.

## Report and causes

The user observed first-shot/first-room pauses, a room-entry light switch that
changed the whole hall's brightness and colour, and checker-like doorway jambs.

- Each muzzle flash used to attach a new PointLight. Three includes visible
  point/spot/shadow counts in shader program keys, so firing recompiled world
  materials. Explosions and projectiles could introduce further combinations.
- The Foundry rectangle predicate changed global ambient, hemisphere,
  environment, weapon and camera lighting as the player crossed its boundary.
  Damping hid neither the scene-wide colour shift nor new light-count variants.
  Four practical lights also moved to the player's nearest source every 250 ms.
- `compile()` at the default framebuffer did not prepare the desktop composer's
  linear render target, contact-normal pass, GPU vertex/image data or skeletons.
- Saved hall endcaps overlapped generated corridor wall planes at every side
  opening. The saved portal lintels also used the older 4.2 m corridor height.

## Changes

Lighting is configured once per map. Foundry's seven pendant/roof spots and ten
side-room sources stay at their fixtures, and scene/weapon ambient levels stay
constant across doorways. A deterministic twelve-slot practical budget covers
ordinary rooms before extra large-room sources. Other maps also use stationary
sources. The camera spotlight is removed; only a very small neutral camera fill
remains. Fixed unshadowed lights can still bleed through nearby geometry.

Three retained FX lights receive transient light uniforms without changing
shader layouts. Tracers, particles, explosions and projectiles reuse prepared
GPU resources. Pools retain their gameplay high-water mark; this is not a claim
of zero JavaScript allocation or a strict memory ceiling. Seven cached weapon
models and a persistent transparent muzzle sprite survive weapon switches.
Equip/fire animation resets when selecting a cached model; final renderer
teardown releases the retained owners.

Before play, the real world/composer/contact-shading and weapon paths draw all
required resources with temporary culling/visibility overrides. State is restored
even on failure, and a clean gameplay frame replaces the preparation image.
UI starts paint a loading screen before that work and wait for audio decoding.
Simulation is frozen while preparing, input edges are cleared afterward, and
preparation failures expose Retry/Reload. Public debug start APIs remain
synchronous; normal UI starts use the paint barrier.

Blender subtracts only the saved surfaces already owned by generated walls and
ceilings. Portal heads now match the six-metre corridor ceiling. The irradiance
atlas is rebaked with the established 2048px/128-sample settings. The actual-GLB
regression changes from 48 overlapping triangles at twelve jambs to zero,
preserving the 370-cell authored floor and all gameplay data. Evidence:
`art/modern/refinement/doorway-seams.json`.

## Validation and reproduction

`scripts/inspect-cold-events.mjs` runs a fresh normal Chrome context at DPR 2,
instruments WebGL creation/upload calls, and uses the real Play/fire controls.
Browser-only bootstrap instrumentation exposes the existing game instance for
repeatable room/weapon poses; the delivered app exposes no extra API.

```
node scripts/inspect-cold-events.mjs http://localhost:4173 art/modern/continuity/production
PORTRAIT=1 node scripts/inspect-cold-events.mjs http://localhost:4173 art/modern/continuity/portrait
```

The local Vite-only baseline mode (`BASELINE=1`, optional `BASELINE_REF`) creates
and removes temporary modules from commit `59ade53`; current assets are retained.
It compares rendering behaviour, not the previous geometry or irradiance atlas.
Do not run two baseline probes concurrently against the same checkout.

The recorded baseline created 18 GPU programs on the first shot and 23 at the
first room boundary, with observed frame gaps of 83.4 and 133.4 ms respectively
on this Mac. The user's longer pauses were not reproduced at the same duration.
After preparation, the checked shots, reveals and all seven weapon effects
create zero programs, upload zero image assets and allocate zero vertex buffers.
Skeleton matrix textures still update normally. Local desktop and portrait
captures hold roughly 16.7 ms per frame during those checked actions.

Preparation was about three seconds on the first observed driver compile and
under one second on subsequent contexts with a warm driver cache. It has moved
to an explicit loading phase, not disappeared. These are Apple M5 Pro / Chrome
measurements with a desktop GPU; touch emulation is not physical-phone testing,
and the checks do not establish a universal latency or full-map FPS guarantee.

See `art/modern/continuity/` for raw before/after measurements, screenshots,
unit/browser results and preview verification. `docs/STATUS.md` records the
delivered validation and preview commit.

The optional `PLAYWRIGHT_CHANNEL=chrome` setting runs the same end-to-end
assertions in locally installed Chrome. The bundled headless Chromium on this
Mac reports ANGLE/SwiftShader (Vulkan software rendering). Local defaults are
unchanged; CI later moved to Mesa llvmpipe (`E2E_GL=llvmpipe`, see TESTING.md
"E2E in CI"). Software-rendered
timing is recorded separately and is not used for gameplay frame-rate claims.

Restart an existing Cloudflare local `npm run preview` after rebuilding: its
asset manifest can retain old bundle filenames and serve fallback HTML for the
new JavaScript. Final verification used a restarted server and the exact
JavaScript/CSS hashes served by Netlify.
