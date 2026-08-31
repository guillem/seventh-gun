# ROADMAP

## M1 — foundation (done)
- Repo scaffold, Vite+TS+Three, netlify config, docs skeleton.
- Deterministic sim: seeded mapgen (spine+spurs+arena+seal+key vault),
  7 weapons, 5 enemy types, AI (sight/hearing/proximity, doors block LOS),
  projectiles/splash, pickups, win/lose, difficulty table.
- Unit tests: 300-seed mapgen sweep, weapon personalities, determinism,
  architecture guards.

## M2 — playable slice
- Renderer: procedural textures (4 themes), merged world mesh with baked
  vertex light, doors, seal, decorations, sky.
- Enemy meshes with walk/attack/pain/death animation + blob shadows.
- HUD (health bar, ammo, 7-slot strip), minimap, fog-of-war full map.
- Title/pause/death/victory screens; pointer lock; WASD; E; wheel/1-7.
- Synth audio: per-gun SFX, enemy voices, stings, ambient drone.

## M3 — polish + ship
- Viewmodel quality pass (7 distinct silhouettes, muzzle FX, crosshair
  clearance verified by screenshot).
- Touch controls + portrait FOV; mobile Playwright project.
- E2E suite green; balance sweep; visual review; docs current; Netlify.
