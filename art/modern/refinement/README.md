# Review-driven art refinement

Implemented on `codex/experimental-modern-art` in draft PR #32. The playable
review is <https://deploy-preview-32--seventh-gun.netlify.app/>. This is an
experiment; it must not be merged, released or deployed to production.

The changes address the user's column-base artifacts, whole-gun disappearance,
simple creatures and overly bright warehouse. [The implementation
record](../../../docs/ART-REFINEMENT.md) explains the causes and corrections.

## Review evidence

- Open [compare.html](compare.html) for a slider comparison against the previous
  actual-game review. The same cameras are used; AI is frozen with the existing
  debug API. These images are not performance measurements.
- [Stability diagnosis](../roster/stability-after/README.md) preserves the
  AO/shadow controls and normal-rendering weapon fragment-query reports.
- [Foundry lighting](foundry-lighting.md) records the offline bake and fixture
  placement. Early contrast measurements retain their original capture context.
- [Creature review](enemies/README.md) distinguishes offline studio renders
  from the actual gameplay views in `husk-review/` and `review/`.
- [Hosted asset verification](hosted/assets.json) checks all 96 runtime files:
  31,631,152 bytes, exact SHA-256 matches, no missing resources at implementation
  commit `8cffc14`.

## Editable source and material provenance

The six creature sources remain in `../roster/enemies/*.blend`, seven weapon
sources in `../roster/weapons/*.blend`, and Foundry source in
`../foundry-room/foundry.blend`. Their authoring scripts live under
`tools/modern-art/`; manifests record runtime outputs and model budgets.

Four original skin/tissue/chitin/bone images were created with the built-in
imagegen tool. [Exact prompts](materials/prompts.json), untouched PNG originals,
dimensions, WebP encodings and checksums are preserved in `materials/`.
Eight separate data maps were baked in local Blender from the editable
`materials/creature-material-specimens.blend`. They are illustrative albedo and
independently authored relief/roughness, not physically measured material scans.

The geometry, maps and animations are saved assets loaded by the existing
Three.js renderer. No new runtime dependency, paid asset or generation-service
request was added. Simulation, map layouts, balance and network code remain
unchanged. The final aggregate test and profiling record is in
[docs/STATUS.md](../../../docs/STATUS.md).
