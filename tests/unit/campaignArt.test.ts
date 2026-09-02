// Campaign art hook: id mapping, texture cache, extra placement.
// Texture generation is stubbed at the canvas level so the unit suite
// stays node-only (no jsdom / extra deps).
import { describe, it, expect, beforeAll } from 'vitest';
import { CAMPAIGN } from '../../src/campaign/index';
import { generateMap } from '../../src/sim/mapgen';
import {
  CAMPAIGN_ART_IDS, CAMPAIGN_DECAL_IDS,
  campaignArtIdFromIndex, campaignArtIdFromSeed, getCampaignTextures,
} from '../../src/render/campaignTextures';
import { planCampaignExtras } from '../../src/render/campaignDecor';

function installCanvasStub(): void {
  if (typeof document !== 'undefined') return;
  const ctx = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
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
    expect(a.extraDecals.map(d => d.id)).toEqual(CAMPAIGN_DECAL_IDS.foundry);
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
    expect(foundry.some(e => e.decalId === 'furnace' || e.kind === 'chain')).toBe(true);
    expect(catacombs.some(e => e.kind === 'shelf')).toBe(true);
    expect(pit.some(e => e.kind === 'floor')).toBe(true);
  });
});
