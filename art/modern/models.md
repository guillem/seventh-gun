# First experimental model pack

Original models authored locally for Seventh Gun with Blender 5.2.2 LTS. No
downloaded meshes or third-party assets. These are the editable sources and CPU
inspection renders for the first experimental art milestone, not a release pack.

The game loads `public/modern/models/{pistol,husk,architecture}.glb`. Blender and
the authoring script are development tools only. Static details are joined by
material within each articulation group to reduce draw calls; all meshes have
unwrapped UVs and glTF metallic/roughness PBR materials. Materials currently use
constant surface values in the GLB; the game binds separate generated dermal
and titanium base-color textures to named UV-mapped materials during preload.

## Rebuild and inspect

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --threads 4 --python tools/modern-art/build_assets.py -- --preview
node tools/modern-art/inspect_assets.mjs
```

The script saves editable compressed `.blend` sources **before** adding the CPU
preview camera, lights or floor. It exports GLBs, produces optional inspection
renders, and records export sizes in `model-manifest.json`. The Three.js loader
inspection checks the actual exported GLBs and writes `model-inspection.json`.
Use `--asset pistol`, `--asset husk`, or `--asset architecture` for a single asset.
On this Mac the Blender background invocation needs sandbox escalation because
Metal initialization fails under the restricted sandbox. Preview renders use CPU.

## Coordinates and articulation

Game coordinates are Y up. Blender sources use Z up; the export conversion is
already included, so no root rotation should be added when loading the GLBs.

**Pistol:** origin at grip top, barrel towards -Z. Named `weapon` group excludes
the `hands` group, which contains `hand_l` and `hand_r`. `slide` and `trigger`
nodes can be articulated. `muzzle` is exactly `(0, 0.055, -0.376)`. The pistol
includes machined receiver profiles, bevels, chamber/ejection port, slide
serrations, safety controls, sight inserts, accessory rail, geometric engraving,
leather gloves, stitching and sleeves. The existing viewmodel holder can frame it.

**Husk:** origin at feet, facing +Z, no gameplay dimensions changed. Main nodes:
`body`, `head`, `jaw`, `arm_l`, `arm_r`, `leg_l`, `leg_r`; each arm also contains
`forearm_l` / `forearm_r`. `eye_l` and `eye_r` remain distinct meshes. `mouth`
world position is `(0.09, 1.668, 0.533)`, within 0.004 units of the existing
projectile source. Main limb pivots have neutral rest rotation; asymmetry is in
their child geometry. Existing runtime locomotion, windup, pain and death timing
drives those nodes. **There are no baked skeletal or animation clips in this
milestone.** The model is a jointed rigid mesh assembly with an organic torso,
ribs, implants, cable tendons and long fingers, not a production skinned character.

**Architecture:** select these named parent groups, including their local
transforms, before instancing:

| Node | Placement / approximate bounds |
| --- | --- |
| `wall_rib` | Floor origin, height 4m, width 0.38m, depth about 0.17m into +Z. |
| `wall_fixture` | Centered horizontally; 1.13m long, shallow +Z projection. |
| `pipe_run` | 2m horizontal run along X, centered; shallow +Z projection. |
| `service_panel` | Floor origin, 0.65m × 1.1m enclosure, projects 0.23m into +Z. |
| `floor_grille` | Centered at floor plane, approximately 0.91m square. |

Preserve each module's child hierarchy when collecting geometry for instancing;
use the full relative matrix, because module rotations and scale are authored.

The repeated architecture kit is limited to **5,032 triangles / 306,548 bytes**
across all five modules. Its couplers use sixteen radial segments and four tube
segments; pipes use twelve sides; bevels use a single chamfer. This removes 84.7%
of the first export's triangles while preserving module bounds and transforms.
The higher-detail pistol and husk tessellation is unaffected.

## Remaining art work

This pack proves external model loading and runtime articulation for one weapon
and one enemy. Production skinning, bespoke motion, bespoke normal/roughness maps,
more natural hand anatomy, additional weapon/enemy families and LODs remain part
of later art passes. The first inspection renders should not be described as
finished photorealistic characters.
