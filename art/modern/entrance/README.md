# Foundry entrance detail pass

Third experimental art milestone, 2026-10-03, on `codex/experimental-modern-art`.
The entrance and first airlock receive focused detail while keeping the original
floor plan, door width/height/travel, enemies, hitboxes and mechanics.

## What changed

- Two new saved base-color textures: a weathered F-01 lifting door and worn
  concrete slabs. Built-in imagegen generated the original PNGs; the exact
  prompts and source/runtime checksums are in `prompts.md` and `provenance.json`.
  WebP compression uses `cwebp -q 88`; no image editing or paid services.
- Original Blender service cabinets, ventilation louvers, fasteners, conduit
  clips, lower wall cladding, caged amber lights and matte enamel signage.
  The static environment remains in `../foundry-room/foundry.blend` and now has
  eleven material meshes sharing a 2048² lightmap atlas. The geometry test checks
  that new low surfaces stay within 0.2m of the original solid boundary.
- Cooler, less uniform skylight fill and warm light pools around the entrance.
  A small runtime ceiling practical keeps moving door surfaces readable; static
  lightmaps alone cannot illuminate moving actors or doors.
- Bevelled guard rails and captive hex fasteners in `door-hardware.blend` and a
  separate GLB. They are children of the existing slab, so the original renderer
  animates all the hardware with the unchanged door movement.

The entrance's worn concrete uses its own material and larger texture repeat;
the casting hall retains the earlier metal floor. The character/weapon roster
and animation are outside this focused pass. The current game remains an art
experiment rather than a finished photorealistic overhaul.

## Reproduction

```sh
/opt/homebrew/bin/blender --background --factory-startup --threads 4 --python tools/modern-art/build_foundry.py -- --size 2048 --samples 128
/opt/homebrew/bin/blender --background --factory-startup --threads 4 --python tools/modern-art/build_entrance_door.py
cwebp -quiet -q 88 art/modern/entrance/door-source.png -o public/modern/foundry/entrance-door.webp
cwebp -quiet -q 88 art/modern/entrance/floor-source.png -o public/modern/foundry/entrance-floor.webp
PLAYWRIGHT_CHANNEL=chrome node scripts/inspect-entrance.mjs http://127.0.0.1:5175 /private/tmp/entrance-review
```

The original generated PNGs are preserved. Regenerating a prompt is not expected
to reproduce the exact image; use the saved source files for reproducible builds.
The nine Foundry resources currently total 5,332,724 bytes. All 25 experimental
runtime assets total 10,075,650 bytes before transport compression, 1,849,214 bytes
more than milestone two. Source scenes, original PNGs and inspection evidence
are not included in browser downloads.

## Review evidence

`desktop-entry.png`, `desktop-door.png`, `desktop-door-open.png` and the mobile
counterparts show actual game rendering. `report.json` contains the capture state
and errors. The map hash stays `ee306bc5`. Previous entrance screenshots in
`../foundry-room/` are preserved as the milestone-two comparison.

The inspection harness uses fixed debug camera poses. Normal-mode performance
and real controls are checked separately; mobile emulation runs on this Mac's
GPU and is not a physical-phone benchmark. Static lighting still does not rebake
when doors move. Existing gameplay silhouettes remain visible through the open
entrance; no new crates or opaque cover occupy the passage.


Local validation: 349 unit tests, all three TypeScript projects and the production
build pass. The complete desktop/mobile Playwright run passes 103 tests with
13 intentional project skips, zero failures/retries (8.0 minutes). The new door
traversal check passes on both projects. Source scene reload resolves its
relative lightmap path. Gameplay map hash remains `ee306bc5`.


Normal installed Chrome / ANGLE Metal on Apple M5 Pro: 30 warmup frames, 180
sampled frames in each view. Desktop, retina, mobile emulation and first combat
hall each measured about 60 fps, p95 16.7–16.8 ms. Draw calls: 401 / 401 / 357 /
619; triangles: 416,890 / 416,890 / 405,538 / 580,032. Entry/pause/exit controls
passed with no game errors. `review-performance.json` contains the measurements
and limitations. Hardware acceleration is required for useful performance; the
bundled functional-test Chromium uses SwiftShader, as recorded in milestone two.
