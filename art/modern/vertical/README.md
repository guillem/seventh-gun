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
  draw calls by 28–71% in the review views. Chrome and Playwright WebKit both
  expose `WEBGL_multi_draw`.
- Wall sections above 6 m also get an outward-facing skin, so a raised room
  seen from a courtyard (over its 6 m walls) reads as a solid mass.
- Relief and luminaires skip any wall face carrying a remote secret control
  (lever or shootable sigil). The old modulo layout covered such a control in
  Catacombs, Pit and Sanctum; the rollout fixes those.
- The Ward's ceilings use its ceramic finish instead of dark alloy, which read
  as a black void in tall rooms (this also lightens Ward corridor ceilings).

## New saved art

`tools/modern-art/build_environment_kit.py` adds four modules for each of the
seven identities (28 total, about 7k triangles): `course`, `upper` (stretched
in Y to the band height, so built from prismatic vertical members), `span` (a
2 m overhead tile) and `hang` (at most 3.2 m deep; only in rooms ≥ 8 m).
Nothing new reaches below 4.3 m. `kit.glb` grows from 674,204 to 1,072,032
bytes; the runtime pack is now 92 files / 28,653,356 bytes
(`../roster/runtime-manifest.json`, pack label `vertical-01`).

## Evidence

`node tools/modern-art/capture_vertical_pilot.mjs <baseURL> <before|after>`
captures nineteen fixed debug-camera views (optional fifth argument: a name
regex) in installed Chrome (ANGLE Metal, Apple
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
| foundry-arena | 441 → 217 | 559,745 → 595,673 | `ee306bc5` |
| foundry-spur | 770 → 306 | 718,811 → 781,299 | `ee306bc5` |
| catacombs-crossing | 590 → 208 | 661,613 → 681,685 | `cd52d505` |
| catacombs-arena | 363 → 217 | 616,689 → 634,513 | `cd52d505` |
| pit-gallery | 1001 → 315 | 875,039 → 946,019 | `ad63b245` |
| pit-arena | 274 → 166 | 548,695 → 536,939 | `ad63b245` |
| pit-courtyard | 543 → 187 | 633,431 → 633,515 | `ad63b245` |
| spire-nave | 222 → 160 | 402,089 → 416,401 | `6b5d8de5` |
| spire-arena | 904 → 382 | 1,031,547 → 1,236,387 | `6b5d8de5` |
| ward-atrium | 958 → 282 | 692,559 → 786,575 | `a5572565` |
| ward-arena | 408 → 250 | 826,003 → 838,123 | `a5572565` |
| sanctum-chamber | 681 → 275 | 823,535 → 828,515 | `ddb9ca05` |
| sanctum-shaft | 921 → 373 | 1,093,447 → 1,135,963 | `ddb9ca05` |

Grid hashes are identical before and after for every map. Triangles change by
−14% to +9%, except the Spire arena (+20%) and Ward atrium (+14%), where the
tall-room set adds the most geometry. `tests/unit/roomVolumes.test.ts` pins
the 1984/1986 seed hashes, checks no campaign or maze map is mutated, keeps
the authored Foundry rooms at their saved height, keeps overhead pieces out of
the combat volume and keeps dressing off remote secret controls.

## Known limits

- Real-time lighting only outside the Foundry hall: tall rooms are
  Foundry-like, not Foundry-equal, since that hall also has a baked lightmap.
- One relief and one upper module per identity, so bays are regular. Module
  variants are the next step for repetition.
- Raised rooms seen from a courtyard (Pit, some seeds) are plain blocks above
  the courtyard wall line; they have no cornice or roof detail.

