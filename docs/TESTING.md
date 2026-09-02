# TESTING

## Unit (vitest, `npm test`)

- `tests/unit/mapgen.test.ts` — 300-seed sweep: connectivity, guns ordered
  along the route, nothing essential behind the key door, key-before-lock,
  safe spawn (distance + no LOS + nothing wakes in 2s), door counts,
  courtyards/rooms/loot present, ammo economy ≥ 2.2× enemy HP, seed
  reproducibility, layout identical across difficulties.
- `tests/unit/weapons.test.ts` — personality contract: pistol accuracy,
  shotgun pellet scatter + falloff (including yaw-45° horizontal spread,
  8 pellets / ~5.7° cone), chaingun bloom, projectile identity
  (nails straight/fast, grenades arc), rail pierce, Seventh multi-kill splash,
  power ladder, dry-fire no-spam, starting stacks. Close crawler look-down
  hits / over-head and floor-in-front miss; playtest pose dist 3.2 at
  pitch 0 / −8° / −16° plus steep floor-under-body; husk at range; wisp
  torso vs above-head. `tests/unit/physics.test.ts` — 3D cylinder ray
  (not closest-XZ); lofted gun disc at those pitches; gun radius vs
  visible crawler.
- `tests/unit/sim.test.ts` — difficulty multipliers, determinism (snapshot
  equality over scripted input), wake conditions, no attacks through closed
  doors, dodgeable projectiles, death lockout, win path.
- `tests/unit/architecture.test.ts` — sim stays headless: no three imports,
  no Math.random, no DOM/window/localStorage, no imports from render/ui.
  Same purity walk covers `src/campaign` and `src/editor/model.ts`.
- `tests/unit/mapLog.test.ts` — prepend newest-first, cap 200 (drop oldest),
  parse missing/unknown fields, ignore quota errors via injected fake storage,
  refuse `campaign:` seeds, ignore poisoned log entries, campaign / editor /
  `#m=` are not loggable after a maze run.
- `tests/unit/blueprint.test.ts` — compile a tiny handmade map (connectivity,
  spawn-safe, gun-seal / key-seal), `Sim.fromMap` determinism, easy-vs-hard
  positions identical with different HP.
- `tests/unit/mapcodec.test.ts` — binary round-trip including 60+ enemies,
  maze-sized payload ≲ 2 KB, zlib deflate-raw when the body is large,
  title truncated at 255 UTF-8 bytes (emoji-heavy round-trip).
- `tests/unit/campaign.test.ts` — all 7 DSLs compile + validate + economy
  floor; map 1 shotgun unseals; map 6 key unseals (guns do not); loadout
  carry; retry restores entry loadout; key does not persist; continue key;
  unlock rules (map 1 open, N unlocks N+1, replay does not rewind).
- `tests/unit/editor.test.ts` — new maps include a START room that cannot
  be erased; stamp rooms + L-link + gun + enemies compiles / encodes /
  decodes / validates; erase will not drop the only start; economy
  warning is non-blocking; library upsert/cap/quota; START-only WIPs still
  encode `SGMAP.v1.` despite VALIDATE errors.
- `tests/unit/sim.test.ts` — also visual LOS: opening a door reveals
  immediately while collision still waits for `offset >= 0.65`.
- `tests/unit/campaignArt.test.ts` — `campaignArtIdFromIndex(1)==='foundry'`,
  seed parse (`campaign:01-foundry` / maze seeds ignored), cached
  `getCampaignTextures` returns surfaces + extraDecals, placement is
  per-map and does not mutate `GameMap.decors`. Hero plates from
  `CAMPAIGN_HERO_MARKERS` land via hint (arena-back-wall / pit-floor-idol /
  apse-altar). `resolveHeroDecals` prefers `lib.heroDecals`, then sibling
  `CAMPAIGN_HERO_DECALS`, then `getCampaignHeroDecals()`; empty pack field
  is a no-op.
- `tests/unit/campaignTextures.test.ts` — Opus pack markers, extraDecal
  ids, 29 hero plates, maze `textures.ts` untouched.
- `tests/unit/enemyFeel.test.ts` — living bodies block the player (ragdolls
  do not), gunshot / death-cry wake within `noiseHearRadius` and not across
  the whole 88×88 map, `NOISE_TTL` is not a 0.2s blink, Fiend is campaign-only
  (`generateMap` never places one; Pit / Ward / Sanctum do, Foundry does not)
  while the blueprint validator still accepts `fiend` for authored maps.
- `tests/unit/enemyArt.test.ts` — a texture is painted and cached for every
  skin including the fiend; per-species palette rules asserted against the source.

E2E specs are excluded from vitest (see `vitest.config.ts`).

## E2E (playwright, `npm run test:e2e`)

Projects: `desktop` (chromium 1280×800) and `mobile` (chromium 390×844,
touch). The config builds and serves `dist/` via `vite preview` itself.

Covered: boot to title, start run, WASD walking (camera-relative), fire +
ammo decrease, dry-fire no-spam, gun pickup grants gun + stack, medikit
heals, death lockout then title with Retry Seed / New Maze, win copy
"GAME OVER / You won", difficulty economy (same layout, different counts),
seed reproducibility (map hash), killed enemies upright when a seed is
replayed (rig-reuse regression, checks rig `rotX` via `debugInfo`), Tab map
open/close with fog of war, E opens a door, MAP LOG records a quit and
PLAY replays the same seed, authored map via `startMap` / `#m=` with
RETRY MAP + COPY LINK, CAMPAIGN begin / startCampaign(n) / death retry /
continue after completeMap, campaign screen lists 7 named maps and
winning map 1 unlocks map 2, completing map 7 shows THE SEVENTH IS SILENT,
campaign SKILL does not start a maze, Foundry does not log `campaign:` seeds,
maze / `#m=` `state().campaign` is null (campaign has artId), quit-to-title MAP LOG hides HEALTH/minimap, editor `?edit=1` chrome + visible canvas +
START room + `loadBlueprint` / PLAYTEST, COPY LINK on a START-only invalid map emits `SGMAP` / `#m=`, mobile touch HUD with ≥44px FIRE
button (title panel still fits 390×844 with MAP LOG + CAMPAIGN + EDITOR),
FIRE latches and unlatches, playtest crawler pose (dist 3.2, look 0/−16, `shoot()` hit).

Rules honored: never drive pointer lock with synthetic mousemove — everything
goes through `window.__GAME__` (only present with `?e2e=1`; production
builds don't advertise it).

## Visual review (done before calling this done)

Method: run the built game in a real browser, `?e2e=1` debug API poses the
scene (`pose`, `snapshot` returns a composited JPEG), plus real DOM
screenshots for screens/touch UI.

- AI-vision pass (before the analyzer went down): world/HUD/lighting,
  pistol viewmodel (hands visible, muzzle flash, crosshair clear), husk
  (proper 3D zombie, face forward), slab (hulking 3D brute), wisp (glowing
  hovering creature), wall decorations (skull + rune decals on panels).
- Pixel-metric pass (analyzer outage fallback, `PIL`):
  - crosshair clearance, all 7 guns: ≤1.3% non-background px in the 88px
    center disc (excluding the crosshair strokes themselves);
  - muzzle flash, all 7 guns: idle-vs-fire diff regions 36–60k px with
    per-gun magnitude ordering (pistol small, shotgun/Seventh huge);
  - crawler: silhouette spans 100% of the pose region (legs reach floor);
  - door: glowing rune ring ≈3.2k orange px; pedestal: cyan rim ≈320 px;
  - mobile portrait: HUD band present, hFOV not a slit (29 edge columns in
    a mid band), FIRE button ≈6.7k dark-red px.

Re-run the aesthetic eyeball pass on the Netlify deploy preview; the metrics
prove presence/clearance, not beauty.
