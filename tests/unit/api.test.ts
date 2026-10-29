// The agent-facing JSON endpoints. These run the real generator, so the
// assertions also guard the contract an external tool would depend on: stable
// shape, deterministic output, and a floorplan that matches the grid size.
import { describe, expect, it } from 'vitest';
import { handleApi, normaliseSeed, parseDifficulty } from '../../server/api';
import { GRID_H, GRID_W } from '../../src/sim/types';
import { generateMap } from '../../src/sim/mapgen';

const BASE = 'https://seventhgun.com';

function request(path: string, init?: RequestInit): Request {
  return new Request(`${BASE}${path}`, init);
}

async function body(res: Response): Promise<any> {
  return JSON.parse(await res.text());
}

describe('api routing', () => {
  it('ignores paths that are not its own, so assets can answer them', () => {
    for (const path of ['/', '/about/', '/api/', '/health', '/arena', '/api/nope']) {
      expect(handleApi(request(path))).toBeNull();
    }
  });

  it('answers GET and rejects writes', async () => {
    expect((handleApi(request('/api/maps')) as Response).status).toBe(200);
    expect((handleApi(request('/api/maps', { method: 'POST' })) as Response).status).toBe(405);
  });

  it('answers preflight with CORS headers', () => {
    const res = handleApi(request('/api/maze', { method: 'OPTIONS' })) as Response;
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
    const res = handleApi(request('/api/maze?seed=nightjar')) as Response;
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
    expect(data.playUrl).toBe(`${BASE}/?seed=nightjar`);

    expect(data.floorplan).toHaveLength(GRID_H);
    for (const row of data.floorplan) expect(row).toHaveLength(GRID_W);
    // Exactly one start marker, and it sits on floor.
    const flat = data.floorplan.join('');
    expect(flat.split('S')).toHaveLength(2);
    expect(flat).toContain('A');
  });

  it('is deterministic for a seed and matches the generator', async () => {
    const a = await body(handleApi(request('/api/maze?seed=nightjar&difficulty=hard')) as Response);
    const b = await body(handleApi(request('/api/maze?seed=nightjar&difficulty=hard')) as Response);
    expect(a).toEqual(b);
    expect(a.stats.enemies).toBe(generateMap('nightjar', 'hard').enemies.length);
  });

  it('scales with difficulty while keeping the same geometry', async () => {
    const easy = await body(handleApi(request('/api/maze?seed=nightjar&difficulty=easy')) as Response);
    const hard = await body(handleApi(request('/api/maze?seed=nightjar&difficulty=hard')) as Response);
    expect(hard.stats.enemies).toBeGreaterThan(easy.stats.enemies);
    // The layout stream ignores difficulty: same seed, same maze.
    expect(hard.floorplan.map((r: string) => r.replace(/[+LSgkoAVX=]/g, ' '))).toEqual(
      easy.floorplan.map((r: string) => r.replace(/[+LSgkoAVX=]/g, ' ')),
    );
  });

  it('falls back to the default seed and rejects unknown difficulties', async () => {
    const res = await body(handleApi(request('/api/maze')) as Response);
    expect(res.seed).toBe('nightjar');

    const bad = handleApi(request('/api/maze?difficulty=nightmare')) as Response;
    expect(bad.status).toBe(400);
    expect((await body(bad)).error).toContain('difficulty must be one of');
  });
});

describe('/api/share', () => {
  it('returns the canonical play URL', async () => {
    const data = await body(handleApi(request('/api/share?seed=two%20words&difficulty=easy')) as Response);
    expect(data.playUrl).toBe(`${BASE}/?seed=two%20words`);
    expect(data.difficulty).toBe('easy');
  });

  it('rejects a missing seed', async () => {
    const res = handleApi(request('/api/share')) as Response;
    expect(res.status).toBe(400);
  });
});

describe('/api/maps', () => {
  it('lists the seven campaign maps in order', async () => {
    const data = await body(handleApi(request('/api/maps')) as Response);
    expect(data.count).toBe(7);
    expect(data.maps.map((m: { title: string }) => m.title)).toEqual([
      'THE FOUNDRY', 'THE GULLET', 'THE CATACOMBS', 'THE PIT',
      'THE SPIRE', 'THE WARD', 'THE SANCTUM',
    ]);
    expect(data.maps[0].subtitle).toBe('steel remembers the screaming');
  });
});
