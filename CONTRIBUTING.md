# Contributing

Thanks for looking. This is a small, opinionated project — a seeded 90s-style
FPS where *everything* is generated from a seed. The rules below mostly exist to
keep that property true.

## Getting set up

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # unit suite
npm run test:e2e     # playwright (desktop + mobile projects)
```

Node 22+. `npm run build:dist && node bin/seventh-gun.mjs` runs the self-host
server locally if you are working on multiplayer.

## The rules that matter

- **No assets.** No image files, no audio files, no fonts, no models. Textures
  are drawn to a canvas, meshes are built from primitives, sounds are synthesized
  in WebAudio. A PR that adds a `.png` of a demon will be declined, however good
  the demon is.
- **The sim stays pure.** `src/sim/` must never import three.js, touch the DOM,
  or call `Math.random`. `tests/unit/architecture.test.ts` enforces this.
- **Seeds are a contract.** If you change world generation, bump `GEN_VERSION`
  in `src/sim/types.ts` and keep the 300-seed sweep green. Same seed + version +
  difficulty must produce an identical world, forever.
- **Balance numbers live in one place** — `src/sim/weapons.ts`,
  `enemyTypes.ts`, `difficulty.ts` — and are mirrored in `docs/GAME-DESIGN.md`.
  Change both.
- **The arena room stays runtime-agnostic.** `server/room.ts` takes its clock,
  seed source and scheduler by injection. That is the only reason the same room
  runs on both Cloudflare Workers and plain Node. Cloudflare specifics belong in
  `server/index.ts`, Node specifics in `server/node/`.

## Pull requests

Branch, then open a PR. Run typecheck, unit tests, and the relevant browser
tests before requesting review. Production deployment runs from `main`; this
repository does not currently enforce branch protection rules. Conventional-ish
commit subjects (`feat:`, `fix:`, `test:`, `docs:`).

New behaviour wants a test. Renderer and audio work is harder to test; a short
note in the PR on what you checked by hand is fine there.

## Reporting bugs

Include the **seed** and difficulty — with those, anyone can reproduce your exact
world. The title screen's MAP LOG remembers seeds you have played.

By contributing you agree your work is licensed under the [MIT License](LICENSE).
