# Foundry architecture and light baking

Original offline Blender environment authored for the second experimental art
milestone, 2026-10-03. This covers the campaign entrance, connecting airlock and
casting hall. It uses the unchanged campaign floor grid: 370 cells / 1,480 square
metres. No simulation, collision, door, enemy or pickup data was edited.

The scene adds tall concrete bays, overhead service galleries, roof trusses,
clerestories, suspended process vessels and a central pressure chamber. These
are visual architecture; overhead galleries are not playable platforms. Low
trim stays inside the existing wall-clearance margin. Existing side passages
remain open. Eight material meshes share one independent lightmap UV atlas.

## Sources and reproduction

```sh
node tools/modern-art/export_foundry_layout.mjs
/opt/homebrew/bin/blender --background --factory-startup --threads 4 --python tools/modern-art/build_foundry.py -- --size 2048 --samples 128
/opt/homebrew/bin/blender --background --factory-startup --threads 4 --python tools/modern-art/bake_materials.py
```

Blender 5.2.2 LTS uses Cycles CPU, four threads. `cwebp` compresses saved texture
outputs. `foundry.blend` retains the scene, lights and both UV sets;
`material-specimens.blend` retains both surface node graphs and packed maps.
`layout.json` records the source grid; the unit test compares it to the current
campaign and checks exported floor area, atlas coordinates and low obstructions.

The 2048² lightmap bakes diffuse direct and indirect illumination with receiving
surface color excluded. Linear bake values are divided by eight and explicitly
encoded with the sRGB transfer function into a Non-Color PNG, avoiding implicit
image-save conversions. The browser decodes the WebP as sRGB; lightMapIntensity
8 × pi restores the scale and converts the diffuse bake to Three.js irradiance.
Moving actors and doors are excluded from the static bake. Their shadowing uses
the existing player light, so opening a door does not rebake light transport.

Existing AI-generated concrete/steel/titanium base-color files are reused
unchanged. New tangent normals and roughness maps come from authored Blender
noise/bump material specimens, baked offline to saved images. They are independent
surface microdetail, not recovered physical measurements of the base-color image.
No runtime noise texture generation, external models, paid assets or services
were added. The GLB stores material names; the game binds texture maps at preload.

`provenance.json` lists runtime checksums. All six new resources total 3,483,510
bytes. The complete experiment now has 22 runtime art files totaling 8,226,436
bytes, before transport compression. Source PNGs and Blender files are not served.

## Runtime and evidence

The existing Three.js engine now supports this lightmapped scene, roughness and
normal maps, soft skylight haze and desktop-only highlight bloom. Touch devices
use the direct render path. The weapon/HUD is rendered after world postprocessing.

`gameplay-*.png` and `review-visual.json` were captured from the actual client
with fixed debug camera poses. These are game screenshots, not concept renders.
The menu image remains separate concept art. `review-performance.json` records
normal-mode entry, movement, pause/exit and desktop/mobile-emulation measurements.
Mobile emulation uses this Mac's GPU and does not establish physical phone speed.

This is one focused environmental pass. Remaining campaign rooms, old enemy
families and weapon models still need separate art work; it is not a completed
photorealistic game. Static lightmaps do not reproduce fully dynamic global
illumination or real volumetric scattering.

## Validation on 2026-10-03

348 unit tests pass under Node 24.21.0; all three TypeScript projects and the
production build pass. Full bundled-Chromium desktop/mobile suite: 101 passed,
13 intentional project skips, zero failures/retries (8.1 minutes).

Installed Chrome uses ANGLE Metal on Apple M5 Pro. After 30 warmup frames and
180 samples, desktop 1280×800, retina 2560×1600, touch-emulated 780×1688 and the
first combat hall each measured 60.00 fps, p95 16.7–16.8 ms. Draw calls were
394 / 394 / 350 / 619; triangles 403,670 / 403,670 / 392,318 / 574,952.
All normal entry/pause/exit checks passed, with no game console errors.

Bundled test Chromium reports ANGLE Vulkan SwiftShader (software rendering).
It passes the functional suite but its normal desktop frame sample exceeded
30 seconds; that failure is preserved in `review-software-renderer.json`.
Use `PLAYWRIGHT_CHANNEL=chrome` for hardware profiling. Hardware acceleration is
needed for useful performance; no claim is made for software rendering or phones.
