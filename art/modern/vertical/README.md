# Room vertical grammar — campaign and seeded mazes

Started 2026-10-04 after the user's review: the authored Foundry opening felt
right because of its vertical space and non-repeating detail, while the other
campaign maps and every seeded maze kept low, flat 6 m ceilings with kit
pieces placed every Nth grid cell. The grammar brings that treatment to the
campaign and to seeded mazes **without moving a wall**. It was piloted on the
Gullet and seeds (`70e8683`), then rolled out to all seven campaign maps at
the user's request the same day. In the Foundry, the start room and casting
hall stay as the authored Blender scene; the grammar covers its other rooms.
Arena and shared `#m=` maps keep the previous look.

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
  draw calls by 24–67% in the review views. Chrome and Playwright WebKit both
  expose `WEBGL_multi_draw`.
- Wall sections above 6 m also get an outward-facing skin, so a raised room
  seen from a courtyard (over its 6 m walls) reads as a solid mass.
- Relief and luminaires skip any wall face carrying a remote secret control
  (lever or shootable sigil). The old modulo layout covered such a control in
  Catacombs, Pit and Sanctum; the rollout fixes those.
- The Ward's ceilings use its ceramic finish instead of dark alloy, which read
  as a black void in tall rooms (this also lightens Ward corridor ceilings).

## Doors, variants and copings (second pass, 2026-10-04)

The user reported doors as too short with a gap on top: modern corridors are
6 m but the original slab is 4.32 m, which left a 1.7 m slot showing the room
beyond. Each identity now has a `doorhead` (jambs within the 0.18 m wall
clearance; a housing from 4.2 to 6 m, deeper than the slab) and a `doorleaf`
parented to the moving slab. A status lens is red on locked doors and takes
the identity's luminaire colour otherwise. Slabs and leaves are clipped at the
6 m ceiling, so a rising door never shows above a roofline. Secret plates get
a plain wall-material head instead of a frame, so nothing announces them. The
arena seal keeps its 4.2 m barrier under a doorhead. The authored Foundry
entrance door keeps its own frame and hardware. Door slabs are less metallic
(they read as black voids). `relief2` / `upper2` variants alternate
symmetrically about each wall run's centre, and raised walls seen from
outside are capped with an outward string course at the roofline.

## New saved art

`tools/modern-art/build_environment_kit.py` adds four modules for each of the
seven identities (28 total, about 7k triangles): `course`, `upper` (stretched
in Y to the band height, so built from prismatic vertical members), `span` (a
2 m overhead tile) and `hang` (at most 3.2 m deep; only in rooms ≥ 8 m).
Nothing new reaches below 4.3 m. `kit.glb` grows from 674,204 to 1,072,032
bytes in the first pass. The second pass adds 28 door and variant modules
(84 in total); the kit is now 1,817,548 bytes and the runtime pack 92 files /
29,398,872 bytes (`../roster/runtime-manifest.json`, pack label `vertical-02`).

## Evidence

`node tools/modern-art/capture_vertical_pilot.mjs <baseURL> <before|after>`
captures nineteen fixed debug-camera views (optional fifth argument: a name
regex) in installed Chrome (ANGLE Metal, Apple
M5 Pro, 1280×800) and counts GPU submissions per frame, including multi-draw.
`before-*` is `f80adad` (branch head before the pilot); `after-*` is this
change. They are actual game frames, not concept renders.

| View | Draws/frame | Triangles/frame | Grid hash |
| --- | --- | --- | --- |
| gullet-hall | 302 → 144 | 523,677 → 497,405 | `a31305c5` |
| gullet-hall-up | 218 → 94 | 310,809 → 263,465 | `a31305c5` |
| gullet-arena | 332 → 188 | 641,879 → 634,159 | `a31305c5` |
| seed-1984-catacombs | 619 → 279 | 728,599 → 739,939 | `62624244` |
| seed-1984-ward | 832 → 498 | 1,190,451 → 1,175,867 | `62624244` |
| seed-1986-spire | 1387 → 655 | 1,213,003 → 1,305,755 | `8f50b164` |
| foundry-arena | 441 → 241 | 559,745 → 619,817 | `ee306bc5` |
| foundry-spur | 770 → 332 | 718,811 → 829,331 | `ee306bc5` |
| catacombs-crossing | 590 → 234 | 661,613 → 674,781 | `cd52d505` |
| catacombs-arena | 363 → 223 | 616,689 → 628,129 | `cd52d505` |
| pit-gallery | 1001 → 333 | 875,039 → 953,107 | `ad63b245` |
| pit-arena | 274 → 170 | 548,695 → 538,299 | `ad63b245` |
| pit-courtyard | 543 → 195 | 633,431 → 635,947 | `ad63b245` |
| spire-nave | 222 → 168 | 402,089 → 427,489 | `6b5d8de5` |
| spire-arena | 904 → 412 | 1,031,547 → 1,322,779 | `6b5d8de5` |
| ward-atrium | 958 → 318 | 692,559 → 760,007 | `a5572565` |
| ward-arena | 408 → 262 | 826,003 → 833,659 | `a5572565` |
| sanctum-chamber | 681 → 305 | 823,535 → 826,699 | `ddb9ca05` |
| sanctum-shaft | 921 → 403 | 1,093,447 → 1,128,667 | `ddb9ca05` |

Grid hashes are identical before and after for every map. Triangles change by
−15% to +11%, except the Foundry spur (+15%) and Spire arena (+28%), where the
tall-room set, variants and door assemblies add the most geometry.
`tests/unit/roomVolumes.test.ts` pins the 1984/1986 seed hashes, checks no
campaign or maze map is mutated, keeps the authored Foundry rooms at their
saved height, keeps overhead pieces out of the combat volume, keeps dressing
off remote secret controls and keeps door frames out of the doorway.

## Known limits

- Real-time lighting only outside the Foundry hall: tall rooms are
  Foundry-like, not Foundry-equal, since that hall also has a baked lightmap.
  Hand-built, light-baked areas for every map are the next programme
  (docs/STATUS.md).
- Two relief and two upper constructions per identity; long walls still show
  a regular rhythm.
- Raised rooms seen from a courtyard (Pit, some seeds) are plain blocks above
  the courtyard wall line, capped only by a string course.
