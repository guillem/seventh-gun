# Complete experimental art pass

Approved 2026-10-03. All work stays on `codex/experimental-modern-art`, draft
PR #32 and Netlify Deploy Preview. No production deployment or release.

## Implemented deliverables

1. Seven distinct saved Blender weapons with fitted articulated-looking gloves,
   material separation, visible mechanisms and authored idle/fire/equip clips.
2. Six species with saved skinned Blender meshes and idle/walk/attack/hit/death
   clips. Animation follows simulation timing and never drives collision motion.
3. Distinct saved architectural modules and generated materials for Foundry,
   Gullet, Catacombs, Pit, Spire, Ward and Sanctum. Existing authored Foundry
   geometry remains; other rooms retain the exact original floor grid.
4. Saved particle/flash imagery, more restrained combat presentation, recorded
   sound designs for the remaining weapons and creature voices.
5. Asset-loading recovery, clone ownership and animation disposal checks;
   all-roster/all-campaign visual inspection, functional regressions, hardware
   performance measurements and hosted preview verification.

## Invariants

No changes to sim, weapon balance, enemy definitions, map layout, secrets,
generation versions or network protocol. Low wall details remain within 0.2m
of walls; large scenery stays above combat height. Preserve player sight lines,
weapon aim, enemy identity/attack tells, pickup readability and touch controls.

The editable sources are original Blender authoring. Runtime geometry and
animation load saved files rather than constructing the roster at runtime.
Generated texture images are illustrative base colors, not measured material
scans. Offline sample editing reuses the original generated recordings with
documented filters; it is not a new performance by a recorded human actor.

## Validation and handoff

Use Node 24 for unit tests, all three TypeScript projects, production build,
the full desktop/mobile Playwright suite, and installed hardware Chrome for
normal-mode profiling. Capture actual gameplay separately from source renders.
Document payload size, tested viewpoints, simulation hashes and real-device
limitations. Preserve previous milestone evidence for comparison.


## Current delivery

All five work streams are implemented. See `art/modern/roster/README.md` for
source and evidence links; `docs/STATUS.md` holds the final validation and
preview commit. Review stays on draft PR #32. The original Foundry bake is
retained; the other environments use saved modules and real-time lighting.
