# STATUS

## Current state — 2026-10-04

Read this block first; the dated sections below are a newest-first log. Older
entries are kept as written, so some of their claims are superseded (the CI
timeouts, "remote main remains `8bf93b3`", workers.dev as the only production
URL). Where they disagree with this block, this block wins.

- **Branch** `codex/experimental-modern-art`, draft
  [PR #32](https://github.com/guillem/seventh-gun/pull/32). Never merge, tag or
  release it. It is behind `origin/main` by PR #33 and #34 (docs, and a
  production-only deploy guard). Merging `main` in is deliberately deferred:
  do it only when `main` has code wanted on the art build, and keep this
  branch's `wrangler.jsonc`, `deploy.yml` and `deploy-art.yml` when it happens.
- **Production** is `main` (`e1e2acb`) on the `seventh-gun` Worker at
  <https://seventhgun.com>; `www` redirects there. Netlify stays a static mirror.
- **Art review targets:** <https://art.seventhgun.com> (own Worker and arena,
  auto-deployed by `deploy-art.yml` on every push to this branch) and the
  Netlify preview <https://deploy-preview-32--seventh-gun.netlify.app/>.
- **CI** is green on this branch since run 37143784123 (`ea51a0c`): typecheck,
  unit tests, six llvmpipe E2E shards, deploy-target check, deploy, smoke.
- **Art scope delivered:** all seven weapons, six species, support props, 56
  environment modules over seven maps, forty sound samples; rendering
  continuity and Safari audio-start fixes; the room vertical grammar on all
  seven campaign maps and seeded solo mazes. Simulation, maps, balance,
  network and `GEN_VERSION` are unchanged from `main`. Boot pack: 92 files /
  29,408,960 bytes before compression, label `vertical-02`; authored areas add
  files under `public/modern/areas/` loaded only for their map
  (`runtime-manifest.json` lists both).
- **Active programme:** hand-built, light-baked Blender areas for every
  campaign map, like the Foundry opening (user's goal, 2026-10-04). Plan and
  progress: "Authored areas programme" below.

### Waiting on the user

- Review of the door/variant pass and, when pushed, the first authored-area
  pilot (see "Authored areas programme").
- Review of the current preview build. The refinement, continuity and Safari
  passes answered earlier user reports; no verdict on the result is recorded.
- Native Safari retest of the seed-field/audio start fix (automation disabled).
- Decide the Node 26 wall-decor shuffle fix; it needs a `GEN_VERSION` call.
- Decide whether `SOCKET_IDLE_S` (15 s) should tolerate slow software-GL joins.
- Decide how to license and credit the shipped AI-generated images (ImageGen)
  and Runway-generated audio. README and THIRD-PARTY still say every asset is
  generated at runtime; this branch now says otherwise in a note (see
  `art/modern/textures/PROVENANCE.md`, `art/modern/audio-provenance.json`).
- First npm publication (bootstrap token, then trusted publishing); see
  [TESTING](TESTING.md#release-smoke-checks). Independent of this branch.

The consolidated backlog is in [ROADMAP](ROADMAP.md#backlog).

## Authored areas programme — plan, 2026-10-04

User verdict on the campaign rollout: better overall, but details are off
(doors too short with a gap on top). Asked to fix that and every issue found,
with the final goal of several hand-made Blender areas in every map, like the
Foundry opening, "because they look incredibly better".

- **Phase A — done (this entry's commit):** door assemblies, plate heads,
  variants, copings, the door-use input bug, the E2E cursor leak. Below.
- **Phase B — done:** registry `src/render/authoredAreas.ts` (the Foundry
  opening is its boot-pack entry; `foundryCell` call sites now use it), lazy
  per-map loading awaited by UI campaign starts, next-map prefetch, grammar
  fallback, ambient scaling, area practicals, `tools/modern-art/area_lib.py`
  and `export_area_layout.mjs`, unit + E2E tests. Recipe:
  `art/modern/areas/README.md`.
- **Door review pass:** every campaign door captured closed and open
  (`art/modern/vertical/doors/`, `tools/modern-art/capture_doors.mjs`). Slabs
  read as black voids because the door surface used the near-black alloy
  image; doors now use a mid-value specimen per identity. The Spire leaf's
  bead was a filled box and is now a thin frame. Open slabs vanish into the
  housing on every map. The Foundry opening is pixel-identical at the
  entrance; in the hall only Door 1's new frame and a restyled room seen
  through a side passage differ (vs `67c2ab7`). Foundry corridors outside
  the hall stay dim: that map's global light is tuned for the bake.
- **Phase C — done (first pass):** 20 authored areas, three per map (start
  room, a signature hall, the arena; the Foundry's start is the original
  opening). Meshopt compression (`gltfpack`) cut the pilot from 3.25 to
  0.72 MB; all 20 total 13,666,898 bytes, loaded per map. Designs, sizes and
  captures: `art/modern/areas/README.md`. Grid hashes unchanged; footprint,
  clearance, inlay and registry tests cover every area. Fixes found on the
  way: long wall bands and lettering now avoid doorways; area metals capped
  at 0.3 metalness (they read black); "bronze" uses a lit specimen.
- **Phase C pilot (as first written):** pilot `gullet-arena` delivered for review (3.2 MB GLB
  + 0.46 MB lightmap, loaded only for the Gullet; full bake 48 s). Next: the
  user's verdict, then 2–3 areas per map. Mesh compression (Draco/meshopt) is
  a follow-up before many areas ship.
- **Phase B plan (as written):** replace the hard-coded `foundryCell`
  with an area registry (`src/render/authoredAreas.ts`); per-map lazy loading
  of area GLB + lightmap (never in the boot pack), awaited by UI starts via
  `prepareWorld`, next map prefetched; until loaded, the grammar renders the
  cells (sync debug starts and failed loads degrade). Area materials scale
  map ambient/hemisphere light (shader patch) so bakes are not double-lit;
  each area declares its practical/actor light positions. Generalise
  `build_foundry.py` into a shared Blender library. Gate: Foundry frames
  unchanged, all hashes unchanged.
- **Phase C — areas:** pilot one area (Gullet arena), measure bake time,
  bytes and look, push for review; then 2–3 areas per map. Areas cover whole
  rooms plus their mouths, with boundaries in 6 m corridor cells; avoid secret
  rooms and remote controls unless handled explicitly.

## Doors, variants, input fix and E2E cursor — 2026-10-04

- Doors: per-identity `doorhead` (housing 4.2–6 m, jambs within clearance) and
  `doorleaf` on the slab; red status lens when locked; slabs clipped at the
  6 m ceiling. Secret plates get a plain wall head; the seal sits under a
  doorhead. Details in `art/modern/vertical/README.md`.
- `relief2` / `upper2` variants per identity, alternating about each run's
  centre; outward copings on raised walls. Ward ceilings ceramic.
- **Door-use bug (real gameplay bug):** the game polls input once per
  animation frame but steps the simulation at 60 Hz. On displays above 60 Hz
  many frames run no step, and polling cleared the E (use) and weapon-switch
  edges, so presses were randomly lost. `game.ts` now holds those edges until
  a step consumes them. This was the "entrance door" E2E flake: without the
  fix 6/16 runs fail in hardware Chrome at 120 Hz, with it 16/16 pass. (The
  earlier "identical before and after the rollout" comparison is void: it ran
  against a reused preview server, `reuseExistingServer: true`.)
- **E2E cursor leak:** with the installed Chrome (`PLAYWRIGHT_CHANNEL=chrome`)
  on macOS, the game's `requestPointerLock()` captured the developer's real
  cursor even headless. All specs now import `test` from
  `tests/helpers/test.ts`, which stubs pointer lock in every context. No test
  asserted a real lock.
- Local: typecheck, 465 unit tests (Node 24), production build, full E2E in
  hardware Chrome 113 passed / 13 skipped. All 19 review views keep their grid
  hashes; draw calls are 24–67% below the pre-grammar build.

## Room vertical grammar on the whole campaign — 2026-10-04

The user approved the pilot below and asked to roll it out to the rest of the
campaign. `VERTICAL_CAMPAIGN_ART` now holds all seven identities. In the
Foundry, rooms touching the authored opening (start room, casting hall) keep
their saved geometry, roof heights and bake; the grammar covers its other
rooms. The Ward's ceiling specimen changed from dark alloy to its ceramic
finish, which read as a black void in tall rooms (Ward corridors lighten too).
The rollout also clears the relief/luminaires that the old layout put over
remote secret controls in Catacombs, Pit and Sanctum.

Nineteen before/after views (`f80adad` vs this change) cover every campaign
map and the two seeds: every grid hash is unchanged (Foundry `ee306bc5`),
draw calls fall 28–71%, triangles change by −14% to +9% except the Spire
arena (+20%) and Ward atrium (+14%). Table and captures:
`art/modern/vertical/README.md`. Local: typecheck, 464 unit tests on Node 24,
production build, full desktop/mobile Playwright suite in hardware Chrome
(112 passed, 13 skipped, 1 failed: the pre-existing door flake below).

Pre-existing E2E flake, not caused by this work: "the authored entrance door
still blocks, opens and lets the player reach the hall" (desktop) times out at
`modern-art.spec.ts:172` (after pressing E, the player never passes x 37).
With `--repeat-each=16 --retries=0` in hardware Chrome it fails 3/16 both on
the pilot commit `70e8683` (Foundry rendering unchanged) and on this rollout.
It passes alone. The use key is latched (`input.ts`), so a short press is not
dropped; the cause is still open.

Known limits: real-time lighting only outside the Foundry hall; regular bays
(one relief and one upper module per identity); raised rooms seen from a
courtyard are plain blocks above the wall line.

## Room vertical grammar pilot — 2026-10-04

User verdict on the previous build: the authored Foundry opening is much
better (non-repetitive detail, vertical space); the other maps keep low
corridors and repetitive details. Asked to extend the redesign to the whole
campaign and to seeded mazes without changing layouts (players have favourite
seeds). Agreed plan: a shared runtime grammar first, piloted on the Gullet and
seeded solo mazes, reviewed before rolling out; authored hero rooms later.

Delivered, all presentation-only: per-room ceilings (7.5–14 m; corridors,
doors, secrets and outdoor rooms stay 6 m) with header walls at room mouths;
seed rooms mapped from their generator theme to the seven identities;
run-based wall dressing replacing `coordinate % interval`; a string course,
upper order, crown, overhead members and suspended lamps in tall rooms, from
28 new saved kit modules; hanging lamps as practical-light positions (same
12-light budget, still configured once per map); and `BatchedMesh` rendering
for this path. Variation uses a render-local hash of seed + room id, never
sim RNG. Arena, `#m=` maps, the Foundry and the other five campaign maps keep
the previous look.

Seed grid hashes are unchanged (`62624244` / `8f50b164`, now pinned in
`tests/unit/roomVolumes.test.ts`). Draw calls fall by 42–58% in the six review
views; triangles change by −14% to +5%. Raised walls get an outward skin above 6 m
(seen from courtyards), and the grammar keeps relief/luminaires off remote
secret controls. Details, before/after captures and the measurement table:
`art/modern/vertical/README.md`. Local: typecheck, 463 unit tests on Node 24,
production build, full desktop/mobile Playwright suite in hardware Chrome.

Known limits: real-time lighting only, so tall rooms are Foundry-like, not
Foundry-equal; still one relief and one upper module per identity, so bays are
regular (module variants are the next step for repetition); the Ward's alloy
ceiling reads near-black in tall rooms. Pre-existing, outside the pilot: the
old modulo layout covers a remote secret control with relief or a luminaire
in Catacombs, Pit and Sanctum; the rollout fixes it.

## Retired first-slice boot assets — 2026-10-04

`preloadModernAssets()` no longer downloads `models/pistol.glb`,
`models/husk.glb`, `models/architecture.glb` or `textures/dermal.webp`
(3,381,286 bytes). The roster pack had replaced them in play; only a
material-patching loop and three unit tests still read them. The files are
removed from `public/modern/`, so they no longer ship either. The pack is now
92 files / 28,255,528 bytes (`art/modern/roster/runtime-manifest.json`), pack
version `refinement-02`. `.blend` sources and provenance stay under `art/modern/`;
`art/modern/models.md` records the retirement.

`addModernArchitecture` (test-only, used the retired architecture GLB) is gone.
Its orientation and chunking test now runs `instanceArchitecturePart`, which the
campaign environment uses, against the live kit modules. The E2E boot test
asserts the retired paths are never requested, and the failed-asset retry test
uses `roster/weapons/1.glb` in place of the old pistol.

Local: typecheck, 454 unit tests on Node 24, production build, and the full
desktop/mobile Playwright suite in hardware Chrome (113 passed, 13 intentional
skips). No visual change is expected: nothing visible used these files.

## CI E2E on software GL — fixed 2026-10-03

E2E had never completed on this branch's CI. Cause, measured on GitHub runners:
Playwright's bundled headless shell renders WebGL with SwiftShader (Subzero JIT
on x64 Linux), which needs 29 s to start the Foundry and 1.8 s per frame with
this renderer. Mesa llvmpipe does the same full-quality frames in 7.0 s and
0.39 s. No game or render code was changed; tests exercise what ships.
Details and the measurement table are in [TESTING.md](TESTING.md) "E2E in CI".

- `E2E_GL=llvmpipe` (CI only, `tests/helpers/softwareGl.ts`) with a global
  setup that aborts on a silent SwiftShader fallback; CI-only limits in
  `playwright.config.ts`; `deploy-art.yml` runs six E2E shards and the deploy
  needs all of them. The draft PR's `deploy.yml` copy has no E2E and a renamed
  test job, so it cannot satisfy `main`'s required check.
- The two-client arena test could not pass on a GPU-less runner: the second
  client's join took 28-37 s while the first rendered, and the server drops a
  socket silent for 15 s (`server/room.ts` `SOCKET_IDLE_S`). It now starts both
  joins together in 320x200 windows (1.4-2.3 s). Server and net code untouched.
  The same limit could affect a player running two game tabs without a GPU;
  changing it is a server change and is left to the user.
- Two pre-existing weak assertions fixed in tests: "does not start a run"
  checks read the phase before a wrongly triggered start could land, and the
  entrance-door check was vacuous at software frame rates.

First real run on this branch, 37143784123 (ea51a0c): typecheck, 456 unit tests,
six E2E shards (113 passed, 13 skipped, 0 failed, 0 retried; slowest shard
3.3 min, slowest test under 20 s against the 120 s CI limit), deploy-target
check, deploy of `seventh-gun-art` version `9d6670ae-a678-4fd9-97bc-ad8d3043f8c2`
and the smoke check on both art URLs: 4 min 45 s in total. Draft PR #32 has
every check green for the first time. Production still serves `main`
(`index-DgFETa6F.js`) and passes its smoke check. The throwaway `ci-diag/*`
branches used for the measurements are deleted.

Not done, deliberately: no lower render scale or lighter render profile for
tests (not needed once the rasterizer was fixed, and it would stop E2E drawing
what players get). Known product-side cost, unchanged: a Foundry frame is 797
draws, 573k triangles and 24 lights with only frustum culling.

## Art Worker for multiplayer review — 2026-10-03

The user bought `seventhgun.com` and moved its DNS to Cloudflare (free plan,
no payment method). This branch's `wrangler.jsonc` now names a separate Worker,
`seventh-gun-art`, with custom domain `art.seventhgun.com` and `workers_dev`
kept on. It has its own Durable Object room. Deploy steps and guard rails are in
[EXPERIMENTAL-ART.md](EXPERIMENTAL-ART.md). Production `seventh-gun` and its CI
deploy from `main` are unchanged. `seventhgun.com` and `www` are meant to be
attached to production in the Cloudflare dashboard, not in `main`'s
`wrangler.jsonc`: a domain there would break the README's deploy-to-your-own-
account path, and dashboard domains survive config deploys that list none.

First art deploy (user-run `npx wrangler deploy`, version
`523d79f9-ce74-49e5-b443-fac384bf7b93`) passed `scripts/smoke-deployment.mjs`
(assets, arena welcome, advancing snapshots) on both
<https://seventh-gun-art.default-428.workers.dev> and <https://art.seventhgun.com>.
It serves the branch build (`index-BB85Hx6o.js`, real `modern/` GLBs). Production
<https://seventhgun.com> still serves `main` (`index-DgFETa6F.js`) and passed the
same smoke check; `www.seventhgun.com` 301-redirects to it via a Cloudflare Redirect
Rule. `.github/workflows/deploy-art.yml` redeploys the art Worker on every push,
gated on the full suite (user's choice). Its first runs could not finish E2E on
the default software renderer; see the section above for the cause and fix.
`main` was not affected: PR #33 (docs) merged, its deploy passed and
seventhgun.com, www and workers.dev smoke-checked green afterwards.

Local unit runs on Node 26 fail `secrets.test.ts` "campaign lights+decors hash"
(also on `main`); Node 24 (CI) passes. Cause: `src/sim/cosmetics.ts` and
`src/sim/mapgen.ts` shuffle wall-decor directions with
`sort(() => rng.float() - 0.5)`, whose order depends on the JS engine's sort
(verified: same 5 comparator calls, different order on Node 24 vs 26). Campaign,
blueprint and arena maps give cosmetics their own or final RNG use, so there only
wall decors differ. In random mazes the decor loop shares `rng` with the later
key-room pick (`mapgen.ts` ~468), so the vault key's room can differ by engine.
The fix is a seeded Fisher-Yates shuffle, which changes generated maps and needs
a `GEN_VERSION` decision, so it is deferred to the user and out of scope for this
art branch. Run unit tests under Node 22/24 until then.

## Safari seed-field focus — 2026-10-03

The user isolated the sound failure to clicking ENTER THE MAZE while the seed
input has focus. The same seed works with Enter, or after clicking outside the
input first. The button now ends seed editing on pointer-down before its normal
click initializes audio. Pointer-down alone does not launch; dragging away still
cancels. This is a focused UI fix, with no audio/render/simulation/asset changes.

453 unit tests and the production build pass. Eighteen normal-mode Chrome/WebKit
checks pass across both seeds, three start methods, a control seed and injected
audio failures. Fourteen healthy cases have a running audio clock, forty decoded
recordings and nonzero game audio signal, without the five-second timeout.
The retained-focus regression fails on the previous build as expected. See
`art/modern/startup/FOCUS-FIX.md`. Native Safari confirmation remains pending;
its test driver is disabled. All 113 desktop/mobile browser checks pass with
13 intentional skips and no retries, including both focus regressions on both
device profiles. Implementation `4411637` is verified live at
<https://deploy-preview-32--seventh-gun.netlify.app/>: JavaScript/CSS match the
tested build, and all fourteen hosted Chrome/WebKit start-path checks pass with
running audio, all forty recordings decoded, and measured game sound output.
Healthy starts took 500–686 ms here. Native Safari still needs the user's retest.
Keep the experimental branch and draft PR #32; no production deployment.

## Safari maze startup — 2026-10-03

The user narrowed the `1984`/`1986` loading hang to Safari; Chrome loads quickly.
The generator is unchanged from main and both layouts generate in about five
milliseconds. Normal starts also pass in Playwright WebKit, so the exact native
Safari trigger remains unconfirmed (Safari remote automation is disabled).

Fixed an indefinite audio readiness gate that reproduces the reported loading
state when a browser resume/decode promise stalls. Resume and decoding now run
independently with a five-second deadline. Successful/late recordings remain
usable; gameplay gestures can retry interrupted sound without blocking play.
The loading message now distinguishes scene preparation from sound preparation.
No renderer, generator, layout, simulation, balance or asset changes.

451 unit tests, all three TypeScript projects and the production build pass.
The full Chrome desktop/mobile suite passes 109 tests with 13 intentional skips,
no retries. Ten normal-mode Chrome/WebKit startup checks pass, including both
seeds, stalled resume/decode and late decode recovery. Baseline injected faults
remain frozen after 15 seconds; fixed runs release at about five seconds.
Map hashes remain `62624244` / `8f50b164`. Evidence and reproduction commands:
`art/modern/startup/README.md`. Implementation `9af7a8e` is verified live at
<https://deploy-preview-32--seventh-gun.netlify.app/>: JavaScript/CSS match the
tested build byte-for-byte; all eight hosted Chrome/WebKit seed/audio checks
pass, with unchanged hashes. Native Safari still needs user confirmation.
Keep `codex/experimental-modern-art` and PR #32 draft; no production deployment.
GitHub CI runs separately and was still in progress at verification.

## Rendering continuity — delivered 2026-10-03

Fixes the user's first-shot/first-room stalls, global lighting changes at room
boundaries, and checker-like doorway jambs. Still on
`codex/experimental-modern-art`, draft PR #32. Details and measurements are in
`docs/RENDER-CONTINUITY.md` and `art/modern/continuity/`.

Lights are now stationary and configured once per map. The Foundry hall and
every side room remain lit from outside with constant ambient/weapon lighting.
Three permanent FX light slots avoid shot-dependent shader layouts. Effects,
all seven weapons and the muzzle sprite retain their prepared GPU resources.
The actual composer/contact-shading and weapon paths upload/render resources
before play; UI starts show a painted loading screen and await audio readiness.
Blender removes overlap at all six passage boundaries and corrects portal heads
to the six-metre corridor ceiling, with a replacement baked irradiance atlas.

438 unit tests pass under Node 24; all three TypeScript projects and the build
pass. Actual GLB tests find zero shared-plane doorway overlaps (48 triangles
before), preserving the 370-cell floor. Runtime assets: 96 files / 31,636,814
bytes. Simulation, map, balance, collision and network source files are unchanged.

Fresh normal Chrome / Apple M5 Pro captures cover first/repeated fire, hall/room
crossings, room interiors and all seven weapon effects at desktop and portrait
DPR 2. After preparation, these actions create zero new GPU programs, image
uploads or vertex buffers and stay near 16.7 ms/frame. Baseline first-shot and
first-boundary checks created 18 and 23 programs. Initial preparation measured
about three seconds with a cold driver compile, under one second on later
contexts; that work is shown explicitly before play. These are selected views
on a desktop GPU; physical phones/Safari remain untested.

All 109 applicable desktop/mobile browser checks pass without retries, with
13 intentional skips. Netlify implementation `7b165ca` is live at
<https://deploy-preview-32--seventh-gun.netlify.app/>. All 96 assets match byte
counts and SHA-256 hashes, and hosted JavaScript/CSS match the final local build.
Hosted normal-mode desktop/touch cold-action checks and fourteen local campaign
entry/control views are recorded in `art/modern/continuity/`.
The bundled Chromium backend was identified locally as SwiftShader;
its partial run is retained separately. `PLAYWRIGHT_CHANNEL=chrome` selects the
hardware browser for the same assertions; default CI settings remain unchanged.
No merge, tag, release or production deployment.

## Review refinement — delivered 2026-10-03

The user reported camera-dependent black patches on Foundry column bases,
whole-gun disappearance, simple creature anatomy/materials and overly bright
warehouse lighting. Work remains on the experimental branch and draft PR #32.
See `docs/ART-REFINEMENT.md` and `art/modern/refinement/` for scope and sources.

Implemented: separate coplanar column/chamber faces; replace
continuous roof wash with selected openings and warm practical pools; use matte
concrete flooring and fixed actor-light locations. GPU occlusion queries reproduce
whole-gun disappearance in the first frames of exaggerated equip clips; all seven
clips now retain visible geometry (0 blank frames in 2,679 after-fix observations).
All six creature species now have more developed anatomy,
facial/joint detail and four new generated albedos plus eight Blender-baked
normal/roughness maps. All 393 unit tests, all three TypeScript projects and the
production build pass under Node 24.21.0. Runtime art is 96 files / 31,631,152
bytes before compression.

107 applicable browser checks are verified. The full desktop/mobile run passed
106 with 13 intentional skips; one desktop campaign-resume test exceeded its
30-second cumulative budget. A trace of the unchanged assertion passed in
34.144 seconds, with its final state check taking 640ms. A scoped 60-second test
budget now passes ordinary-config desktop and mobile reruns without retries.
No campaign runtime change was required. Original failure evidence and the
successful traces/timings are in `art/modern/refinement/campaign-resume/`.

Netlify implementation `8cffc14` is verified at
<https://deploy-preview-32--seventh-gun.netlify.app/>: all 96 runtime files match
local byte counts and SHA-256 checksums. Twenty-seven hosted actual-game views
cover every weapon on desktop/portrait, all six positively identified species
and all seven maps. Both layouts load all 96 files without game errors; every
campaign map hash matches the previous milestone. The interactive before/after
comparison is `art/modern/refinement/compare.html` (14 images, seven working
sliders). Generated originals and exact prompts remain in its `materials/` folder.

Hosted normal-mode Chrome / Apple M5 Pro holds approximately 60 fps across four
general/control scenarios and fourteen campaign entry views, p95 16.7–16.8ms,
with no game errors. Touch is emulated on the same desktop GPU, not a physical
phone; these are selected views, not GPU-headroom or full-map guarantees.
Netlify preview-toolbar telemetry is recorded separately. Aggregate evidence:
`art/modern/refinement/validation.json`. Later commits record evidence and the
scoped test budget without changing the verified runtime assets.

The scene remains a stylized art experiment. Fixed practical lights are
unshadowed and also affect baked surfaces; some light bleeding remains possible.
Physical phones and Safari remain untested. GitHub-hosted CI is separate:
implementation run `37107581322`, like the previous run, exceeded the explicit
20-minute job limit. Typecheck/unit steps passed; E2E was cancelled and its
failure-artifact step skipped. `art/modern/refinement/hosted/ci.json` records
the annotation and timing. This establishes the CI limit, not the underlying
graphics backend or a game defect; the PR is not represented as having green CI.

No simulation, map, balance or network changes. Remote main remains `8bf93b3`;
PR #32 remains draft. No merge, tag, release or production deployment.
Next: user review of the refined preview.

## Full roster and campaign art pass — delivered 2026-10-03

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
This verifies 107 browser checks across the full run and focused rerun. Source
simulation/network/server files and authored map data are unchanged.

Netlify implementation `4cb3253` is verified at
<https://deploy-preview-32--seventh-gun.netlify.app/>. All 84 runtime assets match
local byte counts and SHA-256 checksums. Hosted desktop/touch review captures
all 27 views, loads all 84 assets per device, confirms all six species and matches
all seven local map hashes (Foundry `ee306bc5`). No game errors or missing assets.
Four hosted normal hardware/control scenarios also pass at approximately 60 fps,
p95 16.7–16.8 ms. Blocked Netlify toolbar telemetry is recorded separately; the
visual harness waits for actual game readiness rather than network idleness.
Evidence is in `art/modern/roster/hosted/`; aggregate local results are in
`art/modern/roster/validation.json`. Later commits only record evidence and improve
verification scripts. Remote main remains `8bf93b3`; PR #32 remains draft.
GitHub-hosted CI runs independently and was still in progress at this handoff.

Next: user review of the complete playable art pass. Further art-direction changes
should follow that feedback; this remains a modular game and does not reach the
photorealism of its generated menu illustration. Only the Foundry opening has
baked indirect lighting. Physical-device/Safari checks remain useful future QA.

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
