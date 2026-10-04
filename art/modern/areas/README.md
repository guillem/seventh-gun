# Authored areas

Hand-built, light-baked Blender areas placed over the unchanged campaign grid,
in the manner of the authored Foundry opening (`../foundry-room/`). The user's
goal (2026-10-04) is several of these in every campaign map.

## Pipeline

1. Choose whole rooms whose openings lead into 6 m corridor cells. Doors, the
   arena seal and secrets (plates, passages, remote controls) stay runtime
   objects and must lie outside the area.
2. Export the layout (refuses nothing, but records conflicts):

       node tools/modern-art/export_area_layout.mjs <campaignIndex> <areaId> <x0,z0,x1,z1> [...]

3. Author `tools/modern-art/areas/<area>.py` with `tools/modern-art/area_lib.py`
   (exact floor footprint, grid boundary walls, portal closures above 6 m,
   trimming of planes shared with runtime corridors, UVs, Cycles bake, GLB +
   WebP export, manifest). Iterate with `-- --size 1024 --samples 16` (seconds),
   ship with `-- --size 2048 --samples 128` (under a minute on an M5 Pro).
4. Register it in `src/render/authoredAreas.ts` (`AUTHORED_AREAS`) with the
   same rects and the manifest's `practicals` (runtime lights at the baked
   fixtures, for actors and doors).

## Rules (tests/unit/authoredAreas.test.ts)

- The floor is exactly the walkable footprint; flat inlays may rise 2 cm.
- Below 4.3 m nothing projects more than 0.18 m from a solid boundary.
- Material names are `area.<specimen>[.<variant>]`; the runtime binds the
  shared generated surface images by specimen (`bone` → limestone, `floor` →
  entrance floor, `lamp.*` keep their emission).
- Layout, rects and practicals must match the registry and the current grid.

## Runtime

Area files live under `public/modern/areas/<id>/` and are never in the boot
pack. A campaign start from the UI awaits the map's areas inside the existing
world-loading screen and prefetches the next map's. Until an area is loaded
(the synchronous debug `startCampaign`, or a failed download) its cells are
drawn by the runtime room grammar. Area materials scale the map's ambient and
hemisphere light by 0.4 so the bake is not lit twice; their practicals take
priority within the map's 12 stationary lights.

## Areas

Twenty lazily loaded areas, plus the original Foundry opening in the boot
pack: every campaign map's start room (the Foundry's is the opening), one
signature hall and its arena. 13,666,898 bytes in total, meshopt-compressed GLBs
plus WebP lightmaps; a map downloads only its own (1.1–2.9 MB) when it starts,
and prefetches the next map's during play.

| Area | Map | Cells | GLB | Lightmap | Design |
| --- | --- | --- | --- | --- | --- |
| foundry-arena | 01-foundry | 195 | 427,512 | 504,036 | Pour hall 03: clerestory trusses, gantry crane with glowing ladle, molten trough |
| foundry-spur | 01-foundry | 72 | 153,464 | 67,820 | Pattern shop 02: exposed beams, cantilevered control booth, racks and lockers |
| gullet-arena | 02-gullet | 168 | 721,308 | 502,808 | Ribbed visceral vault, suspended heart, east oculus, jaw over the seal |
| gullet-crop | 02-gullet | 143 | 776,120 | 331,280 | The crop: lumpy stomach dome, muscle bands, digestive sac clusters, acid pools |
| gullet-start | 02-gullet | 42 | 426,660 | 136,490 | The throat: cartilage-ringed vault closing on a glowing sphincter |
| catacombs-arena | 03-catacombs | 169 | 599,508 | 298,110 | Necropolis: gothic rib vault, loculi, lancets, statues, gibbet cages |
| catacombs-crossing | 03-catacombs | 144 | 491,672 | 280,174 | Domed crossing: great arches, pendentives, oculus dome, iron corona |
| catacombs-start | 03-catacombs | 42 | 934,756 | 114,010 | Ossuary chapel: pointed vault, skull-lined walls, candle retable |
| pit-arena | 04-pit | 168 | 175,800 | 425,952 | Open stope: rock dome breached to daylight, scaffolds, hoist gear |
| pit-gallery | 04-pit | 126 | 206,644 | 342,266 | Ore mill: steel frames, ore conveyor, hoppers, catwalk, floodlights |
| pit-start | 04-pit | 42 | 117,332 | 47,210 | Adit 4: timber sets, lagged roof, lanterns, rails |
| spire-arena | 05-spire | 168 | 257,064 | 411,380 | The lantern: stepped stages, tall gold windows, sun-disc ceiling |
| spire-nave | 05-spire | 126 | 337,316 | 590,664 | Basilica nave: coffered vault, gold clerestory, apse, bronze lamps |
| spire-start | 05-spire | 42 | 213,900 | 99,670 | Vestibule: coffered gilt ceiling, fluted pilasters, bronze reliefs |
| ward-arena | 06-ward | 270 | 197,852 | 199,366 | Theatre one: observation tiers, surgical lamp array, clean-air canopy |
| ward-atrium | 06-ward | 196 | 183,272 | 258,582 | Galleried atrium: three balcony levels under a glazed lantern |
| ward-start | 06-ward | 49 | 130,384 | 98,082 | Decontamination: luminous ceiling grid, showers, glazed partitions |
| sanctum-arena | 07-sanctum | 224 | 420,424 | 551,290 | The core: suspended reactor core in a gimbal cage, radial gantries |
| sanctum-chamber | 07-sanctum | 286 | 541,740 | 548,216 | Reactor hall: containment rings around a glowing conduit |
| sanctum-start | 07-sanctum | 42 | 378,324 | 168,440 | Airlock: shield fins, concentric ceiling iris |

Captures (actual game frames): `<id>/capture-{corner,up,back}.png`, from
`node tools/modern-art/capture_areas.mjs <baseURL> [idRegex]`. Final bakes:
`tools/modern-art/bake_areas.sh [scriptRegex]` (about 9 minutes for all 20 on
an M5 Pro), then `node tools/modern-art/register_areas.mjs` (the bake script
runs it) regenerates `src/render/authoredAreaList.ts`.
