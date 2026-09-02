// Campaign art packs: identity + "not an empty stub" guards. Node env has no
// canvas, so we never call getCampaignTextures — we read the source instead.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CAMPAIGN_ART_IDS, CAMPAIGN_HERO_MARKERS, CAMPAIGN_PACK_MARKERS, campaignArtIdFromIndex,
} from '../../src/render/campaignTextures';

const SRC_PATH = join(process.cwd(), 'src', 'render', 'campaignTextures.ts');
const src = readFileSync(SRC_PATH, 'utf8');

describe('campaign art ids', () => {
  it('has exactly seven packs in campaign order', () => {
    expect(CAMPAIGN_ART_IDS).toHaveLength(7);
    expect([...CAMPAIGN_ART_IDS]).toEqual([
      'foundry', 'gullet', 'catacombs', 'pit', 'spire', 'ward', 'sanctum',
    ]);
  });

  it('maps map index 1..7 onto the packs', () => {
    expect(campaignArtIdFromIndex(1)).toBe('foundry');
    expect(campaignArtIdFromIndex(2)).toBe('gullet');
    expect(campaignArtIdFromIndex(3)).toBe('catacombs');
    expect(campaignArtIdFromIndex(4)).toBe('pit');
    expect(campaignArtIdFromIndex(5)).toBe('spire');
    expect(campaignArtIdFromIndex(6)).toBe('ward');
    expect(campaignArtIdFromIndex(7)).toBe('sanctum');
  });

  it('clamps out-of-range indices into 1..7', () => {
    expect(campaignArtIdFromIndex(0)).toBe('foundry');
    expect(campaignArtIdFromIndex(-4)).toBe('foundry');
    expect(campaignArtIdFromIndex(8)).toBe('sanctum');
    expect(campaignArtIdFromIndex(99)).toBe('sanctum');
  });
});

describe('campaign pack markers', () => {
  it('matches the agreed marker strings', () => {
    expect(CAMPAIGN_PACK_MARKERS).toEqual({
      foundry: 'slag-iron-chevrons',
      gullet: 'mucosa-bile-peristalsis',
      catacombs: 'ossuary-bone-inlay',
      pit: 'gantry-ochre-sky',
      spire: 'copper-traces-lattice',
      ward: 'quarantine-cracked-tile',
      sanctum: 'gold-void-heptagram',
    });
  });

  it('has one marker per pack, all unique', () => {
    const values = CAMPAIGN_ART_IDS.map(id => CAMPAIGN_PACK_MARKERS[id]);
    expect(values).toHaveLength(7);
    expect(new Set(values).size).toBe(7);
  });
});

describe('campaign art source', () => {
  it('paints a wall/floor/ceiling/door builder per pack', () => {
    for (const id of CAMPAIGN_ART_IDS) {
      for (const kind of ['Wall', 'Floor', 'Ceiling', 'Door']) {
        expect(src).toContain(`function ${id}${kind}(`);
      }
      // each pack gets its own banner-commented section, not a shared recolor
      expect(src).toContain(id.toUpperCase());
    }
  });

  it('keeps each pack on its own theme vocabulary', () => {
    const tokens: Record<string, string[]> = {
      foundry: ['slag', 'chevron', 'ember', 'poured-iron'],
      gullet: ['peristalsis', 'mucus', 'bile', 'sphincter'],
      catacombs: ['ossuary', 'skull', 'burial glyphs', 'candle'],
      pit: ['gantry', 'ochre', 'corrugated', 'rust'],
      spire: ['copper', 'lattice', 'elevation', 'composite'],
      ward: ['quarantine', 'tile', 'biohazard', 'cell'],
      sanctum: ['heptagram', 'gold', 'apse', 'arch'],
    };
    for (const [pack, words] of Object.entries(tokens)) {
      for (const w of words) {
        expect(src.toLowerCase(), `${pack} missing "${w}"`).toContain(w);
      }
    }
  });

  it('registers at least three uniquely named decals per pack', () => {
    const decalIds = [
      'foundry-furnace-stencil', 'foundry-pour-ladle', 'foundry-heat-warning',
      'gullet-sphincter-ring', 'gullet-tooth-ridge', 'gullet-drip',
      'catacombs-stacked-skulls', 'catacombs-epitaph', 'catacombs-bone-cross',
      'pit-crane-glyph', 'pit-fall-hazard', 'pit-rim-rust',
      'spire-floor-numeral', 'spire-visor-stripe', 'spire-dish',
      'ward-biohazard', 'ward-cot-stencil', 'ward-key-sigil',
      'sanctum-heptagram', 'sanctum-nave-saint-mark', 'sanctum-gun-7',
    ];
    expect(new Set(decalIds).size).toBe(decalIds.length);
    for (const id of decalIds) expect(src, `decal ${id} not registered`).toContain(`'${id}'`);
    for (const pack of CAMPAIGN_ART_IDS) {
      expect(decalIds.filter(d => d.startsWith(pack + '-')).length).toBeGreaterThanOrEqual(3);
    }
  });

  it('gives the pit an overcast sky and leaves the maze door alone', () => {
    expect(src).toContain('function pitSky(');
    expect(src).toContain('sky: toTiled(pitSky())');
    // maze door signature: orange rune circle + bone teeth. Must not be cloned.
    expect(src).not.toContain('#ff7a1a');
    expect(src).not.toContain('doorTexture');
  });

  it('uses nearest-filter CanvasTexture settings and caches packs', () => {
    expect(src).toContain('THREE.NearestFilter');
    expect(src).toContain('THREE.NearestMipmapLinearFilter');
    expect(src).toContain('THREE.SRGBColorSpace');
    expect(src).toContain('THREE.RepeatWrapping');
    expect(src).toContain('packCache');
  });

  it('seeds every pack deterministically and never uses any', () => {
    expect(src).toContain("makeRng('camp-tex-'");
    expect(src).not.toMatch(/:\s*any\b/);
  });
});

describe('maze art is untouched', () => {
  it('does not re-export or rewrite the generic themes', () => {
    const maze = readFileSync(join(process.cwd(), 'src', 'render', 'textures.ts'), 'utf8');
    for (const theme of ['wallIndustrial', 'wallOrganic', 'wallStone', 'wallTech']) {
      expect(maze).toContain(`function ${theme}(`);
      expect(src).not.toContain(theme);
    }
    expect(src).not.toContain("from './textures'");
  });
});

describe('campaign hero plates', () => {
  it('rosters at least twelve heroes with unique ids', () => {
    expect(CAMPAIGN_HERO_MARKERS.length).toBeGreaterThanOrEqual(12);
    const ids = CAMPAIGN_HERO_MARKERS.map(h => h.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('points every hero at a real pack, a hint and a hero-sized canvas', () => {
    for (const h of CAMPAIGN_HERO_MARKERS) {
      expect(CAMPAIGN_ART_IDS).toContain(h.map);
      expect(h.hint.length).toBeGreaterThan(0);
      expect([256, 512]).toContain(h.size);
    }
  });

  it('covers the named hero set', () => {
    const byId = new Map(CAMPAIGN_HERO_MARKERS.map(h => [h.id, h] as const));
    const expected: [string, string, string, number][] = [
      ['furnace-mouth', 'foundry', 'arena-back-wall', 512],
      ['pour-crucible', 'foundry', 'side-alcove', 256],
      ['sphincter-maw', 'gullet', 'arena-back-wall', 512],
      ['uvula-idol', 'gullet', 'ceiling-boss', 256],
      ['ossuary-faces', 'catacombs', 'arena-back-wall', 512],
      ['burial-saint', 'catacombs', 'chapel-niche', 256],
      ['demonic-idol', 'pit', 'pit-floor-idol', 512],
      ['crane-god', 'pit', 'sky-gantry', 256],
      ['dish-eye', 'spire', 'roof-antenna', 512],
      ['visor-mask', 'spire', 'elevator-door', 256],
      ['quarantine-mural', 'ward', 'arena-back-wall', 512],
      ['isolation-cot', 'ward', 'cell-wall', 256],
      ['gun-reliquary', 'sanctum', 'apse-altar', 512],
      ['demon-head', 'sanctum', 'nave-tympanum', 512],
      ['nave-rose', 'sanctum', 'rose-window', 256],
    ];
    for (const [id, map, hint, size] of expected) {
      const h = byId.get(id);
      expect(h, `hero ${id} missing`).toBeDefined();
      expect(h!.map).toBe(map);
      expect(h!.hint).toBe(hint);
      expect(h!.size).toBe(size);
    }
  });

  it('paints a real canvas for every rostered hero', () => {
    for (const h of CAMPAIGN_HERO_MARKERS) {
      const fn = 'hero' + h.id.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join('');
      expect(src, `${h.id} has no painter`).toContain(`function ${fn}(`);
      expect(src, `${h.id} is not wired into the painter table`).toContain(`'${h.id}': ${fn},`);
      expect(src).toContain(`const S = ${h.size};`);
    }
  });

  it('clamps heroes instead of tiling them, and caches them', () => {
    expect(src).toContain('getCampaignHeroDecals');
    expect(src).toContain('THREE.ClampToEdgeWrapping');
    expect(src).toContain('function toHero(');
    expect(src).toContain('heroCache');
    expect(src).toContain("makeRng('camp-hero-'");
    // heroes must not reuse the tiled path
    expect(src).not.toContain('toTiled(hero');
  });
});
