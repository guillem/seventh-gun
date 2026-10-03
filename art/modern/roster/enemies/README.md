# Saved enemy roster

Six original Blender assets replace the complete enemy roster in the experimental
art pack. The old `art/modern/husk.blend` remains a record of the first milestone.
No simulation, hit volume, damage, projectile cadence, movement speed, map or
network code changes are required by this pack.

| Species | Visual construction | Deformation |
| --- | --- | --- |
| Husk | Wasted continuous torso, torn flank, partial exposed ribs, gaunt flesh face with a collapsed cheek, asymmetrical arms and articulated claws | Weighted spine, jaw, three-joint arms and legs |
| Crawler | Overlapping pointed dorsal scutes, six recessed eyes, curved serrated chelicerae and six articulated legs with exposed joint membranes | Spine, jaw and twelve leg bones |
| Slab | Hunched plated chest, carved single eye slit, exposed sternum, clawed toes and a layered right forearm mortar | Weighted spine and paired limbs; launcher returns to existing muzzle at release |
| Wisp | Distended respiratory sac, ribbed shell, asymmetric gill core, torn lateral webs and five trailing feelers | Floating body, fins and five feeler bones |
| Hierophant | Deeply folded continuous mantle, torn hem, blind vertical face aperture, split crown and three shoulder emitters | Weighted mantle/spine, limbs, jaw and three emitter bones |
| Fiend | Continuous chest and arm muscle groups, torn pectoral breach, elongated canine head, sweeping horns, claws and cloven hooves | Weighted spine, paired limbs, jaw and tail |

Each GLB contains six skinned material meshes: `enemy.skin`, `enemy.raw`,
`enemy.armour`, `enemy.dark`, `enemy.bone` and `eye.{species}`. Texture images
remain shared in the runtime asset cache. Four generated albedos distinguish
necrotic dermis, exposed muscle, keratin and dentine. The corresponding tangent
normals and roughness were baked from independent authored geometric specimens;
they are not inferred from the generated colour images. See
`../../refinement/materials/geometry-bakes.md` for the source and limitations.
Material tint differs by species; eye colour and its attack/pain/death behaviour
retain the existing visual threat cues.

The Blender source meshes use authored muscle masses, section curves and surface
lofts. Heads are fused and carved with actual orbital, facial and respiratory
cavities. Overlapping soft-tissue parts are consolidated with an offline voxel
remesh, carved for torn areas, relaxed and reduced to a 10,500-triangle dermal
budget. Authored bone weights are
transferred back onto that surface; the GLB runtime never creates or remeshes
anatomy. Physical half-metre box-projected UVs keep surface texture density
consistent between large muscles and small anatomical pieces. Final totals
remain below 32,000 triangles and are recorded in `manifest.json`.

Detailed head surfaces retain their local sculpt topology after the body remesh.
Husk attachment and cavity discoloration is authored into the rendered `COLOR_0`
vertex channel, including the overall tissue tint. It requires vertex colours to
remain enabled on `enemy.skin`; the loader should not apply another overall tint.
The husk head is drawn back toward its chest and connected by substantial neck
tissue. Its head pivot follows that visual change while the muzzle marker stays
at its original simulation coordinate.

Five clips are embedded in every file: `idle`, `walk`, `attack`, `hit` and `death`.
The renderer samples those curves from simulation animation phase and state
countdowns. It does not use render frame time to decide when to fire or move.
Attack anticipation returns to the neutral authored muzzle pose at release;
subsequent burst shots use the unchanged burst-gap countdown. Wisp hover retains
`def.hoverY` and `def.hoverBob`, matching its existing hittable volume. Root X/Z
movement and facing remain simulation-owned. Death falls through the exported
skeleton, then uses the existing delayed corpse sink and eye fade.

The original `*-preview.png` files remain historical **offline Blender material
previews**. Current offline previews are `../../refinement/enemies/*-sculpt.png`.
Actual game views are saved separately by the full art review. The `.blend` files
retain relative references to the saved texture sources.

Rebuild with the local four-thread CPU workflow:

```bash
/opt/homebrew/bin/blender --background --factory-startup --threads 4 \
  --python tools/modern-art/build_enemies.py -- --asset all --preview
```

`tests/unit/enemyRoster.test.ts` loads every real GLB and checks normalized skin
weights, draw/triangle budgets, animation coverage, sampled head/foot bounds,
unchanged muzzle markers, neutral attack release, render-FPS independence,
independent cloned skeletons, death/sink/eye state and animation-cache cleanup.
It also checks the actual rendered tissue vertex-colour channel, connected husk
body skin through shoulders/neck/ankles, and the detailed face attachment while
sampling idle, walk and attack. Legacy eye-flare and six-species lifecycle tests
also remain in place.
