# AGENT VISIBILITY — what a bot can read, and why

Seventh Gun is a canvas and a 900 kB bundle. To a search engine, a link
unfurl, or an assistant answering "what browser FPS can I play right now", it
was an empty page called SEVENTH GUN. Everything a human learns from the title
screen, this repo, or `docs/GAME-DESIGN.md` was invisible.

This file records the fix and the rules that keep it working. It is not a
marketing strategy document; it is the maintenance contract.

## Three layers, in order of payoff

1. **Text that exists without JavaScript.** `/about/`, `/guide/`, `/faq/`,
   `/press/`, `/changelog/`, `/api/` are plain HTML in `public/`. They are
   copied verbatim into `dist/client`, so every target (Worker, Netlify,
   portable tarball) serves them with no route, no build step and no JS. They
   are the only reason an agent can describe the game at all.
2. **Discovery plumbing.** `public/robots.txt` states a crawl policy and names
   the retrieval bots explicitly; `public/sitemap.xml` lists the pages;
   `index.html` carries a description, canonical, OG/Twitter cards and
   `VideoGame` JSON-LD; `public/og.png` is the unfurl card.
3. **A read-only API.** `/api/maze`, `/api/maps`, `/api/share` in
   `server/api.ts`. Bots cannot play the game, but they can read a maze: room
   list, enemy mix, gun order, ASCII floorplan. This is the only layer that is
   specific to *this* game rather than generic web hygiene.

`public/llms.txt` is also there, and it is deliberately not advertised as a
lever: adoption is about one site in ten, crawler interest in the file is
negligible, and Google has said it is not a signal. It costs one file and it
helps coding agents read the repo's site index, which is all it is claimed to
do here.

## The SPA fallback trap

`wrangler.jsonc` sets `not_found_handling: "single-page-application"`, so any
unmatched path returns the game HTML at status 200. Before this work that
included `/robots.txt`, `/sitemap.xml` and `/llms.txt` — a crawler asking for
a policy got a web page, which is worse than a 404 because only the content
type reveals the failure.

Files in `public/` win over the fallback. Dynamic endpoints do not, which is
why `run_worker_first` lists the three API routes by name. **Adding a route to
`API_ROUTES` without adding it to `run_worker_first` makes it 404 as a missing
asset.** `/api/` itself is intentionally not listed: it is the HTML docs page
and must keep coming from assets.

## Two hosts

- `seventhgun.com` — the production Worker (`seventh-gun`), custom domain set
  in the Cloudflare dashboard, no routes in the config.
- `art.seventhgun.com` — a separate Worker (`seventh-gun-art`) deployed only
  from `codex/experimental-modern-art`, a branch that is never merged.

On `main` the canonical points at `seventhgun.com`, and `sameAs` lists the art
host as an alternative. The art branch should, when it is next touched, carry
its own `description` and `og:title` and either drop the canonical or point it
at itself — two hosts serving identical text with one canonical is correct,
two hosts with no canonical compete for the same query.

The art build also needs the `public/` text pages and robots/sitemap copied or
kept in sync; they are not, today, because the branch predates them.

## Verifying

Against a dev Worker (`npx wrangler dev --port 8787 --local`):

```bash
curl -s -o /dev/null -w '%{http_code} %{content_type}\n' localhost:8787/robots.txt
curl -s localhost:8787/api/maps | head -20
curl -s 'localhost:8787/api/maze?seed=nightjar&difficulty=hard' | head -40
node scripts/smoke-deployment.mjs http://localhost:8787
```

The smoke script is the gate: it fails if `robots.txt` is not `text/plain`
with a `Sitemap:` line, if `/api/maps` does not return seven maps, or if
`/api/maze` returns no floorplan — alongside the asset and arena checks it
already did. Watch for this when a route is renamed.

After a deploy, the same commands against `https://seventhgun.com`, plus:

```bash
curl -sI https://seventhgun.com/about/ | head -5
curl -s https://seventhgun.com/sitemap.xml | grep -c '<loc>'
```

Outside the repo, the remaining check is the one that actually matters: ask
three assistants "a free browser FPS I can play right now" and see whether the
description they give is right.

## Maintenance rules

- **Numbers must stay true to `docs/GAME-DESIGN.md`.** The pages state enemy
  counts, damage, rates and run length. An agent will quote them verbatim, and
  a wrong number is worse than no number.
- **`/api/maps` reads the seven JSON DSL files, not the compiled maps.** It
  reports identity and flavour only. Do not add counts here without compiling
  through `compileDsl`, or the API will disagree with the game.
- **Regenerate `public/og.png`** from `scripts/social/og-card.html` when the
  tagline changes; the exact Chrome command is in that file's header comment.
- **Keep the title-screen links and the pre-boot `#intro` links in sync**
  (`src/ui/screens.ts` and `index.html`). They are the only crawl path from
  the game to the text.
- **The API is GET-only and read-only.** Anything mutable belongs to the arena
  route, not here.

## Not done, on purpose

- **WebMCP.** A Chrome origin trial, Chromium-only, API changed twice in 2026.
  Not worth maintenance for a game whose core action is aiming a gun.
- **An MCP server.** `/api/*` is the same data over plain HTTP. Add MCP when
  something concrete needs callable tools, not before.
- **Markdown content negotiation** (`Accept: text/markdown`). The text pages
  are already static HTML; there is nothing to negotiate away.
- **Blocking AI crawlers.** The source is MIT and public on GitHub, so
  blocking training costs citations and protects nothing.
