# Netlify full-art verification

Verified implementation commit `4cb3253753f16bda08c92ba9a87e147c0c8779f4` on
draft PR #32, `codex/experimental-modern-art`:
<https://deploy-preview-32--seventh-gun.netlify.app/>.

- `assets.json`: all 84 runtime files, 26,803,216 bytes, match local SHA-256 values.
- `performance/report.json`: desktop, Retina, touch emulation and the first combat
  hall pass normal entry/pause/quit controls; approximately 60 fps, p95 16.7–16.8 ms
  on installed Chrome / Apple M5 Pro / Metal, with no game errors.
- `review/gallery.html`: 27 actual hosted captures covering seven weapons on both
  layouts, seven campaign rooms and six positively identified species.
- `review/report.json`: all 84 resources load per device, no game errors or asset
  misses; all seven map hashes match the local review. Foundry is `ee306bc5`.

The Netlify toolbar is visible in hosted screenshots. Its blocked Segment/Bugsnag
telemetry is recorded separately. An initial visual-harness navigation timed out
waiting for all network traffic to stop; the successful rerun waits for DOM load,
the actual game API and enabled play button instead.

Visual review uses fixed cameras/frozen AI via the existing debug API. Normal
profiles do not expose that API. Neither establishes physical-phone/Safari
performance, GPU headroom, or worst-case full-map traversal. Nothing was merged,
tagged, released or deployed to production. Main remains `8bf93b3`.
