# DECISIONS

Unspecified things got decided; this is the record.

- **Title**: *SEVENTH GUN* — the win condition is literally finding the 7th
  gun; the name teaches the objective.
- **Stack**: Vite 6 + TypeScript strict + Three.js (Lambert/Basic materials,
  no shadow maps — blob shadows only), Vitest, Playwright.
- **Sim/render split**: hard boundary, sim is pure TS. See ARCHITECTURE.
- **Geometry**: 88×88 cells, CELL=2u, corridors 3 cells wide, walls 6u tall,
  indoor ceilings at 4.2u, courtyards open to a sky dome.
- **Doors**: 2–3 per map, slide UP. At most one key door, and it only guards a
  bonus vault spur — the arena path can never soft-lock.
- **Arena**: sealed by an energy barrier that shatters when gun 7 is picked up
  (in the antechamber). Clearing the arena wins.
- **No reload/no magazine mechanic**: ammo is a pool per type (non-goal says
  no reload). "Usable magazine" = generous starting pool (pistol 70).
- **Ammo types**: bullets (pistol+chaingun), shells, nails, grenades, cores,
  void — one pool per gun except the shared bullets.
- **Self-splash damage**: 20–25% on grenades/void — personality, kept low.
- **Enemy pathing**: A* with 0.55–0.85s staggered repaths; enemies never open
  doors; doors + seal block LOS, hitscan, projectiles, AND rendering.
- **Sprites vs meshes**: meshes. The brief's sprite requirements (5-view
  frames, octant hysteresis) are a fallback we don't need.
- **iOS audio**: WebAudio unlocked on first gesture;
  `navigator.audioSession.type='playback'` guarded try/catch.
- **Mobile look**: right-half drag; FIRE is a hold button that unlatches on
  touchend; portrait widens vertical FOV to hold hFOV ≈ 88°.
- **Death**: 2s no-controls lockout → title menu offers Retry Seed / New Maze.
- **Epitaphs**: yes, on the death screen (render-side flavor only).
- **Difficulty**: multiplier table in `src/sim/difficulty.ts`; layout identical,
  economy scales. Normal is reference.
- **Netlify**: `netlify.toml`, publish `dist/`, deploy previews verified before
  merge via Netlify CLI once the owner enables the site.
- **No remote yet**: repo is local until the owner wires GitHub/Netlify; use
  `gh` for PRs after the first playable slice.
