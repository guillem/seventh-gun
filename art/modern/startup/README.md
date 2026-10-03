# Safari startup investigation — 2026-10-03

The user reported seeds `1984` and `1986` hanging on “Preparing the world” in
Safari while loading quickly in Chrome. The simulation/generator tree is
unchanged from `main`; isolated Node 24 checks generated both maps in about
five milliseconds, including 120 bounded checks across all difficulties.

The unchanged production build also loaded normally in the installed Chrome
and Playwright WebKit 26.5 on this Mac. The exact failure in the user's Safari
session has **not** been reproduced. Safari's built-in driver reported that
remote automation was disabled; WebKit is a separate test browser.

An unbounded audio readiness gate was found: `unlock()` waited for `resume()`
before beginning decoding, then waited for every decoder. Either native promise
could leave a fully constructed maze behind the loading overlay indefinitely.
The baseline browser fault tests reproduce that state with the real UI,
renderer and simulation, injecting only a never-settling browser audio promise.

Audio resume and decoding now begin independently inside the initiating gesture.
Both have a five-second readiness deadline. Successful recordings stay usable,
late recordings are adopted without another load, and missing sounds use the
existing synth fallback. A gameplay click, touch fire-down or single-player
Resume retries interrupted playback without decoding or allocating timers.
The loader distinguishes scene preparation from sound preparation.

`baseline-webkit/report.json` records two healthy starts (507–534 ms) and two
injected audio stalls still frozen at the 15-second test deadline. `fixed-dev/`
records ten passing Chrome/WebKit cases: both seeds, stalled resume, stalled
decode and a decode finishing after seven seconds. Healthy starts took
523–676 ms; the injected faults released gameplay at approximately five seconds.
Simulation time and rendered frames then advanced. These are local measurements,
not performance guarantees or evidence of the exact native Safari trigger.

Map hashes stay `62624244` for `1984` and `8f50b164` for `1986` across all cases.
No simulation, generator, renderer, map, balance or saved art changes.

All 451 unit tests, three TypeScript projects and the production build pass.
`e2e.txt` records 109 passing desktop/mobile Chrome checks, 13 intentional skips
and no retries. `hosted-build.json` verifies that preview implementation
`9af7a8e` serves exactly the local JavaScript/CSS bytes. `hosted/report.json`
records eight passing normal-menu Chrome/WebKit checks on the live preview,
including both audio failures. Healthy starts took 493–658 ms and fault
recovery 5.04–5.16 seconds. Hosted probes exclude only Netlify's injected review
toolbar (the excluded script URL is recorded); game errors remain failures.
GitHub-hosted CI is separate and was still running when these checks finished.

Reproduce against the appropriate running build:

```sh
BASELINE=1 ENGINE=webkit node scripts/inspect-seed-startup.mjs http://localhost:4173/ art/modern/startup/baseline-webkit
ENGINE=both LATE_DECODE_MS=7000 node scripts/inspect-seed-startup.mjs http://127.0.0.1:5177/ art/modern/startup/fixed-dev
```

The script instruments the app bootstrap and browser audio prototypes only in
the test browser. It uses normal seed/menu controls, not the debug start API or
modified rendering settings. Each case has an external 45-second watchdog.
The baseline flag must point at an unfixed build; it does not replace source.
