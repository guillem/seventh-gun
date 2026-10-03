# User review refinement — 2026-10-03

All work remains on `codex/experimental-modern-art`, draft PR #32 and Netlify
Deploy Preview. No merge, tag, release or production deployment.

The user reported moving black patterns at Foundry column bases, intermittent
weapon flicker, overly simple creature models/materials, and warehouse lighting
that feels bright and clinical. The target is stable rendering, more convincing
organic creatures, and selective industrial light with readable combat. No
flashlight, layout, simulation, difficulty or weapon-balance changes.

## Changes

The black column-base patches survived independent AO/shadow-off controls. Their
cause was coplanar steel and concrete faces. The exported geometry now separates
them by 3 cm within the existing collision clearance; the overhead chamber's
coincident lower cap is separated too. Contact shading remains enabled.

GPU fragment queries reproduced ten blank weapon frames at the start of equip
animations. The old clips dipped the entire gun outside the view. All seven now
use a smaller dip and tilt while retaining their 450 ms duration. Desktop and
portrait checks observe no blank weapon frames across 2,679 sampled frames.
Two smaller Spiker/Sunlance surface overlaps were also corrected. Actual-GLB
regressions cover coplanar triangles and projected equip visibility.

The Foundry replaces seven long skylights with three short roof openings and
four visible warm pendants. Its saved 2048px lightmap was rebaked, global fill
and reflections reduced, and the floor changed to worn matte concrete. Seven
fixed runtime fixtures illuminate moving objects; lighting and weapon fill
fade across the authored room boundary. Gameplay remains readable without a
flashlight. Other campaign lighting is unchanged.

All six creatures now use more developed saved Blender anatomy: fused body
surfaces, carved cavities, claws, torn tissue and more distinct heads. The husk
has a recessed face, exposed ribs, varied tissue colour and connected neck and
limb silhouettes. The wisp has a vented core, the hierophant a blind vertical
opening, and the fiend a projecting canine skull. The existing rigs, five
animation clips, simulation volumes and projectile origins are preserved.

Four generated albedo images distinguish skin, exposed tissue, chitin and bone.
Eight additional normal/roughness maps are baked from editable Blender surface
specimens. Data maps use linear colour space; clones share the saved textures.

## Evidence and limits

- [Stability diagnosis](../art/modern/roster/stability-after/README.md): controls,
  causes, motion captures and weapon fragment counts.
- [Lighting record](../art/modern/refinement/foundry-lighting.md): bake sources,
  fixed camera views and comparison limits.
- [Interactive comparison](../art/modern/refinement/compare.html): old and new
  actual-game captures at the same camera positions.
- [Creature sources](../art/modern/roster/enemies/README.md): geometry, rigs,
  export contracts and local rebuild commands.

This remains a stylized real-time art experiment, not photorealism matching the
menu illustration. The fixed practical lights are unshadowed and also add direct
light to baked surfaces, so some light bleeding remains possible. Surface maps
are original illustrations and authored relief, not registered material scans.
Portrait browser emulation does not establish physical-phone performance.
Aggregate regression and hosted checks are recorded in `docs/STATUS.md` and
`art/modern/refinement/validation.json`: 393 unit tests, 107 applicable browser
checks, all 96 hosted asset hashes, 27 actual-game views and 18 normal-mode
hardware scenarios. The GitHub browser job then exceeded its time limit on
SwiftShader; that was fixed later by running CI E2E on llvmpipe (TESTING.md).

New generated originals and exact prompts are under
`art/modern/refinement/materials/`. They are illustrative albedo surfaces, not
measured scans. Any added normal/roughness maps are authored offline in Blender.
Evidence and limitations are recorded in `docs/STATUS.md`.
