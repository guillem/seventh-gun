# Saved pickup props and arena marine

Locally authored in Blender 5.2.2 on 2026-10-03. `support.blend` retains the
editable object hierarchy, five-material marine armature, vertex groups and UVs.
`tools/modern-art/build_support.py` reproduces it and the optimized GLB. Runtime
code clones the saved meshes, applies gameplay colors and animates the existing
remote-player pivots; there is no runtime geometry generation for these models.

The pack contains `medikit`, `ammo`, `key`, `powerup`, `pedestal` and `marine`.
Pickups have three or four material meshes each. The marine is five skinned
meshes, keeping rendering cost independent of its limb/detail count. Dimensions
and mesh budgets are recorded in `manifest.json`.

The emergency kit is a molded hard case with latches, bumpers, carry handle and
a green first-aid emblem. The ammunition crate has a weather seal, folded bails,
reinforcing ribs and a tintable identification strip. The key retains its golden
bow, teeth and bone credential. Powerups share an armored glowing ampoule with
tintable contents. Saved weapon pickups rest on a machined dispenser pedestal.

The marine has a formed helmet and visor, cheek respirator, chest harness,
contoured cuirass, utility pouches, back filters, shoulder caps, articulated
fabric limbs, armor plates, gloves and treaded boots. A compact service carbine
is rigidly bound to the right elbow. The neutral silhouette is 1.886 m tall and
1.038 m wide, inside the existing player height and radius. It retains the ten
player palette assignments and dynamic name/health labels.

## Skinning and animation contract

The model's bone axes and local positions match the previous render rig:
`torso`, `head`, `arm_r/l`, `elbow_r/l`, `leg_r/l`, `knee_r/l`. The existing
position-derived walk cycle and death animation drive these joints unchanged.
Player movement, hit volumes, networking, line-of-sight checks and nameplate
occlusion are unchanged. Respawn also restores the shoulder splay after a death
pose, fixing the old pose's permanently outstretched arms.

All meshes use normalized rigid skin weights. Material slots are `marine.team`,
`marine.steel`, `marine.fabric`, `marine.dark`, `marine.visor`. Team and visor
colors are applied to cloned materials; source skeletons and materials remain
shared-cache references only until cloning. Per-instance skeleton disposal is
handled by the existing owned-resource disposal helper.

The loader attaches the shared saved generated material images. Decorative
constant materials (`support.gold`, `support.bone`, `support.medicalCross`) keep
their authored tints. Dynamic labels and soft contact shadows remain rendering
UI/effects. The studio preview is an asset inspection render, not gameplay.

## Rebuild and validation

```sh
/opt/homebrew/bin/blender --background --factory-startup --threads 4 \
  --python tools/modern-art/build_support.py
node node_modules/vitest/vitest.mjs run tests/unit/supportRoster.test.ts
```

The tests load the real GLB and verify material-mesh budgets, UVs, marine bounds,
normalized skin weights and joint positions. They instantiate the actual pickup
and arena renderers to verify tinting, movement, death/respawn, label placement,
wall occlusion, and disposal without touching the cached source skeleton.
