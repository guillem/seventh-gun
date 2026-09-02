// Campaign art hook: id mapping, texture cache, extra placement.
// Texture generation is stubbed at the canvas level so the unit suite
// stays node-only (no jsdom / extra deps).
import { describe, it, expect, beforeAll } from 'vitest';
import { CAMPAIGN } from '../../src/campaign/index';
import { generateMap } from '../../src/sim/mapgen';
import {
  CAMPAIGN_ART_IDS, CAMPAIGN_HERO_DECALS,
  campaignArtIdFromIndex, campaignArtIdFromSeed, getCampaignTextures,
  resolveHeroDecals,
} from '../../src/render/campaignTextures';
import { planCampaignExtras, planHeroPlacement } from '../../src/render/campaignDecor';

function installCanvasStub(): void {
  if (typeof document !== 'undefined') return;
  const ctx = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    lineCap: 'butt',
    lineJoin: 'miter',
    miterLimit: 10,
    font: '10px sans-serif',
    textAlign: 'start',
    textBaseline: 'alphabetic',
    shadowColor: '',
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    imageSmoothingEnabled: false,
    canvas: { width: 0, height: 0 },
    fillRect() {},
    strokeRect() {},
    clearRect() {},
    beginPath() {},
    closePath() {},
    moveTo() {},
    lineTo() {},
    arc() {},
    arcTo() {},
    ellipse() {},
    fill() {},
    stroke() {},
    bezierCurveTo() {},
    quadraticCurveTo() {},
    setLineDash() {},
    getLineDash() { return []; },
    createLinearGradient() { return { addColorStop() {} }; },
    createRadialGradient() { return { addColorStop() {} }; },
    createPattern() { return null; },
    save() {},
    restore() {},
    clip() {},
    rect() {},
    setTransform() {},
    resetTransform() {},
    transform() {},
    translate() {},
    rotate() {},
    scale() {},
    drawImage() {},
    fillText() {},
    strokeText() {},
    measureText() { return { width: 0 }; },
    getImageData() { return { data: new Uint8ClampedArray(4), width: 1, height: 1 }; },
    putImageData() {},
    createImageData() { return { data: new Uint8ClampedArray(4), width: 1, height: 1 }; },
  };
  (globalThis as unknown as { document: { createElement: (tag: string) => unknown } }).document = {
    createElement(tag: string) {
      if (tag === 'canvas') {
        return { width: 0, height: 0, getContext: () => ctx };
      }
      return {};
    },
  };
}

beforeAll(() => {
  installCanvasStub();
});

describe('campaignArtIdFromIndex', () => {
  it('maps 1–7 onto the seven packs', () => {
    expect(campaignArtIdFromIndex(1)).toBe('foundry');
    expect(campaignArtIdFromIndex(2)).toBe('gullet');
    expect(campaignArtIdFromIndex(3)).toBe('catacombs');
    expect(campaignArtIdFromIndex(4)).toBe('pit');
    expect(campaignArtIdFromIndex(5)).toBe('spire');
    expect(campaignArtIdFromIndex(6)).toBe('ward');
    expect(campaignArtIdFromIndex(7)).toBe('sanctum');
    expect(CAMPAIGN_ART_IDS).toEqual([
      'foundry', 'gullet', 'catacombs', 'pit', 'spire', 'ward', 'sanctum',
    ]);
  });

  it('clamps out-of-range indices', () => {
    expect(campaignArtIdFromIndex(0)).toBe('foundry');
    expect(campaignArtIdFromIndex(99)).toBe('sanctum');
  });
});

describe('campaignArtIdFromSeed', () => {
  it('reads campaign:NN-name and campaign:N', () => {
    expect(campaignArtIdFromSeed('campaign:01-foundry')).toBe('foundry');
    expect(campaignArtIdFromSeed('campaign:03')).toBe('catacombs');
    expect(campaignArtIdFromSeed('campaign:foundry')).toBe('foundry');
  });

  it('ignores maze and authored-map seeds', () => {
    expect(campaignArtIdFromSeed('abc123')).toBeUndefined();
    expect(campaignArtIdFromSeed('THE FOUNDRY')).toBeUndefined();
    const maze = generateMap('art-hook-maze', 'normal');
    expect(campaignArtIdFromSeed(maze.seed)).toBeUndefined();
  });

  it('resolves every shipped campaign map seed', () => {
    for (const m of CAMPAIGN) {
      expect(campaignArtIdFromSeed(m.map.seed), m.map.seed).toBe(campaignArtIdFromIndex(m.index));
    }
  });
});

describe('getCampaignTextures', () => {
  it('returns a cached pack with surfaces and extra decals', () => {
    const a = getCampaignTextures('foundry');
    const b = getCampaignTextures('foundry');
    expect(a).toBe(b);
    expect(a.walls).toBeTruthy();
    expect(a.floors).toBeTruthy();
    expect(a.ceilings).toBeTruthy();
    expect(a.door).toBeTruthy();
    expect(a.extraDecals.length).toBeGreaterThanOrEqual(3);
    expect(new Set(a.extraDecals.map(d => d.id)).size).toBe(a.extraDecals.length);
    expect(a.extraDecals.every(d => d.tex)).toBe(true);
  });

  it('pit ships an outdoor sky; packs differ from each other', () => {
    const pit = getCampaignTextures('pit');
    const ward = getCampaignTextures('ward');
    expect(pit.sky).toBeTruthy();
    expect(pit.walls).not.toBe(ward.walls);
  });
});

describe('planCampaignExtras', () => {
  it('places extras from room kinds and does not mutate GameMap', () => {
    for (const m of CAMPAIGN) {
      const before = m.map.decors.length;
      const extras = planCampaignExtras(m.map, campaignArtIdFromIndex(m.index));
      expect(extras.length, m.id).toBeGreaterThan(0);
      expect(m.map.decors.length).toBe(before);
    }
  });

  it('gives each map a distinct extra vocabulary', () => {
    const foundry = planCampaignExtras(CAMPAIGN[0].map, 'foundry');
    const catacombs = planCampaignExtras(CAMPAIGN[2].map, 'catacombs');
    const pit = planCampaignExtras(CAMPAIGN[3].map, 'pit');
    expect(foundry.some(e => e.decalId === 'foundry-furnace-stencil' || e.kind === 'chain')).toBe(true);
    expect(catacombs.some(e => e.kind === 'shelf')).toBe(true);
    expect(pit.some(e => e.kind === 'floor')).toBe(true);
  });
});

describe('hero decals', () => {
  const fakeTex = { wrapS: 0, wrapT: 0 } as unknown as import('three').Texture;

  it('places nothing when the caller passes an empty list', () => {
    for (const m of CAMPAIGN) {
      const artId = campaignArtIdFromIndex(m.index);
      expect(planHeroPlacement(m.map, artId, [])).toBeNull();
    }
  });

  it('resolves shipped hero plates and hangs one on foundry', () => {
    const resolved = resolveHeroDecals('foundry');
    expect(resolved.some(h => h.id === 'furnace-mouth')).toBe(true);
    const p = planHeroPlacement(CAMPAIGN[0].map, 'foundry', resolved);
    expect(p?.kind).toBe('hero');
    expect(p?.decalId).toBe('furnace-mouth');
  });

  it('places one arena-back quad on foundry when a hero is provided', () => {
    const map = CAMPAIGN[0].map;
    const arena = map.rooms.find(r => r.kind === 'arena')!;
    const ante = map.rooms.find(r => r.kind === 'antechamber')!;
    const p = planHeroPlacement(map, 'foundry', [
      { id: 'hero-foundry', tex: fakeTex, hint: 'arena-back' },
    ]);
    expect(p).not.toBeNull();
    expect(p!.kind).toBe('hero');
    expect(p!.decalId).toBe('hero-foundry');
    expect(p!.w).toBeGreaterThan(2);
    expect(p!.h).toBeGreaterThan(2);
    const dArena = Math.hypot(p!.x - arena.cx, p!.z - arena.cz);
    const dAnte = Math.hypot(p!.x - ante.cx, p!.z - ante.cz);
    expect(dArena).toBeLessThan(dAnte);
    expect(dArena).toBeLessThan(Math.max(arena.w, arena.h) * 2);
  });

  it('places the pit-rim hero on the outdoor courtyard, not the arena', () => {
    const map = CAMPAIGN[3].map;
    const pit = map.rooms.filter(r => r.outdoor).sort((a, b) => b.w * b.h - a.w * a.h)[0];
    const arena = map.rooms.find(r => r.kind === 'arena')!;
    const p = planHeroPlacement(map, 'pit', [
      { id: 'hero-pit', tex: fakeTex, hint: 'pit-rim' },
    ]);
    expect(p).not.toBeNull();
    const pad = 2.5;
    const inRect = (r: typeof pit, slop: number) =>
      p!.x >= r.x * 2 - slop && p!.x <= (r.x + r.w) * 2 + slop &&
      p!.z >= r.z * 2 - slop && p!.z <= (r.z + r.h) * 2 + slop;
    expect(inRect(pit, pad)).toBe(true);
    expect(inRect(arena, 0)).toBe(false);
  });

  it('places the sanctum-apse hero on the far choir wall, not the arena', () => {
    const map = CAMPAIGN[6].map;
    const start = map.rooms.find(r => r.kind === 'start')!;
    const arena = map.rooms.find(r => r.kind === 'arena')!;
    const p = planHeroPlacement(map, 'sanctum', [
      { id: 'hero-sanctum', tex: fakeTex, hint: 'sanctum-apse' },
    ]);
    expect(p).not.toBeNull();
    const dStart = Math.hypot(p!.x - start.cx, p!.z - start.cz);
    const dArena = Math.hypot(p!.x - arena.cx, p!.z - arena.cz);
    expect(dStart).toBeGreaterThan(40);
    expect(dArena).toBeGreaterThan(8);
    // choir sits on the nave axis (x≈43); arena is far east (x≈79)
    expect(Math.abs(p!.x - start.cx)).toBeLessThan(Math.abs(p!.x - arena.cx));
  });

  it('ignores a hero tagged for a different map', () => {
    const p = planHeroPlacement(CAMPAIGN[0].map, 'foundry', [
      { id: 'hero-gullet', tex: fakeTex, map: 'gullet', hint: 'arena-back' },
    ]);
    expect(p).toBeNull();
  });

  it('reads the sibling CAMPAIGN_HERO_DECALS table when the pack omits the field', () => {
    CAMPAIGN_HERO_DECALS.foundry = [{ id: 'sibling-hero', tex: fakeTex, hint: 'arena-back' }];
    try {
      const resolved = resolveHeroDecals('foundry', getCampaignTextures('foundry'));
      expect(resolved).toHaveLength(1);
      expect(resolved[0].id).toBe('sibling-hero');
      const p = planHeroPlacement(CAMPAIGN[0].map, 'foundry', resolved);
      expect(p?.decalId).toBe('sibling-hero');
    } finally {
      delete CAMPAIGN_HERO_DECALS.foundry;
    }
  });
});
