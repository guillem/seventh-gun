# STATUS

Updated: 2026-09-02 — PR: Opus review fixes (P0 campaign SKILL / map-log leak,
hitscan spread, purity, codec, pause). Do not merge from this agent.

`npx tsc --noEmit` clean. `npm test` 156/156 (300-seed sweep green).
`npm run test:e2e` 63 passed / 3 skipped. `GEN_VERSION` still 4. Maze
`generateMap` is behavior-identical (dead `kind==='vault'` count bump never fired; unused `placeAnnex` rng / `tryDoor`
axis / `ENEMIES` import removed without touching the layout stream).
`dirs.sort(() => rng.float() - 0.5)` in mapgen and cosmetics.ts left as-is
(Fisher-Yates in cosmetics would risk desyncing baked campaign lights).

## State: Opus review P0–P2

### P0 — setDifficulty / map log / campaign art leak

After any run, `phase==='title' && this.sim` stayed true on the campaign
panel, so SKILL called `startRun` and could persist `campaign:01-foundry`
then paint a maze with Foundry art.

- Title SKILL (`#diff-row`) rebuilds a maze only when `runKind==='maze'`.
  Campaign SKILL only stores difficulty. `playCampaignMap` /
  `continueCampaign` use `applyDifficulty` (no maze restart).
- `prependMapLog` / loader refuse seeds starting with `campaign:`.
  Campaign, editor playtest, and `#m=` still set `runLog = null`.
- Renderer/world apply campaign packs only when `artId` is passed
  (`runKind==='campaign'`). Seed-string fallback is gone.

### P1

- Hitscan spread basis matches projectiles: `rightZ = -dirX` (shotgun at
  yaw 45° now has horizontal pellet spread). Cone still 8× ~5.7°.
- Architecture purity walk covers `src/campaign` and `src/editor/model.ts`.
- Map-log invariant tests: campaign / editor / `#m=` are not loggable.

### P2

- Pause hint “the key opens the vault, never the arena” is maze-only.
- Full-map legend colors the objective gun from `sim.map.sealBreak`.
- `InputManager.paused` is set from Game pause/resume (blur while paused
  stays paused). Dead `mapOpen` removed.
- Share/export uses async `encodeShareCode` (deflate-raw). `Writer.str`
  truncates UTF-8 bytes to 255.
- Dead exports removed (`generatorChanged`, `planHeroPlacement`,
  `ENEMY_ORDER`, `hashString`, `worldToCell`, `worldCellCenter`,
  `isMapLogOpen`, `isCampaignOpen`, unused `bindTitle.openEditor`).
  `ECONOMY_FLOOR` lives in `src/sim/types.ts`. `compileDsl` dropped the
  trailing `validateBlueprint` (always `[]` after a successful compile).
  Unreachable `PLAYER_EYE` check in `enemySolidVsPlayer` deleted.

## Open / next

- Balance still wants a human Normal run against the maze 20–30 min target.

## Where things are

- Balance numbers: `src/sim/{weapons,enemyTypes,difficulty}.ts` + GAME-DESIGN.md
- Generator: `src/sim/mapgen.ts` (bump `GEN_VERSION` on any change)
- Campaign: `src/campaign/` + `src/app/campaignProgress.ts`
- Campaign art: `src/render/campaignTextures.ts` + `src/render/campaignDecor.ts`
  (hooked from `world.ts` / `renderer.ts` / `game.ts`; campaign-only)
- Enemy skins: `src/render/textures.ts`; bolt sprites: `src/render/projectiles.ts`
- Enemy meshes / collision: `src/render/enemies.ts` + `src/sim/{physics,sim,enemyTypes}.ts`
- Map log: `src/app/mapLog.ts` + title wiring in `src/ui/screens.ts` / `src/app/game.ts`
- Editor: `src/editor/{model,view,library}.ts` — title EDITOR / `?edit=1`
- Debug API: `src/app/game.ts getDebugApi()` — `?e2e=1` only
