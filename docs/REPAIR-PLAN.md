# September 2026 repair execution

Approved 2026-09-05. Follow the review's sequence; escalate significant
differences to the expert reviewer rather than expanding scope.

| Stage | Scope | Gate | State |
|---|---|---|---|
| 1 | Arena lifecycle, cancellable joins, bounded transport, deployment smoke | Race/duplicate/malformed tests; real assets + advancing arena snapshots | Merged #27; 280 unit / 83 browser tests passed (11 skips). Cloudflare assets + advancing snapshots verified live. Node transport follows in #26. |
| 2 | Fixed clock, input acknowledgements, snapshot interpolation | Controlled clock + short controls + latency/jitter tests | Reviewed #29; controlled 30-second latency/jitter and stop gates pass. Final CI pending. |
| 3 | Projectile/beam direction, sustained audio, mode feedback | Seven weapons/pitched views; audio load and echo matching | Reviewed #30; 304 unit tests passed. Final CI pending. |
| 4 | Secret visibility, exposed controls, compiler validation | All 15 secrets/four kinds; legacy codec and seed sweep | #28 reviewed and CI passed; ordered merge pending |
| 5 | Single render, resource ownership, enemy validation | Stable resource counts; six species' attack/death coverage | In progress on combined gameplay branch |
| 6 | Existing packaging PR #26, notices, release gates, dependencies/docs | Packed install Node22/24; container; safe release preflight | Gameplay integrated; 322 unit tests and packed Node22/24 checks pass; rendering integration/container/final CI remain |
| 7 | Public launch readiness and release | History scan, publishing access, anonymous artifacts | Earlier gates pending; npm bootstrap access requires user action; no publication yet |

Full secret-editor tooling and lag compensation are separate optional features,
not prerequisites added to this repair. Preserve the accepted retro art style.
Human art/audio and real Safari/device judgment cannot be replaced by automated
checks; record those limits honestly. Never add a Cloudflare payment method.

Each implementation group gets a branch/PR, regression checks, a verified
Netlify preview, and an arena check on a server-capable target before merge.
The existing packaging PR remains open until the earlier fixes are integrated.
Node transport changes live with that unmerged adapter and will be carried into
PR #26; production room and connection fixes can land first on main.
