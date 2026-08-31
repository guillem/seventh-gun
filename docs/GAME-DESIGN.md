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
  the antechamber; picking it up shatters the arena seal.

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

All projectiles are dodgeable; aim error scales with distance (×0.55–2.2 of
per-type accuracy) and difficulty. Sight: 18–28u range, ~100–150° cone.
Hearing: gunshots wake enemies within loudness (18–40u per gun) + margin.
Proximity wake 4–6u. Closed doors and the seal block LOS, hitscan,
projectiles AND rendering. Enemies path by A* (4-dir, staggered repaths),
never open doors.

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
