# STATUS

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
