# STATUS

Updated: 2026-09-02 — PR: enemy feel (body collision, sound wake, meshes, Fiend).
Do not merge from this agent.

`npx tsc --noEmit` clean. `npm test` 123/123. `npm run test:e2e` 55 passed / 3 skipped.
`GEN_VERSION` still 4. Maze `generateMap` is unchanged (no Fiend in the maze).
Mobile FIRE ≥44px (e2e).

## State: player-feel pass on enemies

- Living enemies are solid cylinders vs the player (`PLAYER_RADIUS` + `def.radius`).
  Death ragdolls are not. Flying wisps still collide in XZ when the eye overlaps
  their volume.
- Gunshots (hitscan + projectile) and death-cries emit `lastNoise` for
  `NOISE_TTL` 1.6s. Hear distance is `loudness * 0.45 + hearRange`.
- Wisp hurtbox is centered on `hoverY` (visible torso), not above the head.
- Slab mesh rebuilt as a plated brute (no chest-sphere pair). Husk/hierophant
  silhouettes got extra mesh detail. Crawler/wisp meshes untouched.
- Enemy projectiles (plasma/spit/fireball/bolt/orb) use bolts/core+corona, not
  a naked sphere. Sim `projRadius` unchanged.
- New campaign-only type `fiend` (HP 240). Stamped 1–2 on Pit / Ward / Sanctum
  only. Validator allowlist includes it; maze never places it.

Campaign art from #10 is on `main`: maze / `#m=` still use `getTextures()`;
campaign runs swap packs via `getCampaignTextures(artId)`.

## Open / next

- Balance still wants a human Normal run against the maze 20–30 min target.

## Where things are

- Balance numbers: `src/sim/{weapons,enemyTypes,difficulty}.ts` + GAME-DESIGN.md
- Generator: `src/sim/mapgen.ts` (bump `GEN_VERSION` on any change)
- Campaign: `src/campaign/` + `src/app/campaignProgress.ts`
- Campaign art: `src/render/campaignTextures.ts` + `src/render/campaignDecor.ts`
  (hooked from `world.ts` / `renderer.ts` / `game.ts`)
- Map log: `src/app/mapLog.ts` + title wiring in `src/ui/screens.ts` / `src/app/game.ts`
- Editor: `src/editor/{model,view,library}.ts` — title EDITOR / `?edit=1`
- Debug API: `src/app/game.ts getDebugApi()` — `?e2e=1` only
