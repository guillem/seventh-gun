// Campaign art packs: identity + "not an empty stub" guards. Node env has no
// canvas, so we never call getCampaignTextures — we read the source instead.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CAMPAIGN_ART_IDS, CAMPAIGN_PACK_MARKERS, campaignArtIdFromIndex,
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
