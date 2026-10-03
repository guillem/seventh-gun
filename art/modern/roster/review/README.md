# Actual gameplay visual review

Open `gallery.html` for the complete image gallery, or `report.json` for recorded
camera/player state, resource responses and errors. These are direct Chrome
screenshots of the actual game, not Blender previews or generated concept art.

Final capture on 2026-10-03 includes:

- All seven weapons at 1440 × 900 desktop and 390 × 844 portrait touch layouts.
- One meaningful actual room in each of the seven campaign maps.
- All six enemy species, posed on the actual Sanctum map, with each returned
  species identity verified. The harness fails if the debug API falls back to a
  different species rather than saving a misleading filename.
- The final environment trims/materials, generated outdoor sky, desktop contact
  occlusion, enemy UV/pose refinement and narrower portrait weapon scale.

Installed Chrome used the Apple M5 Pro Metal renderer. No page/console errors or
missing modern asset responses occurred in either context. The entry toast was
allowed to expire normally before each posed capture; no HUD elements were
removed and no image compositing was used.

The evidence uses the existing debug API for camera/weapon/enemy placement and
AI freeze. This fixes DPR1 and disables antialiasing, so it is visual evidence
rather than a performance benchmark. Portrait uses desktop GPU touch emulation,
not a physical phone. Runtime performance is measured separately in normal mode.

## Reproduce

Run an existing dev or preview server, keep runtime source/assets stable during
the capture, then:

```sh
node scripts/inspect-roster.mjs http://127.0.0.1:5175 art/modern/roster/review
```

The run takes approximately a minute, writes 27 direct JPEG captures plus the
report/gallery, and closes Chrome before returning. Changes to the running Vite
client can trigger HMR and correctly fail identity checks; rerun against a stable
build after any final renderer or asset edits.
