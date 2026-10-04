# Campaign environment kit

Original Blender assemblies authored for this experiment. `environment-kit.blend`
is editable; `public/modern/roster/environment/kit.glb` is the runtime export.
The authoring script is `tools/modern-art/build_environment_kit.py`. No purchased
assets, downloaded models, or copied levels are included.

The kit supplies 56 named assemblies. For each campaign identity: a wall
relief, luminaire, overhead crown and continuous plinth/course trim, plus a
tall-room set used by the room vertical grammar (`../../vertical/README.md`):
a 6 m string course, an upper order stretched to the wall height, a 2 m
overhead span tile and a suspended piece (at most 3.2 m deep).
Foundry uses riveted structure and process
pipes; Gullet uses organic costal folds and ossified vaults; Catacombs uses blind
stone arches and burial niches; Pit uses mine shoring and hoist rails; Spire uses
fluted masonry and stepped cornices; Ward uses ceramic instrument cabinets and
filtered air units; Sanctum uses radiation fins and enclosed energy columns.

Runtime surface specimens are generated images bound by material name. Existing
Blender-baked concrete/steel normal maps supply subtle detail. These assemblies
are not lightmapped: they use the game's real-time lights, environment lighting,
and gentle instance colour from the unchanged map light positions. The original
Foundry first encounter retains its separate authored geometry and light bake.

The final readability pass separates Gullet's organic walls from a neutral
containment ceiling and worn floor, and uses charcoal-tinted limestone for the
Catacomb bodies/carved details so their shapes remain legible in low light.
Original basalt remains available to the mining environment. Light lenses have
restrained emission. Continuous floor coves, plinths, service bands and upper
courses ground the seven room types without adding collision obstacles.
Outdoor views use the saved generated overcast equirectangular sky image,
slightly dimmed; there is no runtime weather or procedural sky replacement.

Every module faces local +Z into a room. Low relief is at most 0.18 m deep and
confined to its two-metre wall cell; overhead volumes start above 4.3 m. Mounts
occur only along solid/walkable grid boundaries. Indoor modern ceilings use the
existing six-metre wall height, except rooms raised by the room vertical grammar. No collision, door, enemy, or simulation data is
modified. Sixteen-metre instance batches share geometry and remain frustum
cullable. Wall/floor textures use continuous four-metre UVs across grid cells.

Regenerate with:

```sh
/opt/homebrew/bin/blender --background --factory-startup --threads 4 --python tools/modern-art/build_environment_kit.py
```

`manifest.json` records the exact module mesh/triangle counts and export size.
`tests/unit/campaignEnvironment.test.ts` loads the real GLB and validates mesh
clearance, overhead height, wall placement, all-seven-map coverage, immutable
maps, Foundry exclusion and cullable batch extents.
