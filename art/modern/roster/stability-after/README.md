# Rendering stability diagnosis and correction

User report: black moving geometric patches at Foundry column bases and brief
whole-gun disappearance. All changes remain on the experimental branch.

## Static surface patches

`../stability-before/` preserves two camera positions with contact shading and
shadow maps independently disabled. The patches survive both controls. The
saved Foundry pier base and concrete pier had coincident front faces; the
central pressure chamber cap also coincided with its lower flange. The source
was corrected with 3 cm separation while retaining the existing shallow wall
clearance. The eight images here show the corrected scene under the same
isolation modes. Contact shading remains enabled in normal desktop rendering.

Two smaller weapon coincidences were also removed: Spiker bolt/rail (3 mm
separation) and Sunlance ceramic jaw/barrel cap (2 mm). A regression intersects
actual GLB triangles to detect positive-area coplanar faces between distinct
parts; all seven weapon assets pass.

## Whole-gun disappearance

The first draw-callback test submitted every weapon mesh over 90 sampled idle
and fire phases per weapon. That did not establish fragment visibility and
omitted the beginning of equip, so a second normal-rendering diagnostic used
WebGL2 `ANY_SAMPLES_PASSED` queries around the actual viewmodel render pass.
It keeps antialiasing, DPR2, live simulation, movement and firing; browser-only
instrumentation exposes the existing instance without adding a production API.

The old saved equip clip starts 23 cm below and 19 cm toward the camera, tilted
0.55 radians. It places the complete gun outside the weapon-camera frustum in
the first frames. The original run observed **10 blank frames in 1,207 frames**,
all at equip starts, with the default framebuffer selected, depth writes/tests
enabled, and stencil disabled. Stationary pistol, movement/firing, near-wall and
resize checks did not reproduce an additional pistol disappearance.

All seven clips now begin with a 6.5 cm dip, 3.5 cm approach and 0.10 radian tilt.
Their 450 ms duration, weapon cadence and aim are unchanged. A GLB regression
projects actual weapon vertices throughout equip plus recoil on desktop and
portrait; it failed against the old clip (zero visible pistol vertices at t=0)
and passes after re-export.

| Normal rendering check | Observed frames | No visible weapon fragments | Browser errors |
| --- | ---: | ---: | ---: |
| Before: desktop AA/DPR2 | 1,207 | 10 | 0 |
| After: desktop AA/DPR2 | 1,389 | 0 | 0 |
| After: portrait touch AA/DPR2 | 1,290 | 0 | 0 |

Reports and actual game captures are in `../weapon-visibility/`,
`../weapon-visibility-after-desktop/` and
`../weapon-visibility-after-portrait/`. The after runs return each weapon trial
to the safe entrance to prevent combat death from truncating later observations.
These are bounded rendering checks on installed Chrome, not physical-phone or
universal flicker guarantees, and their GPU queries invalidate performance use.

Reproduce:

```sh
node scripts/inspect-render-stability.mjs http://127.0.0.1:5176 [output]
node scripts/inspect-weapon-visibility.mjs http://127.0.0.1:5176 [output]
PORTRAIT=1 node scripts/inspect-weapon-visibility.mjs http://127.0.0.1:5176 [output]
```

The stability images predate the final softer viewmodel lighting. Final mood
captures are maintained under `art/modern/refinement/lighting/`. Authored-room
lighting now uses seven fixed fixtures, avoiding nearest-source replacement
pops. Global and viewmodel light levels fade across its boundary; the other
campaign lighting settings remain unchanged. Focused verification: 15 unit
tests and all three TypeScript projects pass. Final aggregate tests and hosted
verification are maintained by the integrating task.
