// Read-only JSON views of data the client already computes offline.
//
// A browser agent cannot play a WebGL first-person shooter, but it can read a
// maze. These endpoints turn a seed into prose-shaped data: room list, enemy
// mix, gun order, and an ASCII floorplan. That lets an assistant describe a
// specific run, compare seeds, or hand a player a link instead of inventing
// one.
//
// Rules for anything added here:
//   * GET only, no auth, no cookies, no writes. The arena is the only mutable
//     surface and it stays behind its own route.
//   * Pure functions of the request. Everything is derived from simulate-only
//     code in src/sim, so responses are deterministic and cacheable.
//   * Validate inputs before calling the generator: seed strings and
//     difficulty names come from the open internet.

import { generateMap, mapStats } from '../src/sim/mapgen';
import { DIFFICULTY_ORDER, DIFFICULTIES } from '../src/sim/difficulty';
import { CELL, GEN_VERSION, GRID_H, GRID_W } from '../src/sim/types';
import type { Difficulty, GameMap } from '../src/sim/types';

import foundry from '../src/campaign/maps/01-foundry.json';
import gullet from '../src/campaign/maps/02-gullet.json';
import catacombs from '../src/campaign/maps/03-catacombs.json';
import pit from '../src/campaign/maps/04-pit.json';
import spire from '../src/campaign/maps/05-spire.json';
import ward from '../src/campaign/maps/06-ward.json';
import sanctum from '../src/campaign/maps/07-sanctum.json';

/** Every route this module answers. Kept in one place so wrangler.jsonc's
 *  run_worker_first list and the docs page cannot drift from the code. */
export const API_ROUTES = ['/api/maze', '/api/maps', '/api/share'] as const;

const MAX_SEED = 64;
const DEFAULT_SEED = 'nightjar';

// The authored DSLs, not the compiled maps: /api/maps only needs identity and
// flavour, and compiling seven maps on every cold start to print a table of
// titles would be waste. Anything numeric belongs to /api/maze, which derives
// it from the generator.
// Widened to the fields this endpoint reads: the seven JSON files are not
// structurally identical (the last map has no intermission block), and the
// union of their literal types makes property access fail.
interface CampaignMeta {
  id: string;
  title: string;
  subtitle?: string;
  themeDefault?: string;
  intermission?: string[];
}

const CAMPAIGN_SOURCES: readonly CampaignMeta[] = [
  foundry, gullet, catacombs, pit, spire, ward, sanctum,
];

/** JSON headers shared by every endpoint. s-maxage lets Cloudflare cache the
 *  deterministic responses at the edge; max-age is deliberately short because
 *  a browser should not hold a seed's layout past a game version bump. */
function jsonHeaders(ttl: number): Headers {
  return new Headers({
    'content-type': 'application/json; charset=utf-8',
    'cache-control': `public, max-age=60, s-maxage=${ttl}`,
    // The whole point is for agents and third-party tools to read this.
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, OPTIONS',
    'x-content-type-options': 'nosniff',
  });
}

function json(body: unknown, status: number, ttl: number): Response {
  return new Response(JSON.stringify(body, null, 2), { status, headers: jsonHeaders(ttl) });
}

function problem(status: number, message: string): Response {
  return json({ error: message }, status, 0);
}

/**
 * Seeds are free text in the UI, so anything that survives transport is
 * allowed — except what would make a bad cache key or a broken link: control
 * characters, leading/trailing space, and absurd length.
 */
export function normaliseSeed(raw: string | null): string | null {
  if (raw === null) return null;
  const seed = raw.trim();
  if (seed.length === 0 || seed.length > MAX_SEED) return null;
  if (/[\u0000-\u001f\u007f]/.test(seed)) return null;
  return seed;
}

export function parseDifficulty(raw: string | null): Difficulty | null {
  if (raw === null) return 'normal';
  const value = raw.trim().toLowerCase();
  return (DIFFICULTY_ORDER as string[]).includes(value) ? (value as Difficulty) : null;
}

/** The link that opens the title screen with this seed and skill preselected. */
function playUrl(origin: string, seed: string, difficulty: Difficulty): string {
  return `${origin}/?seed=${encodeURIComponent(seed)}&difficulty=${difficulty}`;
}

function cellOf(world: number): number {
  return Math.floor(world / CELL);
}

/** "1 door" / "3 doors". The summary sentence is meant to be quoted, so it
 *  cannot say "1 loot spurs". */
function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

/**
 * One character per cell, 88 rows of 88 columns.
 *
 * Legend, in overlay order (later wins):
 *   '#' wall   ' ' floor   '+' door   '=' arena seal   'S' player start
 *   'o' loot spur   'A' arena   'X' antechamber   'V' vault   'g' gun   'k' key
 *
 * Rooms are marked at their centre cell rather than as rectangles: an agent
 * reading this wants to know where things are, not to rasterise furniture.
 */
export function floorplan(map: GameMap): string[] {
  const rows: string[][] = [];
  for (let z = 0; z < GRID_H; z++) {
    const row: string[] = [];
    for (let x = 0; x < GRID_W; x++) {
      row.push(map.grid[z * GRID_W + x] === 1 ? ' ' : '#');
    }
    rows.push(row);
  }

  const put = (x: number, z: number, ch: string) => {
    if (x < 0 || z < 0 || x >= GRID_W || z >= GRID_H) return;
    rows[z][x] = ch;
  };

  for (const door of map.doors) {
    for (const [x, z] of door.cells) put(x, z, door.locked ? 'L' : '+');
  }
  for (const [x, z] of map.seal.cells) put(x, z, '=');

  for (const room of map.rooms) {
    const cx = Math.floor(room.x + room.w / 2);
    const cz = Math.floor(room.z + room.h / 2);
    if (room.kind === 'arena') put(cx, cz, 'A');
    else if (room.kind === 'antechamber') put(cx, cz, 'X');
    else if (room.kind === 'vault') put(cx, cz, 'V');
    else if (room.kind === 'spur') put(cx, cz, 'o');
  }

  for (const pickup of map.pickups) {
    if (pickup.kind === 'gun') put(cellOf(pickup.x), cellOf(pickup.z), 'g');
    else if (pickup.kind === 'key') put(cellOf(pickup.x), cellOf(pickup.z), 'k');
  }

  put(cellOf(map.playerStart.x), cellOf(map.playerStart.z), 'S');

  return rows.map((row) => row.join(''));
}

function mazeResponse(seed: string, difficulty: Difficulty, origin: string) {
  const map = generateMap(seed, difficulty);
  const stats = mapStats(map);

  const enemiesByType: Record<string, number> = {};
  for (const enemy of map.enemies) {
    enemiesByType[enemy.type] = (enemiesByType[enemy.type] ?? 0) + 1;
  }

  return {
    seed,
    difficulty,
    difficultyLabel: DIFFICULTIES[difficulty].label,
    generatorVersion: GEN_VERSION,
    grid: { width: GRID_W, height: GRID_H, cellSize: CELL, units: 'cells' },
    // Deliberately derived from the request host, so a self-hosted or
    // workers.dev deployment links to itself rather than to production.
    playUrl: playUrl(origin, seed, difficulty),
    // An assistant will quote this sentence verbatim, so it is written to be
    // read aloud and pluralised properly.
    summary:
      `${plural(stats.enemies, 'enemy', 'enemies')} across ` +
      `${plural(stats.spineRooms, 'room')} and ${plural(stats.spurs, 'loot spur')}, ` +
      `${plural(stats.doors, 'door')}, ${plural(stats.medikits, 'medikit')} and ` +
      `${plural(stats.ammoBoxes, 'ammo box', 'ammo boxes')} on ${DIFFICULTIES[difficulty].label}.`,
    stats,
    enemiesByType,
    rooms: map.rooms.map((room) => ({
      id: room.id,
      kind: room.kind,
      theme: room.theme,
      outdoor: room.outdoor,
      rect: { x: room.x, z: room.z, w: room.w, h: room.h },
      routeDist: room.routeDist,
    })),
    guns: map.pickups
      .filter((p) => p.kind === 'gun')
      .map((p) => ({ gun: p.gun, roomId: p.roomId, cell: { x: cellOf(p.x), z: cellOf(p.z) } })),
    doors: map.doors.map((door) => ({ id: door.id, locked: door.locked, cells: door.cells })),
    arenaRoomId: map.arenaRoomId,
    antechamberId: map.antechamberId,
    vaultRoomId: map.vaultRoomId,
    floorplan: floorplan(map),
    legend: {
      '#': 'wall',
      ' ': 'floor',
      '+': 'door',
      L: 'locked door',
      '=': 'arena seal',
      S: 'player start',
      o: 'loot spur',
      A: 'arena',
      X: 'antechamber',
      V: 'vault',
      g: 'gun pickup',
      k: 'key',
    },
    downloadUrl: `/api/maze?seed=${encodeURIComponent(seed)}&difficulty=${difficulty}`,
  };
}

function mapsResponse(origin: string) {
  return {
    generatorVersion: GEN_VERSION,
    campaignUrl: `${origin}/`,
    count: CAMPAIGN_SOURCES.length,
    maps: CAMPAIGN_SOURCES.map((map, index) => ({
      index: index + 1,
      id: map.id,
      title: map.title,
      subtitle: map.subtitle ?? '',
      theme: map.themeDefault ?? '',
      intermission: map.intermission ?? [],
      playUrl: `${origin}/`,
    })),
    note: 'Campaign progress lives in browser storage, so a single playUrl covers all seven maps.',
  };
}

/**
 * Serve from the Workers cache when there is one, otherwise build.
 *
 * The `s-maxage` header only tells *downstream* caches what to do; a Worker
 * response is not edge-cached unless it is put there. Without this, every
 * request for the same seed ran generateMap again, which is exactly the CPU
 * cost the header implied was being avoided.
 *
 * The cache key carries GEN_VERSION, so a generator change cannot serve a
 * layout from the previous version. Keys are origin-scoped because playUrl is
 * derived from the request host.
 */
async function cached(request: Request, build: () => Response): Promise<Response> {
  // `caches.default` is a Workers extension, not part of the DOM CacheStorage
  // type, and it is absent under Node (unit tests), so it has to be probed.
  const store = (globalThis as { caches?: { default?: Cache } }).caches?.default;
  if (!store) return build();

  const url = new URL(request.url);
  url.searchParams.set('__gen', String(GEN_VERSION));
  const key = new Request(url.toString(), { method: 'GET' });

  // A broken cache must never fail a request: if the lookup throws, behave as
  // a miss. Only the generator's own output is allowed to decide the response.
  let hit: Response | undefined;
  try {
    hit = await store.match(key);
  } catch { /* treat as a miss */ }
  if (hit) return hit;

  const fresh = build();
  // Best effort: a cache failure must never fail the request.
  try {
    await store.put(key, fresh.clone());
  } catch { /* ignore */ }
  return fresh;
}

/**
 * Router for the three JSON endpoints. Returns null when the path is not ours,
 * so the Worker can fall through to static assets (which is how /api/ serves
 * the HTML documentation page).
 */
export async function handleApi(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  if (!(API_ROUTES as readonly string[]).includes(url.pathname)) return null;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: jsonHeaders(0) });
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return problem(405, 'Only GET is supported.');
  }

  const badDifficulty = () =>
    problem(400, `difficulty must be one of: ${DIFFICULTY_ORDER.join(', ')}.`);

  switch (url.pathname) {
    case '/api/maps':
      return cached(request, () => json(mapsResponse(url.origin), 200, 86400));

    case '/api/share': {
      const seed = normaliseSeed(url.searchParams.get('seed'));
      if (seed === null) return problem(400, `Pass ?seed=<1-${MAX_SEED} printable characters>.`);
      const difficulty = parseDifficulty(url.searchParams.get('difficulty'));
      if (difficulty === null) return badDifficulty();
      return cached(request, () =>
        json(
          {
            seed,
            difficulty,
            playUrl: playUrl(url.origin, seed, difficulty),
            deepLinkNote:
              'Seed and skill are preset by ?seed= and ?difficulty=. Custom maps use #m=<SGMAP.v1.…> instead; the fragment is never sent to this API.',
          },
          200,
          86400,
        ),
      );
    }

    case '/api/maze': {
      // Absent seed means "give me the default"; a seed that is present but
      // unusable is the caller's mistake and must not silently become nightjar.
      const rawSeed = url.searchParams.get('seed');
      const seed = rawSeed === null ? DEFAULT_SEED : normaliseSeed(rawSeed);
      if (seed === null) return problem(400, `Pass ?seed=<1-${MAX_SEED} printable characters>.`);
      const difficulty = parseDifficulty(url.searchParams.get('difficulty'));
      if (difficulty === null) return badDifficulty();
      return cached(request, () => json(mazeResponse(seed, difficulty, url.origin), 200, 3600));
    }

    default:
      return problem(404, 'Unknown endpoint.');
  }
}
