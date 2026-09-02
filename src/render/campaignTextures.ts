// Campaign-only texture packs. Maze / #m= maps keep getTextures() themes.
//
// OPUS owns the painted 128px generators. This file is a distinguishable
// stub (tint/contrast vs the generic industrial/organic/stone/tech atlas)
// so the renderer hook and extra-decal placement can land first.
//
// If you are Opus replacing this file: keep the public API below exactly.
import * as THREE from 'three';

export const CAMPAIGN_ART_IDS = ['foundry', 'gullet', 'catacombs', 'pit', 'spire', 'ward', 'sanctum'] as const;
export type CampaignArtId = typeof CAMPAIGN_ART_IDS[number];

export interface CampaignTextureLib {
  walls: THREE.Texture;
  floors: THREE.Texture;
  ceilings: THREE.Texture;
  door: THREE.Texture;
  sky?: THREE.Texture; // e.g. pit outdoor
  extraDecals: { id: string; tex: THREE.Texture }[];
}

export function campaignArtIdFromIndex(n: number): CampaignArtId {
  const i = Math.min(CAMPAIGN_ART_IDS.length, Math.max(1, n | 0));
  return CAMPAIGN_ART_IDS[i - 1];
}

/** Seed forms: `campaign:01-foundry`, `campaign:03`, `campaign:foundry`. */
export function campaignArtIdFromSeed(seed: string): CampaignArtId | undefined {
  if (!seed.startsWith('campaign:')) return undefined;
  const rest = seed.slice('campaign:'.length);
  const numbered = /^0?([1-7])(?:-|$)/.exec(rest);
  if (numbered) return campaignArtIdFromIndex(Number(numbered[1]));
  const name = rest.replace(/^\d+-/, '');
  return (CAMPAIGN_ART_IDS as readonly string[]).includes(name)
    ? name as CampaignArtId
    : undefined;
}

const cache = new Map<CampaignArtId, CampaignTextureLib>();

export function getCampaignTextures(id: CampaignArtId): CampaignTextureLib {
  const hit = cache.get(id);
  if (hit) return hit;
  const lib = buildStubPack(id);
  cache.set(id, lib);
  return lib;
}

// ---------------------------------------------------------------- stub painting
// OPUS TODO: replace buildStubPack + PALETTES with unique painted generators
// per CampaignArtId (walls/floors/ceilings/door/sky/extraDecals). Keep the
// extraDecal `id`s stable — placement in campaignDecor.ts keys off them.

type Ctx = CanvasRenderingContext2D;

interface PackPalette {
  wall: string;
  floor: string;
  ceil: string;
  door: string;
  sky?: string;
  accent: string;
  grout: string;
  contrast: number;
}

const PALETTES: Record<CampaignArtId, PackPalette> = {
  foundry: { wall: '#5c2a14', floor: '#3a1e10', ceil: '#1c100c', door: '#6e3210', accent: '#ff6a18', grout: '#2a1208', contrast: 1.18 },
  gullet: { wall: '#5c1028', floor: '#3a0c1c', ceil: '#1a0810', door: '#6a1830', accent: '#e05048', grout: '#2a0814', contrast: 1.08 },
  catacombs: { wall: '#3c3a32', floor: '#2a2822', ceil: '#161410', door: '#4a4438', accent: '#d8c8a0', grout: '#1a1814', contrast: 1.12 },
  pit: { wall: '#2e2610', floor: '#221c0c', ceil: '#12100a', door: '#3a3014', sky: '#3a4020', accent: '#c8d040', grout: '#141208', contrast: 1.2 },
  spire: { wall: '#2a2038', floor: '#1c1628', ceil: '#100c18', door: '#3a2c4a', accent: '#d4a84a', grout: '#120e1c', contrast: 1.14 },
  ward: { wall: '#1a2e2e', floor: '#142424', ceil: '#0c1616', door: '#244040', accent: '#7ad0c8', grout: '#0a1414', contrast: 1.16 },
  sanctum: { wall: '#2a1438', floor: '#1c0e28', ceil: '#100818', door: '#3a1850', accent: '#c46aff', grout: '#140820', contrast: 1.22 },
};

/** Stable extra-decal ids. Opus: paint these; do not rename. */
export const CAMPAIGN_DECAL_IDS: Record<CampaignArtId, string[]> = {
  foundry: ['furnace', 'chain', 'slag'],
  gullet: ['tooth', 'drip', 'membrane'],
  catacombs: ['ossuary', 'epitaph', 'femur'],
  pit: ['grate', 'acid', 'rust'],
  spire: ['window', 'brass', 'banner'],
  ward: ['restraint', 'chart', 'wardlamp'],
  sanctum: ['sigil', 'relic', 'veil'],
};

function canvas(size: number): { c: HTMLCanvasElement; g: Ctx } {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  return { c, g };
}

function toTexture(c: HTMLCanvasElement, wrap = true): THREE.Texture {
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestMipmapLinearFilter;
  t.wrapS = t.wrapT = wrap ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  t.repeat.set(1, 1);
  t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

function hexRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function tintedField(size: number, base: string, grout: string, contrast: number, seed: number): HTMLCanvasElement {
  const { c, g } = canvas(size);
  g.fillStyle = base;
  g.fillRect(0, 0, size, size);
  g.fillStyle = grout;
  const step = size >= 128 ? 32 : 16;
  for (let x = 0; x < size; x += step) g.fillRect(x, 0, 2, size);
  for (let y = 0; y < size; y += step) g.fillRect(0, y, size, 2);
  const [r, gv, b] = hexRgb(base);
  for (let i = 0; i < size * 6; i++) {
    const x = (seed * 17 + i * 31) % size;
    const y = (seed * 13 + i * 47) % size;
    const k = ((i * 19 + seed) % 40) - 20;
    const mul = contrast;
    g.fillStyle = `rgba(${clampByte((r + k) * mul)},${clampByte((gv + k) * mul)},${clampByte((b + k) * mul)},0.18)`;
    g.fillRect(x, y, 1 + (i % 3), 1 + ((i + 1) % 2));
  }
  return c;
}

function clampByte(n: number): number {
  return Math.max(0, Math.min(255, n | 0));
}

function stubDecal(id: string, accent: string, grout: string): HTMLCanvasElement {
  const { c, g } = canvas(64);
  g.clearRect(0, 0, 64, 64);
  g.strokeStyle = accent;
  g.fillStyle = accent;
  g.lineWidth = 3;
  g.shadowColor = accent;
  g.shadowBlur = 5;
  // OPUS TODO: unique painted icon per extraDecal id.
  if (id === 'furnace' || id === 'sigil' || id === 'grate') {
    g.strokeRect(10, 10, 44, 44);
    g.beginPath(); g.moveTo(32, 14); g.lineTo(50, 50); g.lineTo(14, 50); g.closePath(); g.stroke();
  } else if (id === 'chain' || id === 'restraint' || id === 'femur') {
    g.beginPath(); g.moveTo(18, 8); g.lineTo(18, 56); g.moveTo(46, 8); g.lineTo(46, 56); g.stroke();
    g.strokeRect(14, 20, 36, 8); g.strokeRect(14, 36, 36, 8);
  } else if (id === 'ossuary' || id === 'shelf' || id === 'chart') {
    g.fillStyle = grout;
    g.globalAlpha = 0.55;
    g.fillRect(6, 18, 52, 10); g.fillRect(6, 36, 52, 10);
    g.globalAlpha = 1;
    g.strokeRect(6, 18, 52, 10); g.strokeRect(6, 36, 52, 10);
  } else if (id === 'window' || id === 'banner' || id === 'veil') {
    g.strokeRect(16, 4, 32, 56);
    g.beginPath(); g.moveTo(16, 32); g.lineTo(48, 32); g.stroke();
  } else if (id === 'acid' || id === 'drip' || id === 'slag') {
    g.beginPath(); g.arc(32, 22, 12, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.moveTo(32, 34); g.lineTo(24, 56); g.lineTo(40, 56); g.closePath(); g.fill();
  } else {
    g.beginPath(); g.arc(32, 32, 20, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.moveTo(20, 32); g.lineTo(44, 32); g.moveTo(32, 20); g.lineTo(32, 44); g.stroke();
  }
  g.shadowBlur = 0;
  return c;
}

function stubSky(hex: string): HTMLCanvasElement {
  const { c, g } = canvas(256);
  const [r, gv, b] = hexRgb(hex);
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, `rgb(${Math.min(255, r + 30)},${Math.min(255, gv + 20)},${b})`);
  grad.addColorStop(1, hex);
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  g.fillStyle = 'rgba(255,255,220,0.35)';
  for (let i = 0; i < 80; i++) {
    const x = (i * 47) % 256, y = (i * 29) % 90;
    g.fillRect(x, y, 1, 1);
  }
  return c;
}

function buildStubPack(id: CampaignArtId): CampaignTextureLib {
  const p = PALETTES[id];
  const seed = CAMPAIGN_ART_IDS.indexOf(id) * 97 + 11;
  const lib: CampaignTextureLib = {
    walls: toTexture(tintedField(128, p.wall, p.grout, p.contrast, seed)),
    floors: toTexture(tintedField(128, p.floor, p.grout, p.contrast, seed + 3)),
    ceilings: toTexture(tintedField(128, p.ceil, p.grout, p.contrast * 0.92, seed + 7)),
    door: toTexture(tintedField(128, p.door, p.accent, p.contrast, seed + 13)),
    extraDecals: CAMPAIGN_DECAL_IDS[id].map(decalId => ({
      id: decalId,
      tex: toTexture(stubDecal(decalId, p.accent, p.grout), false),
    })),
  };
  if (p.sky) lib.sky = toTexture(stubSky(p.sky));
  // pit is outdoor — always ship a sky even if palette later drops the field
  if (id === 'pit' && !lib.sky) lib.sky = toTexture(stubSky('#3a4020'));
  return lib;
}
