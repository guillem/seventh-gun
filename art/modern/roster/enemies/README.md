# Saved enemy roster

Six original Blender assets replace the complete enemy roster in the experimental
art pack. The old `art/modern/husk.blend` remains a record of the first milestone.
No simulation, hit volume, damage, projectile cadence, movement speed, map or
network code changes are required by this pack.

| Species | Visual construction | Deformation |
| --- | --- | --- |
| Husk | Narrow wasted torso, exposed rib reinforcement, forward skull, one long arm and one arm clutched toward its chest | Weighted spine, jaw, three-joint arms and legs |
| Crawler | Segmented abdomen, overlapping dorsal scutes, four optics, six tapered articulated legs | Spine, jaw and twelve leg bones |
| Slab | Broad plated chest, reinforced knees, single visor and a right forearm mortar | Weighted spine and paired limbs; launcher returns to existing muzzle at release |
| Wisp | Split levitation shell, small face plate, gimbal rings, lateral fins and five trailing sensors | Floating body, fins and five sensor bones |
| Hierophant | Continuous fluted mantle, split crown, mask and three shoulder emitters | Weighted mantle/spine, limbs, jaw and three emitter bones |
| Fiend | Broad forward chest, sweeping horns, digitigrade legs, claws and tail | Weighted spine, paired limbs, jaw and tail |

Each GLB contains five skinned material meshes: `enemy.skin`, `enemy.armour`,
`enemy.dark`, `enemy.bone` and `eye.{species}`. Texture images remain shared in the
runtime asset cache. Tissue uses the saved generated dermal image, armour uses
the generated carapace image, and the hard anatomy uses the saved titanium image.
Material tint differs by species; eye colour and its attack/pain/death behaviour
retain the existing visual threat cues.

The Blender source meshes use authored section curves and surface lofts.
Overlapping soft-tissue parts are consolidated with an offline voxel remesh,
relaxed and reduced to a 7,500-triangle dermal budget. Authored bone weights are
transferred back onto that surface; the GLB runtime never creates or remeshes
anatomy. The final total for each model is recorded in `manifest.json`.

Five clips are embedded in every file: `idle`, `walk`, `attack`, `hit` and `death`.
The renderer samples those curves from simulation animation phase and state
countdowns. It does not use render frame time to decide when to fire or move.
Attack anticipation returns to the neutral authored muzzle pose at release;
subsequent burst shots use the unchanged burst-gap countdown. Wisp hover retains
`def.hoverY` and `def.hoverBob`, matching its existing hittable volume. Root X/Z
movement and facing remain simulation-owned. Death falls through the exported
skeleton, then uses the existing delayed corpse sink and eye fade.

`*-preview.png` are **offline Blender material previews**, not gameplay captures.
Actual game views are saved separately under `../review/` by the full art review.
The `.blend` files retain relative references to the saved texture sources.

Rebuild with the local four-thread CPU workflow:

```bash
/opt/homebrew/bin/blender --background --factory-startup --threads 4 \
  --python tools/modern-art/build_enemies.py -- --asset all --preview
```

`tests/unit/enemyRoster.test.ts` loads every real GLB and checks normalized skin
weights, draw/triangle budgets, animation coverage, sampled head/foot bounds,
unchanged muzzle markers, neutral attack release, render-FPS independence,
independent cloned skeletons, death/sink/eye state and animation-cache cleanup.
Legacy eye-flare and six-species lifecycle tests also remain in place.
