# STATUS

Updated: 2026-08-31 (M1 complete)

## Now

- M1 (sim foundation) DONE: deterministic mapgen + combat + AI + loot +
  difficulty, 32/32 unit tests green, strict typecheck clean.
- Next: M2 renderer (textures → world mesh → enemies → viewmodels → audio →
  HUD → input), then e2e + visual review.

## Verified

- `npm test` → 32 passed (includes 300-seed mapgen sweep).
- `tsc --noEmit` clean.

## Known gaps / TODO

- No renderer yet (game not yet visible/runnable in a browser).
- Playwright not installed/configured yet.
- Balance numbers are first-pass; tune after playtesting sweep.
