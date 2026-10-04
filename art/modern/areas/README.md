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

| Area | Map | Cells | GLB | Lightmap | Notes |
| --- | --- | --- | --- | --- | --- |
| gullet-arena | 02 Gullet | 168 | 3,246,768 B | 463,448 B | Ribbed visceral vault to 20.5 m, suspended heart, east oculus, jaw over the seal |

Captures: `../vertical/after-gullet-arena*.png`.
