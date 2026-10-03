# Seed editor focus and Safari sound — 2026-10-03

The user isolated the remaining failure without changing the seed:

| Start action | Result in the user's Safari |
| --- | --- |
| Type `1984`, press Enter | Sound works; no timeout |
| Type `1984`, click ENTER THE MAZE | Five-second timeout, then silent play |
| Type `1984`, click outside the field, click ENTER THE MAZE | Sound works; no timeout |

The seed was a misleading correlation with editing the input. The Start button
now explicitly blurs the seed editor on primary pointer-down. Audio and gameplay
still begin on the subsequent trusted click, after editing has ended. Nothing
starts on pointer-down; dragging away before release still cancels the click.
The existing Enter handler and five-second failure safeguard remain intact.
Only six runtime lines in `Screens.bindTitle` change; audio, rendering, seeds,
simulation and assets are untouched by this follow-up.

The new browser regression models a button that does not take focus on mouse
press. It fails against the previous production build because the seed input
remains focused; `focus-before/retained-focus-regression.txt` preserves this
expected failure. This is a focus-contract reproduction, not a claim that the
automated browser naturally reproduces the user's Safari audio failure.

`focus-fixed-dev/report.json` records eighteen passing normal-mode Chrome/WebKit
checks. Both `1984` and `1986` are tested with click, Enter and explicit blur then
click, plus control seed `1985` and the earlier injected audio failures.
All fourteen healthy starts have a running audio clock, all forty decoded
recordings and measured nonzero signal after the game's master gain. They finish
in 524–704 ms here, without the five-second fallback. The signal check observes
actual game audio through a silent analyser branch; it does not play a test tone
or prove physical speaker output. Map hashes remain unchanged.

Playwright WebKit also passed the old build's ordinary click sequence; it is not
the installed Safari. Safari remote automation remains disabled, so final
confirmation of the user's native-browser symptom still requires their retest.

Reproduce the healthy input paths and audio checks:

```sh
ENGINE=both CASE_FILTER=normal node scripts/inspect-seed-startup.mjs http://localhost:4173/ art/modern/startup/focus-production
```

The full browser suite includes the focus/drag-cancellation regressions for
both reported seeds: 113 pass, with 13 intentional skips and no retries.
All 453 unit tests, three TypeScript projects and the production build pass.
Logs are retained beside this document. All work remains on `codex/experimental-modern-art`,
draft PR #32, using Netlify preview only.

Hosted verification is complete for implementation `4411637`.
`focus-hosted-build.json` records exact JavaScript/CSS checksum matches against
the tested build. `focus-hosted/report.json` records fourteen passing Chrome/
WebKit checks covering all healthy input paths above. All forty recordings
decode, audio time advances, and measured game output is nonzero in every case.
Starts took 500–686 ms on this Mac; no five-second fallback was used. The hosted
probe excludes Netlify's review toolbar, with the excluded URL recorded.
The installed Safari still requires the user's confirmation of the exact
previously failing sequence: type the seed, then click Start directly.
