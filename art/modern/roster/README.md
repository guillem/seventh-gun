# Complete experimental roster and campaign pass

All content belongs to `codex/experimental-modern-art`, draft PR #32. Review
through Netlify Deploy Preview. Sources are retained; this is not a release.

## Saved assets

- `weapons/`: seven editable Blender weapons and fitted hands, three clips each.
- `enemies/`: six skinned creatures, five simulation-timed clips each.
- `support/`: pickups, a pedestal and a skinned arena marine.
- `environment/`: 28 authored modules across seven campaign identities.
- `materials/`: nine generated surface images plus an overcast panorama.
- `effects/`: generated transparent combustion and smoke images.
- `audio/`: 21 new generated recordings, 11 edited variants, exact prompts and
  preparation/checksum records. Original eight recordings remain unchanged.

Runtime deliveries are under `public/modern/`. The complete pack contains
84 files / 26,803,216 bytes before HTTP compression. Editable `.blend` files,
untouched image/audio sources, studio previews and review evidence do not enter
the client download. `runtime-manifest.json` records every delivered checksum;
regenerate it with `python3 tools/modern-art/inventory.py`.

Each asset directory documents its source, exact rebuild command, model budgets
and applicable limitations. Geometry and animations are original offline Blender
authoring. Images are generated base colors, not measured scans; the sky is LDR,
not an HDR lighting probe. Sound recordings use the existing free Runway account;
this pass submitted 34 included credits, without starting a trial or purchasing
anything. Pain/death variants are explicitly documented offline edits.

## Rendering and gameplay

Three.js remains the engine. ACES tone mapping, environment lighting, the existing
Foundry light bake, dynamic shadows, half-resolution desktop contact shading and
restrained bloom support the new assets. Touch uses the direct rendering path.
Transparent effects and labels are excluded from the contact-depth pass.

Weapon clips follow existing fire cooldowns. Creature clips follow existing
state timers and never move simulation roots. Clone ownership covers geometry,
materials, animation mixers and skeleton textures; shared image caches survive
run changes. Outer rig culling remains authoritative for animated bodies.

All simulation, network and server code is unchanged. Floors, doors, secrets,
weapon balance, hit volumes and generation versions remain unchanged. The seven
environment kits dress the existing grid. Large scenery stays overhead and low
wall details remain shallow; it creates no new cover or route.

This is a coherent full-game art pass, not parity with a photorealistic menu
painting. Rooms still reveal the original rectilinear layouts and repeated
modules. Only the authored Foundry opening has baked indirect lighting; other
areas use real-time lights and contact shading. Physical mobile devices and
Safari are not verified by desktop Chrome emulation.

## Evidence

- `review/gallery.html`: 27 actual gameplay captures, distinct from Blender
  studio previews and generated concepts.
- `review/report.json`: all seven weapons on desktop and portrait layouts,
  all seven campaign views and six positively identified enemy species.
- `performance/report.json`: normal-mode desktop, retina, touch emulation and
  first combat-room controls and frame measurements on Apple M5 Pro.
- `../../../docs/STATUS.md`: final aggregate validation and preview status.

The initial hardware measurements hold approximately 60 fps across all four
normal-mode scenarios, p95 16.7–16.8 ms. These measure frame cadence at selected
views; they are not a guarantee of every scene, GPU headroom or phone performance.
