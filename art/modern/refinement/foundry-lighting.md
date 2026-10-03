# Foundry lighting and surface stability refinement

This pass responds to the warehouse looking uniformly bright and clinical and
to black, camera-dependent patterns around its column bases. Original review
evidence remains in `art/modern/roster/review/` and the isolation captures in
`art/modern/roster/stability-before/`; neither set is overwritten.

The editable source remains `art/modern/foundry-room/foundry.blend`, with the
authoring recipe in `tools/modern-art/build_foundry.py`. The exact 370-cell floor
and the original simulation/doors are unchanged.

## Baked illumination

Seven continuous cool skylight bays were replaced by three short, selected
openings centred at world X 41, 71 and 100, Z 80.8. Each opening is 3.2 metres
long. The intermediate bays are physically closed with roof geometry, producing
dark ceiling and gallery zones. These three area sources use 1400, 1050 and
850 watts in Blender, versus seven 2600-watt sources previously.

Four visible suspended high-bay fixtures at (46,85.5), (61,89), (76,85.5), and
(91,89) illuminate distinct warm pools along the route. Their lenses sit around
Y 8.56m; each baked area light is 430 watts and aims almost vertically down.
Wall sconces use warmer, narrower 180-watt pools. World strength is 0.012 and the
hall concrete diffuse bounce reflectance is approximately 0.13, preserving
shadow under galleries and around overhead machinery. Emissive lenses are
restrained, and haze now follows only the actual selected skylights.

Runtime concrete tint and environment reflection strength are reduced. The hall
floor now uses the existing generated worn-concrete slab image with zero
metalness and 0.93 roughness, replacing reflective checkerplate. This removes
the broad reflected wash that previously disguised differences between the
local light pools. Original generated texture files remain unchanged.

The final lightmap is a 2048px, 128-sample Cycles CPU direct-plus-indirect bake.
Its established explicit sRGB encoding of linear irradiance/8 is unchanged.
`art/modern/foundry-room/manifest.json` records all source positions, targets,
colours, sizes and powers. Those Blender watts are authoring values, not claimed
to equal the renderer's real-time intensity units. Separate fixed practicals
light moving actors and doors. The broad player-facing spotlight fades out
inside the authored bounds; a small 0.35-intensity camera-position fill remains.

Current runtime source uses all seven fixed actor sources together: four warm
pendant spotlights at intensity 180 and three cool roof spotlights at 70, 52.5
and 42.5. They do not move or swap to the nearest fixture as the player walks.
Ambient, hemisphere and environment strengths settle at 0.08, 0.22 and 0.08;
boundary changes fade with damping 7 rather than switching immediately. The
separate weapon pass settles at ambient 0.4, key 1.3 and environment 0.4.
These values describe the current source, not the earlier captures below.

## Coplanar geometry correction

The steel base and concrete pier previously shared their front plane: both
were 1.1m deep. The base is now 1.16m deep, putting its front 3cm ahead while
remaining within 0.18m of the original wall boundary. Foundation curbs now have
3cm separation instead of a 5mm offset. The central chamber's lowest flange
also previously shared the body's Y=8.3m cap; its lower lip now starts at 8.27m.
These are geometric fixes, not changes to post-processing or shadow bias.

`tests/unit/foundry.test.ts` loads the actual GLB and verifies the pier/base and
chamber/flange separations, unchanged floor footprint, door motion envelope,
atlas UVs and absence of new low collision obstacles. All four focused checks
passed after the final export.

Reproduce the bake:

```sh
/opt/homebrew/bin/blender --background --factory-startup --threads 4 --python tools/modern-art/build_foundry.py -- --size 2048 --samples 128
```

Capture current actual-client views (camera and AI freeze through the existing
debug API; no image compositing or replacement renderer):

```sh
node tools/modern-art/inspect_foundry_refinement.mjs http://127.0.0.1:5176 art/modern/refinement/lighting
```

These captures are visual inspection, not a performance measurement. Portrait
uses touch emulation on the desktop GPU and is not a physical-phone test.

## Actual gameplay comparison

Six error-free views were saved in `lighting/` at 07:14 UTC on 2026-10-03:
entrance and casting hall on desktop/portrait, plus the warm-pool and
side-gallery desktop views. They preserve the first completed lighting/material
comparison and predate the final fixed-seven actor-light arrangement, boundary
fade, weapon-light adjustment and subsequent creature refinements. They are
not a capture of the final working tree. The hall
view uses exactly the old review camera: world (41,87), yaw -90, pitch -8.
Compare `lighting/hall-desktop.png` with
`../roster/review/campaign-1-foundry.jpg`.

The new view has shadowed ceiling and gallery undersides, separated warm sconce
pools, a readable warm floor route, and selected cooler roof accents. This is a
change in where light is concentrated, not only a lower exposure: the fixed
ceiling-region median display luminance in that capture is 0.35 times the floor route's
median, versus 1.09 previously. The sampled wall area near a sconce is 1.28 times
its neighbouring wall region, versus 1.03 previously. The retained regions and
raw values are in `lighting/contrast-inspection.json`; these are screen RGB
proxies, not calibrated illumination readings or an isolated bake experiment.

The floor, route to the far doorway, pickup label and crosshair remain legible
in both desktop and portrait views. Pier bases and the chamber's lower cap are
clean in these stills; separate camera-motion stability captures cover flicker.
These observations concern the environment only, not final enemy-art approval.
The source/material audit on 2026-10-03 confirmed that the saved bake, concrete
floor binding and geometry corrections above remain present. No new browser
capture or performance measurement was made during that read-only audit.
