# GAME DESIGN — the actual numbers

Single source of truth: `src/sim/weapons.ts`, `src/sim/enemyTypes.ts`,
`src/sim/difficulty.ts`, `src/sim/mapgen.ts`. This file mirrors them.

## Player

- HP 100, eye height 1.7u, radius 0.55u, speed 6.5 u/s (no sprint/jump/crouch).
- Fixed timestep 1/60. Cell = 2u. Corridors 3 cells (6u) wide. Walls 6u,
  indoor ceilings 4.2u, courtyards open to the sky dome.

## Map economy (Normal)

- 88×88 cells. Spine of 12–14 rooms + arena (15×13..16×14) + antechamber +
  3–4 loot spurs + up to 2 alternate links. 2–3 doors, ≤1 locked (vault spur
  only — the arena is never key-gated). 2–3 courtyards. 55–75 enemies.
  Guns 2–6 spaced along the route (BFS order, strictly increasing), gun 7 in
  the antechamber; picking it up shatters the arena seal
  (`sealBreak: { type:'gun', gun:7 }`). Authored / URL maps may unseal with
  a different gun or the Bone Key; they do not re-roll enemy counts from
  difficulty.

## The seven guns (Normal base damage; outgoing scaled by difficulty)

| # | Name | Ammo | Damage | Rate | Personality |
|---|------|------|--------|------|-------------|
| 1 | Viper Pistol | bullets | 13 | 3.3/s | perfect accuracy hitscan, snappy crack |
| 2 | Ripjaw Shotgun | shells | 8×9 | 0.95/s | 8 pellets, 5.7° cone, falloff 8→26u (→20%), huge boom |
| 3 | Hornet Chaingun | bullets | 8 | 10.5/s | bloom 0.02→0.105 rad over 1.3s hold, spinning barrels |
| 4 | Spiker | nails | 17 | 4.5/s | 34 u/s nail projectiles, slight spread |
| 5 | Bile Launcher | grenades | 90 splash | 0.87/s | arcing grenades (g=22), 5u blast, 25% self |
| 6 | Sunlance | cores | 130 | 0.95/s | piercing hitscan beam, bright movie-laser |
| 7 | The Seventh | void | 160 splash | 0.74/s | slow 17 u/s void orb, 8u blast, multi-kill, 20% self |

Ammo pools/max: bullets 300, shells 60, nails 220, grenades 30, cores 24,
void 12. Pickup stacks: 70/16/90/70/8/10/5. Boxes: 45/8/35/3/4/1.
Start: pistol + 70 bullets.

## Enemies (Normal)

| Type | HP | Speed | Attack | Damage | Notes |
|------|----|-------|--------|--------|-------|
| Husk | 30 | 3.4 | plasma 15 u/s | 8 | first fight fodder, 1.5s interval |
| Crawler | 18 | 5.2 | spit burst ×2 | 5×2 | fast, 7.5u range — shotgun bait |
| Slab | 110 | 2.3 | fireball 11 u/s | 20 + 2.6u splash | brute, 2.2s interval |
| Wisp | 34 | 4.6 | bolt burst ×3 | 6×3 | hovers at 2.3u, strafes |
| Hierophant | 170 | 3.4 | orb burst ×3 | 12×3 | elite, 2.4s interval |
| Fiend | 240 | 2.7 | fireball burst ×2 | 16×2 + 1.8u splash | campaign-only (Pit / Ward / Sanctum) |

Living enemies are solid cylinders (`def.radius` + player radius 0.55u);
death ragdolls are not. Flying wisps still collide in XZ, because their
hover volume (`[1.75, 2.85]`) overlaps the player's body column
(`0 .. PLAYER_HEIGHT`) — the eye at 1.7u sits just under it.
Gun tests (hitscan and player projectiles) use `enemyGunRadius` /
`enemyGunVolumeY` so the crawler's visible mesh (legs / abdomen / head
overhanging `def.radius` 0.5) still counts. At close range (≤6u) the
grounded gun slab lofts to eye height: a level or shallow look-down
at a crawler 3.2u ahead connects even when the crosshair sits on the
wall above the body. Gameplay fire uses `aimDirFromLook` (positive pitch = look-down,
`dirY = −sin(pitch)`). `look(0, 22)` at dist 3.2 hits y≈0.5. Walls still
occlude; the floor plane does not eat a look-down that already has the
body in view.
Wisp volume is centered on `hoverY` (visible torso), not stacked above
the head.

All projectiles are dodgeable; aim error scales with distance (×0.55–2.2 of
per-type accuracy) and difficulty. Sight: 18–28u range, ~100–150° cone.
Hearing: gunshots (hitscan and projectile) and death-cries last 1.6s.
Hear distance is `loudness * 0.45 + hearRange` — same room / adjacent
corridor, not the whole 88×88 map. Proximity wake 4–6u. Closed doors and
the seal block LOS, hitscan, projectiles AND rendering. Enemies path by A*
(4-dir, staggered repaths), never open doors.

Arena wave (Normal): 2 hierophants, 3 slabs, 4 crawlers, 3 husks, 2 wisps.

## Difficulty multipliers

| | Easy | Normal | Hard |
|---|---|---|---|
| enemy HP | 0.75 | 1 | 1.3 |
| enemy damage | 0.6 | 1 | 1.4 |
| enemy speed | 0.9 | 1 | 1.1 |
| enemy accuracy (spread) | 1.7 | 1 | 0.75 |
| reaction time | 1.6 | 1 | 0.7 |
| enemy count | 0.72 | 1 | 1.22 |
| player damage out | 1.35 | 1 | 0.85 |
| medikit count / heal | 1.5 / 35 | 1 / 25 | 0.75 / 18 |
| ammo amount | 1.35 | 1 | 0.85 |

Layout (rooms/corridors/doors/gun spots) is identical across difficulties;
only the economy changes (unit-tested).

## Run shape

Normal targets ~20–30 min: ~17 rooms, ~65 enemies + 14-arena wave,
medikit ≈ 0.75/room, ammo ≈ 1.15 boxes/room. Economy test guarantees
available damage ≥ 2.2× total enemy HP across a 300-seed sweep.

## Campaign (seven maps)

One authored campaign. The campaign screen lists all seven maps by name.
Map 1 is always playable; map N unlocks after winning N−1. Clicking an
unlocked map starts it with the incoming loadout below; CONTINUE uses the
carried guns/ammo. Difficulty scales combat numbers only (same as
`Sim.fromMap`), not enemy counts or ammo amounts. Incoming loadout is the
retry snapshot; HP = 100 at each map start; the key does not persist.
Fiends (campaign-only) are stamped on later maps (Pit / Ward / Sanctum),
never Foundry, and never by `generateMap`.

| Map | Title | Enter with | Unseal / new gun |
|---|---|---|---|
| 1 | THE FOUNDRY | pistol | shotgun |
| 2 | THE GULLET | 1–2 | chaingun |
| 3 | THE CATACOMBS | 1–3 | spiker |
| 4 | THE PIT | 1–4 | bile launcher |
| 5 | THE SPIRE | 1–5 | sunlance |
| 6 | THE WARD | 1–6 | Bone Key (no new gun) |
| 7 | THE SANCTUM | 1–6 | The Seventh |

Campaign economy: incoming reference ammo + this map's pickups ≥ 2.2×
total enemy HP on Normal, counting owned guns plus the gun this map awards
(map 6: guns 1–6 only). Later maps may include Fiends; incoming loadouts
are unchanged.
