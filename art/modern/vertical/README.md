# Room vertical grammar — pilot (Gullet + seeded mazes)

Started 2026-10-04 after the user's review: the authored Foundry opening felt
right because of its vertical space and non-repeating detail, while the other
campaign maps and every seeded maze kept low, flat 6 m ceilings with kit
pieces placed every Nth grid cell. This pilot brings that treatment to the
Gullet and to seeded mazes **without moving a wall**. The other five
campaign maps and the Foundry are unchanged until the pilot is reviewed.

## What changed (presentation only)

- `src/render/roomVolumes.ts` gives each ordinary indoor room a ceiling height
  from its size and kind: 7.5–8.5 m for small rooms, up to 14 m for the arena.
  Corridors, doors, secret cells, secret rooms and outdoor rooms keep 6 m. The
  low-to-tall contrast at each room mouth is deliberate.
- Seeded mazes map each room's existing generator theme to an art identity
  (industrial → Foundry/Pit, organic → Gullet, stone → Catacombs/Spire,
  tech → Sanctum/Ward), so one maze mixes looks instead of being all Foundry.
- Every variation comes from a render-local FNV hash of the map seed and room
  id. Nothing reads or advances simulation RNG; `GEN_VERSION` is unchanged.
- `world.ts` builds per-cell ceilings, walls up to each cell's ceiling, and a
  header strip above any opening into a taller room.
- Wall dressing is laid out per straight wall run (centred, symmetric bays,
  evenly spaced luminaires) instead of `coordinate % interval`.
- Tall walls get a string course at 6 m, an upper order (wider bay than the
  wall below) and the crown at the ceiling. Tall rooms get overhead members
  across the short axis and suspended pieces between them.
- Suspended pieces are the practical-light positions in tall rooms, so the
  ceiling and upper walls are lit by something visible. The 12-light budget
  and the once-per-map stationary lighting are unchanged.
- The grammar's dressing renders as one `BatchedMesh` per identity × material
  for the whole map (per-instance frustum culling, WEBGL_multi_draw), cutting
  draw calls by 42–58% in the review views. Chrome and Playwright WebKit both
  expose `WEBGL_multi_draw`.
- Wall sections above 6 m also get an outward-facing skin, so a raised room
  seen from a courtyard (over its 6 m walls) reads as a solid mass.
- Relief and luminaires skip any wall face carrying a remote secret control
  (lever or shootable sigil). The old modulo layout covers such a control in
  Catacombs, Pit and Sanctum; those maps are unchanged until rolled over.

## New saved art

`tools/modern-art/build_environment_kit.py` adds four modules for each of the
seven identities (28 total, about 7k triangles): `course`, `upper` (stretched
in Y to the band height, so built from prismatic vertical members), `span` (a
2 m overhead tile) and `hang` (at most 3.2 m deep; only in rooms ≥ 8 m).
Nothing new reaches below 4.3 m. `kit.glb` grows from 674,204 to 1,072,032
bytes; the runtime pack is now 92 files / 28,653,356 bytes
(`../roster/runtime-manifest.json`, pack label `vertical-pilot-01`).

## Evidence

`node tools/modern-art/capture_vertical_pilot.mjs <baseURL> <before|after>`
captures six fixed debug-camera views in installed Chrome (ANGLE Metal, Apple
M5 Pro, 1280×800) and counts GPU submissions per frame, including multi-draw.
`before-*` is `f80adad` (branch head before the pilot); `after-*` is this
change. They are actual game frames, not concept renders.

| View | Draws/frame | Triangles/frame | Grid hash |
| --- | --- | --- | --- |
| gullet-hall | 302 → 144 | 523,677 → 503,877 | `a31305c5` |
| gullet-hall-up | 218 → 94 | 310,809 → 266,001 | `a31305c5` |
| gullet-arena | 332 → 182 | 641,879 → 645,111 | `a31305c5` |
| seed-1984-catacombs | 619 → 259 | 728,599 → 731,955 | `62624244` |
| seed-1984-ward | 832 → 486 | 1,190,451 → 1,171,915 | `62624244` |
| seed-1986-spire | 1387 → 617 | 1,213,003 → 1,271,059 | `8f50b164` |
