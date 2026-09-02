// Campaign art hook: id mapping, texture cache, extra + hero placement.
// Texture generation is stubbed at the canvas level so the unit suite
// stays node-only (no jsdom / extra deps).
import { describe, it, expect, beforeAll } from 'vitest';
import { CAMPAIGN } from '../../src/campaign/index';
import { generateMap } from '../../src/sim/mapgen';
import {
  CAMPAIGN_ART_IDS, CAMPAIGN_HERO_DECALS, CAMPAIGN_HERO_MARKERS,
  campaignArtIdFromIndex, campaignArtIdFromSeed, getCampaignTextures,
  resolveHeroDecals,
  type CampaignHeroDecal,
} from '../../src/render/campaignTextures';
import { CEIL_H } from '../../src/sim/types';
import {
  planCampaignExtras, planHeroPlacements, clampToWallFace, wallFaceExtent,
  type ExtraPlacement,
} from '../../src/render/campaignDecor';

function installCanvasStub(): void {
  if (typeof document !== 'undefined') return;
  const ctx = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    lineCap: 'butt',
    lineJoin: 'miter',
    shadowColor: '',
    shadowBlur: 0,
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    fillRect() {},
    strokeRect() {},
    clearRect() {},
    beginPath() {},
    closePath() {},
    moveTo() {},
    lineTo() {},
    arc() {},
    ellipse() {},
    fill() {},
    stroke() {},
    createLinearGradient() { return { addColorStop() {} }; },
    createRadialGradient() { return { addColorStop() {} }; },
    save() {},
    restore() {},
    clip() {},
    rect() {},
    quadraticCurveTo() {},
    bezierCurveTo() {},
    setTransform() {},
    translate() {},
    rotate() {},
    scale() {},
    drawImage() {},
    fillText() {},
    measureText() { return { width: 0 }; },
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

const fakeTex = { wrapS: 0, wrapT: 0 } as unknown as import('three').Texture;

function fakeHeroes(artId: (typeof CAMPAIGN_ART_IDS)[number]): CampaignHeroDecal[] {
  return CAMPAIGN_HERO_MARKERS.filter(m => m.map === artId).map(m => ({
    id: m.id, tex: fakeTex, map: m.map, hint: m.hint,
  }));
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
    expect(a.extraDecals.map(d => d.id)).toEqual([
      'foundry-furnace-stencil', 'foundry-pour-ladle', 'foundry-heat-warning',
    ]);
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

describe('hero plates', () => {
  it('places nothing when the roster is empty', () => {
    for (const m of CAMPAIGN) {
      const artId = campaignArtIdFromIndex(m.index);
      expect(planHeroPlacements(m.map, artId, [])).toEqual([]);
    }
  });

  it('places every foundry plate, with furnace-mouth on the arena', () => {
    const map = CAMPAIGN[0].map;
    const arena = map.rooms.find(r => r.kind === 'arena')!;
    const ante = map.rooms.find(r => r.kind === 'antechamber')!;
    const placed = planHeroPlacements(map, 'foundry', fakeHeroes('foundry'));
    expect(placed.map(p => p.decalId).sort()).toEqual(
      CAMPAIGN_HERO_MARKERS.filter(h => h.map === 'foundry').map(h => h.id).sort(),
    );
    const mouth = placed.find(p => p.decalId === 'furnace-mouth')!;
    expect(mouth.kind).toBe('hero');
    expect(mouth.orient).toBe('wall');
    const dArena = Math.hypot(mouth.x - arena.cx, mouth.z - arena.cz);
    const dAnte = Math.hypot(mouth.x - ante.cx, mouth.z - ante.cz);
    expect(dArena).toBeLessThan(dAnte);
  });

  it('places the pit idol on the outdoor courtyard, not the arena', () => {
    const map = CAMPAIGN[3].map;
    const pit = map.rooms.filter(r => r.outdoor).sort((a, b) => b.w * b.h - a.w * a.h)[0];
    const arena = map.rooms.find(r => r.kind === 'arena')!;
    const placed = planHeroPlacements(map, 'pit', fakeHeroes('pit'));
    const idol = placed.find(p => p.decalId === 'demonic-idol')!;
    expect(idol.orient).toBe('floor');
    const pad = 2.5;
    const inRect = (r: typeof pit, slop: number) =>
      idol.x >= r.x * 2 - slop && idol.x <= (r.x + r.w) * 2 + slop &&
      idol.z >= r.z * 2 - slop && idol.z <= (r.z + r.h) * 2 + slop;
    expect(inRect(pit, pad)).toBe(true);
    expect(inRect(arena, 0)).toBe(false);
  });

  it('places sanctum apse plates on the choir axis, not the arena', () => {
    const map = CAMPAIGN[6].map;
    const start = map.rooms.find(r => r.kind === 'start')!;
    const arena = map.rooms.find(r => r.kind === 'arena')!;
    const placed = planHeroPlacements(map, 'sanctum', fakeHeroes('sanctum'));
    const reliquary = placed.find(p => p.decalId === 'gun-reliquary')!;
    expect(Math.hypot(reliquary.x - start.cx, reliquary.z - start.cz)).toBeGreaterThan(40);
    expect(Math.abs(reliquary.x - start.cx)).toBeLessThan(Math.abs(reliquary.x - arena.cx));
  });

  it('ignores a hero tagged for a different map', () => {
    const gulletOnly = fakeHeroes('gullet');
    expect(planHeroPlacements(CAMPAIGN[0].map, 'foundry', gulletOnly)).toEqual([]);
  });

  it('resolveHeroDecals prefers pack.heroDecals; empty pack field is a no-op', () => {
    const pack = getCampaignTextures('foundry');
    const only = [{ id: 'pack-only', tex: fakeTex, map: 'foundry' as const, hint: 'arena-back-wall' }];
    expect(resolveHeroDecals('foundry', { ...pack, heroDecals: only }).map(h => h.id)).toEqual(['pack-only']);
    expect(resolveHeroDecals('foundry', { ...pack, heroDecals: [] })).toEqual([]);
  });

  it('resolveHeroDecals falls through to painted plates when the pack omits heroDecals', () => {
    const pack = getCampaignTextures('foundry');
    expect(pack.heroDecals).toBeUndefined();
    expect(CAMPAIGN_HERO_DECALS.foundry).toBeUndefined();
    const ids = resolveHeroDecals('foundry', pack).map(h => h.id).sort();
    expect(ids).toEqual(
      CAMPAIGN_HERO_MARKERS.filter(h => h.map === 'foundry').map(h => h.id).sort(),
    );
  });
});


const CORNER_INSET = 0.18;
const FLOOR_INSET = 0.08;
const CEIL_INSET = 0.08;

function isWallQuad(e: ExtraPlacement): boolean {
  if (e.orient === 'floor' || e.orient === 'ceiling') return false;
  if (e.kind === 'floor' || e.kind === 'chain') return false;
  return true;
}

function assertFitsFace(map: (typeof CAMPAIGN)[number]['map'], e: ExtraPlacement, label: string): void {
  expect(e.y - e.h / 2, `${label} floor`).toBeGreaterThanOrEqual(FLOOR_INSET - 1e-4);
  expect(e.y + e.h / 2, `${label} ceil`).toBeLessThanOrEqual(CEIL_H - CEIL_INSET + 1e-4);
  const face = wallFaceExtent(map, e.x, e.z, e.yaw);
  if (!face) return;
  if (face.max - face.min < 0.6) {
    expect(e.w, `${label} thin`).toBeLessThanOrEqual(face.max - face.min + 1e-4);
    return;
  }
  const along = face.axis === 'x' ? e.x : e.z;
  expect(along - e.w / 2, `${label} past min`).toBeGreaterThanOrEqual(face.min + CORNER_INSET - 1e-4);
  expect(along + e.w / 2, `${label} past max`).toBeLessThanOrEqual(face.max - CORNER_INSET + 1e-4);
}

describe('wall-face clamp', () => {
  it('keeps extras and heroes on THE SPIRE inside the contiguous wall', () => {
    const map = CAMPAIGN[4].map;
    const extras = planCampaignExtras(map, 'spire');
    const heroes = planHeroPlacements(map, 'spire', fakeHeroes('spire'));
    const all = extras.concat(heroes);
    expect(all.some(e => e.decalId === 'dish-eye' || e.decalId === 'lattice-totem')).toBe(true);
    for (const e of all) {
      if (!isWallQuad(e)) continue;
      assertFitsFace(map, e, e.decalId ?? e.kind);
    }
  });

  it('shrinks a too-wide hero on a one-cell wall face and insets from the corner', () => {
    const map = CAMPAIGN[4].map;
    // pick any wall extra as a location sample
    const sample = planCampaignExtras(map, 'spire').find(isWallQuad);
    expect(sample).toBeTruthy();
    const huge = clampToWallFace(map, { ...sample!, w: 40, h: 20, y: 2 });
    expect(huge.w).toBeLessThan(40);
    expect(huge.h).toBeLessThanOrEqual(CEIL_H - FLOOR_INSET - CEIL_INSET + 1e-4);
    assertFitsFace(map, huge, 'huge');
  });
});
