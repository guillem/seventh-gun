# Campaign resume timeout investigation

2026-10-03, experimental branch `codex/experimental-modern-art`, runtime assets
and code at `8cffc14`. No game runtime changes were needed.

The full ordinary Playwright run produced **106 passes, 13 intentional skips,
and one failure**: desktop `title CONTINUE resumes after a completed map` reached
the final state wait but exceeded its 30-second total budget on both attempts
(30.2s / 31.3s). The same mobile flow passed in 15.4s. The original full-run log
and failure contexts were preserved before subsequent test runs cleared
`test-results`.

An isolated run of the unchanged desktop test, with only a CLI 60-second budget
and tracing enabled, **passed in 34.144s**. Its final original predicate
`phase === 'playing' && campaign.map === 2` succeeded in **640ms**. Selected
trace action durations:

| Action | Duration |
| --- | ---: |
| Intermission CONTINUE click | 6.401s |
| First map-2 state wait | 0.622s |
| QUIT TO TITLE click | 2.127s |
| CAMPAIGN click | 2.745s |
| Title CONTINUE click | 5.509s |
| Final playing / map-2 state wait | 0.640s |

This flow builds three campaign scenes and performs several UI transitions.
The evidence supports a cumulative test-budget failure, not failed campaign
progress restoration. Trace overhead and run-to-run timing vary; GPU identity
was not captured, so this report does not attribute the measured time to a
particular graphics backend. Both runs used the configured bundled Chromium,
one worker, and the ordinary local production preview.

The only test change is a **scoped 60-second timeout** with an explanatory
comment. All existing navigation and state assertions remain intact. A fresh
run using the ordinary configuration, **without a CLI timeout override**, passed
both projects without retries: **desktop 27.627s**, **mobile 15.851s**.

Diagnostic command:

```sh
npm exec --offline --cache /private/tmp/seventh-gun-npm-cache --package=node@24 -- node node_modules/@playwright/test/cli.js test tests/e2e/campaign.spec.ts -g 'title CONTINUE resumes after a completed map' --project=desktop --timeout=60000 --trace=on --retries=0 --output=/private/tmp/seventh-gun-campaign-resume-trace --reporter=json
```

Validation command:

```sh
npm exec --offline --cache /private/tmp/seventh-gun-npm-cache --package=node@24 -- node node_modules/@playwright/test/cli.js test tests/e2e/campaign.spec.ts -g 'title CONTINUE resumes after a completed map' --reporter=json
```

`diagnostic-timings.json` preserves every trace action's parameters, duration,
successful final predicate, and the local trace ZIP's path and SHA-256. The
22MiB trace archive remains in `/private/tmp`; its frame images are not copied
into the repository. `diagnostic-run.json` and `validation-run.json` are the
raw Playwright JSON reports. No browser or performance runs overlapped these
checks.

The full-run log is also checked in as `../validation/browser-initial.log.txt`.
Text evidence only normalizes trailing whitespace; diagnostic values and errors
are unchanged. The local raw `.log` copy remains available here.
