# Modern art experiment

Started 2026-10-03 on `codex/experimental-modern-art`.

This is a long-lived experimental branch. Keep its PR in draft, do not merge,
do not tag, and do not deploy the Cloudflare production Worker. Netlify Deploy
Previews are the review destination. This explicitly overrides the ordinary
AGENTS.md instruction to merge after preview verification for this experiment.

## Direction and first milestone

Grounded industrial / biomechanical science-fiction horror: cast concrete,
machined steel, restrained amber and cool white practical lights, plausible
surface wear, detailed weapon construction and readable enemy silhouettes.

The first playable milestone uses the existing Foundry campaign layout and
mechanics. It introduces generated surface textures, modern lighting, a Blender
pistol and hands, a Blender husk, architectural details, sampled audio and a
modern title/HUD. It is not the finished overhaul of all seven weapons and six
enemy species. Existing art remains for content outside the initial asset set.

## Invariants

- No simulation, balance, map-generation, campaign topology or network changes.
- Keep GEN_VERSION, hitboxes, aim, firing cadence, attack windups, progression
  and secrets intact. Cosmetic recoil never changes the aim camera.
- Art is produced offline. The game loads saved textures, GLBs and samples.
- Preserve editable Blender sources and asset-generation provenance.
- Use included Runway credits only; no trial, card, upgrade or purchase.
- Shared textures live in a cache; transient model clones own their geometry
  and material copies so existing disposal remains safe.

## Milestones

1. Establish branch, baseline and generated asset manifest.
2. Build and integrate the Foundry presentation slice with explicit loading.
3. Check gameplay, asset failures, repeated-session resource stability,
   desktop/mobile layout and normal-mode visual performance.
4. Open a draft PR and verify its real Netlify Deploy Preview.
5. Review the slice before expanding the rest of the roster and environments.

## Review protocol

Use fixed Foundry camera positions and the `?e2e=1` debug API for repeatable
screenshots. Run the original unit and E2E suites and add checks for the asset
contract and startup failures. Review normal mode as well: debug mode disables
antialiasing and forces DPR 1, so its performance is not a device benchmark.
Report download size, startup readiness and frame timings as measurements of
the tested environment, not universal performance guarantees.

Netlify is sufficient for solo visual/audio review. Arena regression tests use
the local Worker preview; do not connect this experiment to production arena
just to make the preview's multiplayer button work.

## First slice implementation

- Four saved base-color textures: concrete, steel, synthetic dermal surface and
  titanium. The menu uses a fifth generated concept image, labelled as concept
  art in its provenance rather than represented as a gameplay screenshot.
- Three Blender exports: pistol with hands, articulated husk and architectural
  kit. The game instances wall ribs, conduits and fixtures against the existing
  map walls. The kit also contains a service panel and floor grille for later
  dressing. Authoring sources and loader inspection live under `art/modern/`.
- Eight generated Runway MP3 recordings with unmodified source downloads,
  prompts and processing checksums. Playback is local WebAudio; players never
  contact a generation service. Other audio still has the original synth.
- ACES tone mapping, an environment map, a shadowed player light and four nearby
  practical lights; modern menu/HUD/touch presentation and portrait gun framing.
- Explicit resource boot gate, retry screen, gesture-time audio decoding and
  isolated per-instance GPU ownership. Architecture is grouped into 16m batches
  with frustum culling and shared geometry/material storage.

The sixteen runtime files total **4,742,926 bytes** before transport compression:
models 3,032,868; textures/concept 1,457,006; audio 253,052. The editable source
images, Blender files and inspection renders are checked into Git but are not
part of the browser download. The architecture GLB is 5,032 triangles, reduced
from the first 32,824-triangle export without changing module bounds.

## Local visual and performance evidence

`scripts/inspect-modern-art.mjs [baseURL] [outputDirectory]` captures deterministic
desktop/mobile screenshots using `?e2e=1`, plus asset sizes, boot timing and
render allocation counts. Its fixed-camera harness bypasses pointer lock;
normal-mode interaction checks separately exercise the real entry/exit flow.
The inspected Foundry topology hash is unchanged: `ee306bc5`.

`scripts/profile-modern-art.mjs [baseURL] [outputDirectory]` exercises normal
entry/exit controls, measures frame cadence and counts WebGL draw calls without
enabling the debug API. The captured report is `art/modern/review-performance.json`;
`art/modern/foundry-gameplay.png` is an actual game screenshot.

Normal-mode Chromium on the local Apple M5 Pro, after a 30-frame warmup and over
180 sampled frames at the initial Foundry spawn and after walking into combat:

| View | Render buffer | Mean fps | Frame p95 | Draws/frame | Triangles/frame |
| --- | --- | --- | --- | --- | --- |
| Desktop | 1280 × 800 | 60.00 | 16.7 ms | 421 | 477,384 |
| Desktop retina | 2560 × 1600 | 60.00 | 16.7 ms | 421 | 477,384 |
| Mobile emulation | 780 × 1688 | 60.00 | 16.7 ms | 394 | 466,562 |
| First combat room | 1280 × 800 | 60.00 | 16.8 ms | 628 | 607,236 |

These are measurements on a desktop GPU at two camera positions, not real-phone
or general combat performance guarantees. Normal mode enables antialiasing and
caps DPR at two. Actual phone testing and wider level/combat profiling remain
review work. The standard production-build warning about the large JavaScript
bundle remains; this first slice has no new runtime package dependencies.

## Remaining art passes at the first milestone (historical)

This early checklist is superseded by the complete roster/campaign expansion
recorded at the end of this document.

Review the playable slice before expanding the six remaining weapon models,
five remaining enemy families, arena player models, pickups and effects.
Character skinning, bespoke animation clips, character material maps and more
natural hands are unfinished. Environment composition outside the new Foundry
room pass remains unfinished, and collision geometry remains rectilinear. Current details and generated base-color
textures improve the presentation but do not constitute a finished photorealistic
overhaul. Campaign art distinctions also need a later pass: the first material
kit currently applies throughout the game.

## Second milestone: authored Foundry environment

The entrance, airlock and casting hall now load one original Blender environment
with 11m / 6.4m / 16m roof heights, galleries, skylights, trusses, utility piping
and suspended process vessels. The floor retains all 370 original cells and
side passages. Gallery decks and machinery are overhead scenery, not new cover
or routes; simulation geometry is unchanged.

A saved 2048² Cycles lightmap supplies static shadows and indirect light. Concrete
and steel have saved tangent normals and roughness maps baked from original
Blender material specimens; the existing generated base-color images are reused.
This is offline asset authoring, not an image-generation service reconstructing
physically correct maps from a photograph. Four soft skylight haze planes,
rebalanced local lighting and restrained desktop bloom complete the room pass.
Touch devices skip bloom. The weapon/HUD stays outside world postprocessing.

Source scenes, bake settings, rebuild commands, runtime checksums and actual
gameplay screenshots are under `art/modern/foundry-room/`. Six new runtime files
add 3,483,510 bytes; all 22 experimental assets total 8,226,436 bytes before
transport compression. No new package dependency, subscription or engine switch.

The milestone adds geometry/UV/unchanged-layout regression checks and browser
coverage for loading and recovering a failed lightmap. It does not rebake moving
doors or implement dynamic global illumination. The rest of the campaign still
uses the first milestone's environment kit. Character animation, the remaining
weapon/enemy roster, and broad real-device profiling remain future work.

Validation: 348 unit tests; all TypeScript projects and production build;
101 desktop/mobile Playwright passes and 13 intentional skips, zero retries.
Normal hardware-accelerated Chrome on Apple M5 Pro measured about 60 fps in
all four recorded views, p95 16.7–16.8 ms. The bundled Chromium functional runner
uses SwiftShader and is too slow for the normal-mode 30-second frame sample;
its failed profile is retained alongside the hardware results. See the room's
README and reports for exact counters and reproduction. Phones remain untested.


## Third milestone: entrance detail and material pass

The first doorway now has a generated weathered door texture and saved Blender
guard hardware attached to the original rising slab. The entrance and airlock
floor use a new generated worn-concrete texture. Bolted service cabinets,
ventilation louvers, clipped cables, lower wall cladding, matte lettering and
caged amber sconces add detail at player eye level. Reduced broad light fill,
rebaked local warm pools and a small runtime door practical improve contrast
without making the moving door a black silhouette.

All changes remain in saved art, rendering and validation. The simulation grid,
movement, door timing and original 6m × 4.32m slab dimensions are unchanged.
Geometry tests check low wall relief and moving hardware bounds; the browser
suite checks that the first door blocks, opens and allows passage into the hall.
No new cover, platform or route was introduced.

The complete art payload is now 10,075,650 bytes / 25 files, up 1,849,214 bytes.
Editable sources, exact imagegen prompts, checksums and actual closed/open-door
screenshots are under `art/modern/entrance/`. The previous screenshots remain
available for comparison. This pass keeps the existing pistol, hands and husk;
their model/animation improvements remain a separate subsequent milestone.


## Complete roster and campaign expansion — 2026-10-03

The user approved the remaining art pass in full. The unfinished-roster notes
above are historical milestone records. All seven weapons now use saved Blender
models with fitted hands and idle/equip/fire clips. All six enemy species use
skinned models with idle/walk/attack/hit/death clips. Saved pickup props and an
arena marine complete the dynamic set. Animation remains cosmetic and follows
existing simulation state/cooldowns; it does not move collision roots.

All seven campaign identities now use original saved modular architecture and
generated material specimens, with shallow eye-level relief and overhead detail.
There are 28 reusable modules in the shared kit. The authored Foundry opening
keeps its earlier geometry and lightmap. The rest of the campaign uses real-time
lighting; it does not have seven full bespoke lightmap bakes. New floor courses,
ceiling treatments and a generated overcast panorama complete this pass.

Saved transparent flash/smoke images replace the modern effect imagery. Desktop
adds modest half-resolution contact shading; touch keeps direct rendering. Twelve
new generated image files (nine surfaces, sky and two effects) retain exact prompts
and originals. Twenty-one new generated recordings and eleven documented edits
bring the pack to forty sound samples, covering all guns, species and feedback.

The complete runtime pack is 84 files / 26,803,216 bytes before transport
compression. Editable sources, scripts, prompts, provenance, checksums and actual
gameplay evidence are indexed in `art/modern/roster/README.md`. The 27-capture
review gallery includes every weapon on desktop/portrait, every campaign, and
all six positively identified enemy species. It is actual rendered gameplay,
not generated concept imagery.

All simulation/network/server code remains unchanged. GPU resource ownership
now includes cloned skeleton textures and animation mixers; animated parts use
outer-rig culling so a cached rest-pose sphere cannot hide moving limbs. Local
unit suite: 383 passed. Three TypeScript projects and production build pass.
Normal Chrome on Apple M5 Pro measures approximately 60 fps across the initial
four standard views, p95 16.7–16.8 ms. Final browser/hosted results are maintained
in STATUS.md. This remains a stylized original game with rectangular layouts and
reused modules, rather than photorealistic parity with the menu illustration.
