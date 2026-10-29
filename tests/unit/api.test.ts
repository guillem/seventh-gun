// The agent-facing JSON endpoints. These run the real generator, so the
// assertions also guard the contract an external tool would depend on: stable
// shape, deterministic output, and a floorplan that matches the grid size.
import { afterEach, describe, expect, it } from 'vitest';
import { handleApi, normaliseSeed, parseDifficulty } from '../../server/api';
import { GEN_VERSION, GRID_H, GRID_W } from '../../src/sim/types';
import { generateMap } from '../../src/sim/mapgen';

const BASE = 'https://seventhgun.com';

function request(path: string, init?: RequestInit): Request {
  return new Request(`${BASE}${path}`, init);
}

async function get(path: string, init?: RequestInit): Promise<Response> {
  return (await handleApi(request(path, init))) as Response;
}

async function body(res: Response): Promise<any> {
  return JSON.parse(await res.text());
}

/** Minimal stand-in for Workers' `caches.default`, which does not exist under
 *  Node. It is enough to prove the handler consults the cache before it runs
 *  the generator. */
class FakeCache {
  readonly entries = new Map<string, Response>();
  puts = 0;
  async match(req: Request): Promise<Response | undefined> {
    const hit = this.entries.get(req.url);
    return hit ? hit.clone() : undefined;
  }
  async put(req: Request, res: Response): Promise<void> {
    this.puts++;
    this.entries.set(req.url, res.clone());
  }
}

describe('api routing', () => {
  it('ignores paths that are not its own, so assets can answer them', async () => {
    for (const path of ['/', '/about/', '/api/', '/health', '/arena', '/api/nope']) {
      expect(await handleApi(request(path))).toBeNull();
    }
  });

  it('answers GET and rejects writes', async () => {
    expect((await get('/api/maps')).status).toBe(200);
    expect((await get('/api/maps', { method: 'POST' })).status).toBe(405);
  });

  it('answers preflight with CORS headers', async () => {
    const res = await get('/api/maze', { method: 'OPTIONS' });
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
  });
});

describe('normaliseSeed', () => {
  it('trims and rejects empties, control characters and long input', () => {
    expect(normaliseSeed('  nightjar ')).toBe('nightjar');
    expect(normaliseSeed('')).toBeNull();
    expect(normaliseSeed('   ')).toBeNull();
    expect(normaliseSeed('bad\u0000seed')).toBeNull();
    expect(normaliseSeed('x'.repeat(65))).toBeNull();
    expect(normaliseSeed(null)).toBeNull();
  });
});

describe('parseDifficulty', () => {
  it('defaults to normal and rejects unknown levels', () => {
    expect(parseDifficulty(null)).toBe('normal');
    expect(parseDifficulty('HARD')).toBe('hard');
    expect(parseDifficulty('nightmare')).toBeNull();
  });
});

describe('/api/maze', () => {
  it('describes a seed: stats, rooms, guns and a full-size floorplan', async () => {
    const res = await get('/api/maze?seed=nightjar');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');

    const data = await body(res);
    expect(data.seed).toBe('nightjar');
    expect(data.difficulty).toBe('normal');
    expect(data.grid).toMatchObject({ width: GRID_W, height: GRID_H, cellSize: 2 });
    expect(data.stats.enemies).toBeGreaterThan(20);
    expect(data.stats.doors).toBeGreaterThan(0);
    expect(data.rooms.length).toBeGreaterThan(10);
    expect(data.guns.length).toBeGreaterThan(0);
    expect(data.guns.every((g: { gun: number }) => g.gun >= 2 && g.gun <= 7)).toBe(true);
    expect(data.playUrl).toBe(`${BASE}/?seed=nightjar&difficulty=normal`);
    expect(data.summary).toContain(`${data.stats.enemies} enemies`);

    expect(data.floorplan).toHaveLength(GRID_H);
    for (const row of data.floorplan) expect(row).toHaveLength(GRID_W);
    // Exactly one start marker, and it sits on floor.
    const flat = data.floorplan.join('');
    expect(flat.split('S')).toHaveLength(2);
    expect(flat).toContain('A');
  });

  it('is deterministic for a seed and matches the generator', async () => {
    const a = await body(await get('/api/maze?seed=nightjar&difficulty=hard'));
    const b = await body(await get('/api/maze?seed=nightjar&difficulty=hard'));
    expect(a).toEqual(b);
    expect(a.stats.enemies).toBe(generateMap('nightjar', 'hard').enemies.length);
  });

  it('scales with difficulty while keeping the same geometry', async () => {
    const easy = await body(await get('/api/maze?seed=nightjar&difficulty=easy'));
    const hard = await body(await get('/api/maze?seed=nightjar&difficulty=hard'));
    expect(hard.stats.enemies).toBeGreaterThan(easy.stats.enemies);
    // The layout stream ignores difficulty: same seed, same maze.
    expect(hard.floorplan.map((r: string) => r.replace(/[+LSgkoAVX=]/g, ' '))).toEqual(
      easy.floorplan.map((r: string) => r.replace(/[+LSgkoAVX=]/g, ' ')),
    );
  });

  it('defaults an absent seed but rejects one that is present and unusable', async () => {
    expect((await body(await get('/api/maze'))).seed).toBe('nightjar');

    // Present but empty, too long, or containing control characters must not
    // quietly turn into the default map.
    for (const bad of ['seed=', `seed=${'x'.repeat(65)}`, 'seed=bad%00seed']) {
      const res = await get(`/api/maze?${bad}`);
      expect(res.status, bad).toBe(400);
      expect((await body(res)).error).toContain('printable characters');
    }
  });

  it('rejects unknown difficulties', async () => {
    const res = await get('/api/maze?difficulty=nightmare');
    expect(res.status).toBe(400);
    expect((await body(res)).error).toContain('difficulty must be one of');
  });
});

describe('/api/share', () => {
  it('returns the canonical play URL', async () => {
    const data = await body(await get('/api/share?seed=two%20words&difficulty=easy'));
    expect(data.playUrl).toBe(`${BASE}/?seed=two%20words&difficulty=easy`);
    expect(data.difficulty).toBe('easy');
  });

  it('rejects a missing seed', async () => {
    expect((await get('/api/share')).status).toBe(400);
  });
});

describe('/api/maps', () => {
  it('lists the seven campaign maps in order', async () => {
    const data = await body(await get('/api/maps'));
    expect(data.count).toBe(7);
    expect(data.maps.map((m: { title: string }) => m.title)).toEqual([
      'THE FOUNDRY', 'THE GULLET', 'THE CATACOMBS', 'THE PIT',
      'THE SPIRE', 'THE WARD', 'THE SANCTUM',
    ]);
    expect(data.maps[0].subtitle).toBe('steel remembers the screaming');
  });
});

describe('edge cache', () => {
  afterEach(() => {
    delete (globalThis as { caches?: unknown }).caches;
  });

  it('stores the first response and serves it without regenerating', async () => {
    const cache = new FakeCache();
    (globalThis as { caches?: unknown }).caches = { default: cache };

    const first = await body(await get('/api/maze?seed=cachetest'));
    expect(cache.puts).toBe(1);

    // Replace the stored body with a sentinel: a second request must return
    // that, which can only happen if the generator was skipped.
    const key = `${BASE}/api/maze?seed=cachetest&__gen=${GEN_VERSION}`;
    expect(cache.entries.has(key)).toBe(true);
    cache.entries.set(key, new Response('{"cached":true}', {
      headers: { 'content-type': 'application/json' },
    }));

    const second = await body(await get('/api/maze?seed=cachetest'));
    expect(second).toEqual({ cached: true });
    expect(first.seed).toBe('cachetest');
    expect(cache.puts).toBe(1);
  });

  it('still answers when the cache lookup itself throws', async () => {
    // A cache outage must degrade to "generate it", not to a failed request.
    (globalThis as { caches?: unknown }).caches = {
      default: {
        match: async () => { throw new Error('cache down'); },
        put: async () => { throw new Error('cache down'); },
      },
    };

    const res = await get('/api/maze?seed=cachebroken');
    expect(res.status).toBe(200);
    expect((await body(res)).seed).toBe('cachebroken');
  });
});
