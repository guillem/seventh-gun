# Normal campaign entry performance

Run with `PROFILE_CAMPAIGNS=1 PLAYWRIGHT_CHANNEL=chrome node
scripts/profile-modern-art.mjs http://127.0.0.1:5175
art/modern/roster/campaign-performance` from the repository root.

All seven maps were selected through normal menus on desktop and portrait touch
layouts. Each isolated context unlocks selection in its own local storage. Menu
labels and the text drawn on the HUD confirm map identity; the debug API is absent.
Pause/resume/quit checks pass with no game errors. All fourteen entry views hold
approximately 60 fps, p95 16.7–16.8 ms, on Chrome / Apple M5 Pro / Metal.

These 180-frame samples measure refresh-limited frame cadence at entry views,
not GPU headroom, full-map traversal, worst-case fights, or physical phones.
See `report.json` for individual timings, draw/triangle counts and limitations.
