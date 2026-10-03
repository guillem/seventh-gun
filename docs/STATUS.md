# STATUS

## Full roster and campaign art pass — local validation complete 2026-10-03

Implemented on `codex/experimental-modern-art`, draft PR #32: seven animated
weapons/fitted hands, six skinned enemy species, saved pickups/arena marine,
28 environment modules across seven maps, twelve generated images and forty
saved sound samples. Sources, exact prompts, provenance and review evidence are
in [art/modern/roster](../art/modern/roster/README.md). Complete runtime payload:
84 files / 26,803,216 bytes before transport compression. Three.js remains the
engine; desktop adds restrained contact shading alongside the Foundry light bake.

384 unit tests pass under Node 24.21.0, including the 300-seed sweep, golden combat,
real GLB/animation/clearance/ownership checks and full sampled-audio dispatch.
All three TypeScript projects and the production build pass. Actual-game review
covers all seven weapons on desktop/portrait, all seven maps and six verified
species, with no game errors or missing assets. Hardware Chrome / Apple M5 Pro
holds about 60 fps in four normal-mode scenarios and all fourteen campaign entry
views (seven maps, desktop and portrait), with p95 16.7–16.8 ms and no game errors.
These are selected views on a desktop GPU, not traversal/phone/headroom guarantees.
Physical phones and Safari remain untested. The full browser suite passed 105
checks with 13 intentional skips; two obsolete rigid-body corpse assertions were
updated to inspect actual skeletal death/reset poses and both fresh reruns pass.
This verifies 107 browser checks across the full run and focused rerun. Netlify
verification is pending. Source simulation/network/server files are unchanged.

Keep the branch experimental and PR #32 draft. No merge, tag or production deploy.
The milestone entries below preserve earlier stages of the same experiment.

## Entrance detail pass — 2026-10-03

The entrance and first doorway now use saved generated door/floor textures,
Blender service panels, louvers, clipped cables, matte signage, warm caged lamps
and attached door guard hardware. The updated lightmap reduces broad entrance
fill, while a ceiling practical keeps the moving door readable. Original floor
layout and door motion remain unchanged. Sources/prompts/screenshots are under
`art/modern/entrance/`; old screenshots remain available for comparison.

349 unit tests pass under Node 24.21.0. All TypeScript projects and the production
build pass. Full desktop/mobile Playwright: **103 passed, 13 intentional skips**,
zero failures/retries (8.0 minutes), including blocking/opening/traversing the new
door. Normal-mode installed Chrome / Apple M5 Pro holds about 60 fps in all four
views (desktop, retina, mobile emulation, first combat hall), p95 16.7–16.8 ms;
real controls pass without game errors. Physical phones remain untested. Netlify
implementation commit `0dbfd77` is verified: desktop/mobile entrance and open-door
captures pass, nine Foundry asset checksums match, and map hash stays `ee306bc5`.
Hosted normal controls and all four hardware profile scenarios pass without game
errors. Blocked preview-toolbar telemetry is recorded separately in the reports.
PR #32 remains draft and remote main remains `8bf93b3`. GitHub CI runs separately.
Next art milestone: improve the pistol/hands and husk after reviewing this pass.
The current art payload is 25 files / 10,075,650 bytes before compression.
Keep the branch experimental and PR #32 draft; no merge, tag or production deploy.

## Foundry architecture and lighting milestone — 2026-10-03

Implemented on `codex/experimental-modern-art` / draft PR #32. The entrance,
airlock and casting hall use a saved Blender scene with taller architecture,
overhead machinery, galleries, a 2048² lightmap and baked normal/roughness maps.
Desktop world rendering has restrained bloom; touch uses the direct path.
The unchanged 370-cell floor footprint, doors and low-clearance geometry are
checked against the exported GLB. No simulation files changed.

348 unit tests, three TypeScript projects and the production build pass.
The complete desktop/mobile Playwright suite passes: **101 passed, 13 intentional
project skips**, no failures or retries (8.1 minutes). Installed Chrome on Apple
M5 Pro holds about 60 fps in all four recorded normal-mode scenarios (desktop,
retina, mobile emulation, first combat hall), with real entry/pause/quit checks.
The bundled test browser uses SwiftShader: functional tests pass, but normal
software-rendered performance is poor. Both reports are saved; real phones remain
untested. Netlify deployed implementation commit `f69e25d`; hosted desktop and
mobile checks load all 22 resources (8,226,436 bytes), retain map hash `ee306bc5`,
and show no game errors. All six new assets match local SHA-256 checksums. Hosted
normal-mode entry/pause/quit and four hardware performance scenarios pass. The
preview toolbar's blocked telemetry is recorded separately in hosted reports.
PR #32 remains draft; remote `main` remains `8bf93b3`. GitHub CI runs separately.
Next step: user review of the entrance and first casting hall before more rooms. Sources and actual gameplay evidence are
in `art/modern/foundry-room/`. Six new resources add 3.48 MB; the full experimental
art payload is 8.23 MB / 22 files. No merge, release or production deployment.

## Experimental modern art branch — 2026-10-03

Active branch: `codex/experimental-modern-art`. **Do not merge or release.**
The user authorized the first playable modern-art milestone and local Blender
authoring. See [EXPERIMENTAL-ART.md](EXPERIMENTAL-ART.md) for scope, invariants,
asset pipeline and review gates. Netlify draft-PR preview is the intended
delivery. The first Foundry slice is implemented: saved generated textures and
audio, editable Blender sources/GLBs, asset loading, modern lighting, title/HUD
and touch integration. Runtime art is 4.74 MB across sixteen files. The other
weapon/enemy families and bespoke character animation remain later art passes.

Local verification: 346 unit tests pass under Node 24.21.0, all three TypeScript
projects and the production build pass. Normal-mode desktop/retina and mobile
emulation held about 60 fps on this Mac's Apple M5 Pro; this is not real-phone
performance evidence. Visual review fixed portrait weapon cropping and touch
controls intercepting pause-menu actions. The final repository Playwright run
passes **99 tests with 13 intentional project skips**, zero failures/retries,
under pinned Chromium 1234, desktop and mobile projects (6.0 minutes).

Draft [PR #32](https://github.com/guillem/seventh-gun/pull/32) is open. Review at
<https://deploy-preview-32--seventh-gun.netlify.app>. Verified the deployed desktop
and mobile game boots, all sixteen art resources load (4,742,926 bytes), and
Foundry retains hash `ee306bc5`. Local and hosted normal-mode entry, pause/resume,
quit and first-combat-room rendering checks pass. Hosted preview-toolbar
telemetry to Segment/Bugsnag is blocked in this test environment and recorded
separately; game resources and game JavaScript have no observed errors.

Reproduce with `scripts/inspect-modern-art.mjs` (fixed debug cameras) and
`scripts/profile-modern-art.mjs` (real normal-mode controls). Sources, provenance,
local performance report and gameplay screenshot are in `art/modern/`. GitHub
CI also runs on the draft PR; no production deployment is enabled for PRs.
Next step is user review of this first slice before expanding the remaining
weapon/enemy roster, animation and environment composition.

Node 26.10.0 on this machine has a pre-existing cosmetic secret snapshot mismatch:
it also fails on the unchanged main baseline. Use Node 24, as CI does; no snapshot
or simulation files were changed to accommodate the host runtime.

The production history below is retained as the experiment's baseline.

Updated 2026-09-05. The September repair implementation is complete; the
first tagged package release is pending npm publishing authorization.
See [REPAIR-PLAN.md](REPAIR-PLAN.md) and the linked PR/workflow results for
integration and rollout gates. A local passing build is not a publication.

## Product

Seeded mazes, seven authored campaign maps, an editor, 15 campaign secrets,
seven weapons, six enemy species, and arena deathmatch are implemented.
Maze `GEN_VERSION` remains 4; `ARENA_GEN_VERSION` remains 1. Repairs preserve
authored layouts and the accepted retro art direction. Arena contains remote
players, not AI monsters.

Cloudflare Workers is production at
<https://seventh-gun.default-428.workers.dev>. A Durable Object owns the
shared arena. Netlify is a static mirror at
<https://seventh-gun.netlify.app>; arena is offline there unless explicitly
configured for an allowed Worker origin. Never add a Cloudflare payment
method. `/arena` and `/health` are the only worker-first routes.

## Repair implementation

- PR #27: cancellable joins, room teardown, duplicate/malformed transport
  handling, and deployment checks for real assets and advancing snapshots.
- PR #29: fixed wall-clock stepping, applied-input acknowledgements,
  per-life prediction reset, bounded retransmission and interpolation.
- PR #30: protocol v3 projectile direction/identity, full 3D beams, matching
  predicted shot echoes, sustained sound prioritization and deathmatch HUD.
- PR #28: outward secret clues, exposed remote controls and invalid-import
  rejection. All 15 secrets have real activation/reward coverage.
- PR #31: owned GPU resource disposal, one render per frame in every mode,
  cached arena grids, six-species lifecycle tests, correct arena health audio,
  and a geometric visibility check when enemies finish firing windup.
- PR #26: portable Node server and distribution, full notices, clean-build
  asset emission, minimum-Node/artifact checks, safe shutdown and gated release.

The narrow enemy visibility fix changes combat outcomes; an expert verified
all 90 golden samples match the old baseline with only that guard removed,
and the new baseline with it enabled. General splash rules are unchanged.

## Verified and remaining gates

Cloudflare protocol v3 has passed live asset/welcome/advancing-snapshot checks
and browser arena rendering. The earlier reported outage was not reliably
reproduced, so its historical cause remains unknown. CI checks every later
Worker rollout with the same product-level probe.

The combined implementation passed 332 unit tests before two additional FX
ownership tests were added. Focused tests for those paths pass. Installed
package checks passed on Node 22.23.2 and 24.18.1, including a valid >2 KiB
input batch acknowledged under the 8 KiB cap, malformed transport, two room
clients and bounded shutdown. The combined container served assets, joined
two clients and shut down in 70 ms locally. Clean Cloudflare and portable
builds emit matching notices; the portable SSR pass preserves client assets.
Use the final CI result for the exact aggregate count on a later commit.

Repeated GPU tests submit real draws and accepted shots, and compare stable
geometry/texture counts. Real FX clear/expiry tests also observe material
and geometry disposal. The repeated-GPU scenario uses maze sessions;
campaign decor/secrets and remote label churn rely on the same reviewed
ownership logic rather than dedicated repeated-GPU scenarios.

No package version has been published by this repair effort. The first npm
publication needs the short-lived credential described in
[TESTING](TESTING.md#release-smoke-checks), then trusted publishing must replace
it and the bootstrap token must be revoked. Before tagging, verify repository
visibility/protection, repeat the history scan, and run the manual Release
workflow from main. Never create a release tag while authorization or gates
remain incomplete.

Human checks remain for sustained multiplayer sound on separate machines,
secret discoverability without debug knowledge, enemy silhouettes, and real
Safari/touch devices. Chromium mobile emulation is not Safari validation.
Lag compensation, a full visual secret editor, balance changes and new art
direction remain outside this repair.
