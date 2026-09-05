# STATUS

Updated 2026-09-05. The September repair plan is being executed in ordered
PRs; see [REPAIR-PLAN.md](REPAIR-PLAN.md) for gates and rollout state.
Do not equate a passing local branch with a deployed or published release.

## Product and deployment

Seventh Gun has seeded mazes, seven authored campaign maps, an editor,
15 campaign secrets, seven weapons, six enemy species, and arena deathmatch.
Maze `GEN_VERSION` remains 4; `ARENA_GEN_VERSION` remains 1. These repairs
have not changed authored layouts or the accepted retro art direction.

Cloudflare Workers is production at
<https://seventh-gun.default-428.workers.dev>. A Durable Object owns the
shared arena. Netlify is a static mirror at
<https://seventh-gun.netlify.app>; arena is offline there unless explicitly
configured to connect to an allowed Worker origin. Never add a Cloudflare
payment method. `/arena` and `/health` are the only worker-first routes.

PR #27 is merged and deployed: joins are cancellable, room teardown and
transport failure paths are guarded, and deployment checks load the actual
client asset and observe advancing arena snapshots. This live check passed.
The earlier reported deployment outage was not reproduced reliably; passing
current checks does not establish its historical cause.

## Gameplay repairs and remaining integration

Merged PR #29 stabilizes the simulation clock, acknowledges applied inputs, resets
prediction by player life, and bounds retransmission under 50–200 ms RTT
and jitter. merged PR #30 adds protocol v3 projectile identity/direction, complete
3D beam endpoints, prediction echo matching, sustained sound prioritization,
and arena HUD feedback. Browser protocol checks follow the shared version.

Merged PR #28 fixes secret clue/control facings and rejects invalid imported secret
geometry. All 15 authored secrets have actual activation/reward coverage.
Secret import/compile support is present; full visual secret-editing tools
remain optional future work.

Resource cleanup, one arena render per frame, and six-species visual
validation are in progress. Existing packaging PR #26 is being completed
after these gameplay repairs, with a portable Node server, MIT/third-party
notices, installed-package tests, container checks, and gated releases.

## Verification and remaining work

The combined packaging/gameplay branch has passed 322 unit tests and packed
artifact checks on Node 22 and 24, including bounded WebSocket transport and
shutdown. Final rendering changes require a new combined validation pass.
PR checks and live rollout checks are recorded in REPAIR-PLAN rather than
assuming earlier counts apply to later commits.

Public release is pending final integration, history scanning, repository
settings, and npm publishing access. The first npm publication needs the
short-lived bootstrap credential described in [TESTING](TESTING.md#release-smoke-checks); afterward switch
to trusted publishing and revoke it. No version has been published by this
repair effort yet.

Human checks remain valuable for sustained multiplayer sound on separate
machines, secret discoverability without debug knowledge, enemy silhouettes,
and real Safari/touch devices. Automated mobile Chromium checks are not
Safari validation. Lag compensation, a full secret editor, balance changes,
and new art direction are outside this repair plan.
