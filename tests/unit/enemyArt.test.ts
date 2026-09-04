// Enemy skins + projectile bolt sprites. Node has no canvas, so painting is
// exercised against a ctx stub (same trick as campaignArt) and the art rules
// that a stub can't see are asserted against the source.
import { describe, it, expect, beforeAll } from 'vitest';
import type * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const TEX_PATH = join(process.cwd(), 'src', 'render', 'textures.ts');
const PROJ_PATH = join(process.cwd(), 'src', 'render', 'projectiles.ts');
const FX_PATH = join(process.cwd(), 'src', 'render', 'fx.ts');
const tex = readFileSync(TEX_PATH, 'utf8');
const proj = readFileSync(PROJ_PATH, 'utf8');
const fx = readFileSync(FX_PATH, 'utf8');

function installCanvasStub(): void {
  if (typeof document !== 'undefined') return;
  const ctx = {
    fillStyle: '', strokeStyle: '', lineWidth: 1, lineCap: 'butt', lineJoin: 'miter',
    shadowColor: '', shadowBlur: 0, globalAlpha: 1, globalCompositeOperation: 'source-over',
    fillRect() {}, strokeRect() {}, clearRect() {},
    beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, arc() {}, ellipse() {},
    fill() {}, stroke() {}, clip() {}, rect() {},
    quadraticCurveTo() {}, bezierCurveTo() {},
    createLinearGradient() { return { addColorStop() {} }; },
    createRadialGradient() { return { addColorStop() {} }; },
    save() {}, restore() {}, setTransform() {}, translate() {}, rotate() {}, scale() {},
  };
  (globalThis as unknown as { document: { createElement: (tag: string) => unknown } }).document = {
    createElement(tag: string) {
      if (tag === 'canvas') return { width: 0, height: 0, getContext: () => ctx };
      return {};
    },
  };
}

beforeAll(() => {
  installCanvasStub();
});

const SKINS = ['husk', 'crawler', 'slab', 'wisp', 'hierophant', 'fiend'] as const;
const BOLTS = ['plasma', 'spit', 'fireball', 'bolt', 'orb'] as const;

describe('enemy skin library', () => {
  it('paints and caches a texture for every skin, fiend included', async () => {
    const { getTextures } = await import('../../src/render/textures');
    const a = getTextures();
    const b = getTextures();
    expect(a).toBe(b);
    for (const id of SKINS) {
      expect(a.skins[id], `${id} skin missing`).toBeTruthy();
      expect(a.skins[id].colorSpace).toBe('srgb');
    }
    // every skin is its own canvas, not a shared one
    expect(new Set(SKINS.map(id => a.skins[id])).size).toBe(SKINS.length);
  });

  it('keeps the surface art untouched alongside the new skins', async () => {
    const { getTextures } = await import('../../src/render/textures');
    const t = getTextures();
    for (const theme of ['industrial', 'organic', 'stone', 'tech'] as const) {
      expect(t.walls[theme]).toBeTruthy();
      expect(t.floors[theme]).toBeTruthy();
      expect(t.ceilings[theme]).toBeTruthy();
    }
    expect(t.door).toBeTruthy();
    expect(t.sky).toBeTruthy();
    expect(t.particle && t.shadow && t.flash && t.glow).toBeTruthy();
  });
});

describe('enemy skin source', () => {
  it('has a painter per creature on its agreed seed', () => {
    const seeds: Record<string, string> = {
      skinHusk: 'skin-husk', skinCrawler: 'skin-crawler', skinSlab: 'skin-slab',
      skinWisp: 'skin-wisp', skinHierophant: 'skin-hier', skinFiend: 'skin-fiend',
    };
    for (const [fn, seed] of Object.entries(seeds)) {
      expect(tex, `${fn} missing`).toContain(`function ${fn}(`);
      expect(tex, `${fn} lost its seed`).toContain(`'${seed}'`);
    }
  });

  it('keeps each creature on its established base colour', () => {
    // husk moved to cold slate (was olive #4a5340) and slab to sooty umber
    // (was rust #6e4438) in the silhouette redesigns
    // hierophant moved to a darker void violet (was #2c2433)
    for (const hex of ['#22262b', '#2a2018', '#241726', '#1a2035', '#241c2e']) {
      expect(tex, `base colour ${hex} drifted`).toContain(hex);
    }
    // fiend keeps its dark crimson; every accent hue (hierophant violet,
    // fiend ember) now lives on eyes/orbs/tips in enemies.ts, not in a skin
    expect(tex).toContain('#3a0f16');
  });

  it('paints every skin on a 64px canvas', () => {
    const body = (fn: string): string => {
      const at = tex.indexOf(`function ${fn}(`);
      return tex.slice(at, tex.indexOf('\n}\n', at));
    };
    // the redesigned skins are deliberately restrained: the mesh carries the
    // shape, the skin carries value, and 64px keeps the pixel chunky
    for (const fn of ['skinHusk', 'skinSlab', 'skinHierophant', 'skinFiend', 'skinCrawler', 'skinWisp']) {
      expect(body(fn), `${fn} changed size`).toContain('canvas(64)');
    }
  });

  it('gives the skins real structure, not just recoloured blobs', () => {
    const vocab: Record<string, string[]> = {
      skinHusk: ['rib', 'sternum', 'spine', 'bruise', 'slate'],
      skinSlab: ['plate', 'seam', 'rivet', 'scorch', 'soot'],
      skinHierophant: ['pleat', 'void', 'hem', 'fold'],
      skinFiend: ['hide', 'scale', 'char', 'crimson'],
    };
    for (const [fn, words] of Object.entries(vocab)) {
      const at = tex.indexOf(`function ${fn}(`);
      const body = tex.slice(tex.lastIndexOf('// ', at), tex.indexOf('\n}\n', at)).toLowerCase();
      for (const w of words) expect(body, `${fn} missing "${w}"`).toContain(w.toLowerCase());
    }
  });

  it('tiles cleanly: wrapDraw is local and re-seeds inside the callback', () => {
    expect(tex).toContain('function wrapDraw(');
    expect(tex).not.toContain("from './campaignTextures'");
    // every wrapDraw callback must build its rng inside, or the nine torus
    // copies draw different strokes and the seam comes back
    // After the silhouette redesigns only the wisp's ectoplasm swirl still
    // tiles on the torus, so the true count is 1. The floor pins that the
    // wisp keeps its seamless pass; the re-seed check below is the real rule.
    const calls = tex.split('wrapDraw(g, ').slice(1);
    expect(calls.length).toBeGreaterThanOrEqual(1);
    for (const call of calls) {
      const body = call.slice(0, call.indexOf('});'));
      expect(body, 'wrapDraw callback does not re-seed').toMatch(/const r = (skinRng|makeRng)\(/);
    }
  });

  it('keeps the canvas/texture conventions and the getTextures cache', () => {
    expect(tex).toContain('THREE.NearestFilter');
    expect(tex).toContain('THREE.NearestMipmapLinearFilter');
    expect(tex).toContain('THREE.RepeatWrapping');
    expect(tex).toContain('THREE.SRGBColorSpace');
    expect(tex).toContain('if (cached) return cached;');
    expect(tex).toContain("fiend: toTexture(skinFiend()),");
    expect(tex).not.toMatch(/:\s*any\b/);
  });
});

describe('projectile sprites', () => {
  it('paints, caches and clamps a sprite per bolt kind', async () => {
    const { getProjectileSprite, PROJECTILE_KINDS, isProjectileKind } = await import('../../src/render/projectiles');
    expect([...PROJECTILE_KINDS]).toEqual([...BOLTS]);
    const seen = new Set<unknown>();
    for (const kind of BOLTS) {
      const t = getProjectileSprite(kind);
      expect(getProjectileSprite(kind), `${kind} not cached`).toBe(t);
      expect(t.colorSpace).toBe('srgb');
      expect(t.magFilter).toBe(1003);            // THREE.NearestFilter
      expect(t.wrapS).toBe(1001);                // THREE.ClampToEdgeWrapping
      seen.add(t);
    }
    expect(seen.size).toBe(BOLTS.length);
    expect(isProjectileKind('nail')).toBe(false);
    expect(isProjectileKind('grenade')).toBe(false);
    expect(isProjectileKind('voidorb')).toBe(false);
    expect(isProjectileKind('fireball')).toBe(true);
  });

  it('is re-exported from the texture entry point', async () => {
    const texMod = await import('../../src/render/textures');
    const projMod = await import('../../src/render/projectiles');
    expect(texMod.getProjectileSprite).toBe(projMod.getProjectileSprite);
    expect(texMod.getProjectileSprite('orb')).toBe(projMod.getProjectileSprite('orb'));
  });

  it('gives every bolt a core, a corona and kind-specific detail', () => {
    for (const kind of BOLTS) expect(proj).toContain(`function ${kind}Sprite(`);
    expect(proj).toContain('function halo(');
    expect(proj).toContain('function spike(');
    expect(proj).toContain('function crackle(');
    const vocab: Record<string, string[]> = {
      plasma: ['containment', 'lightning', 'hot core'],
      spit: ['globule', 'bubbles', 'droplets'],
      fireball: ['soot', 'tongues', 'ember'],
      bolt: ['lens flare', 'shock ring', 'needle core'],
      orb: ['spiral', 'void pupil', 'halo'],
    };
    for (const [kind, words] of Object.entries(vocab)) {
      const at = proj.indexOf(`function ${kind}Sprite(`);
      const body = proj.slice(at, proj.indexOf('\n}\n', at)).toLowerCase();
      for (const w of words) expect(body, `${kind} missing "${w}"`).toContain(w);
    }
    expect(proj).toContain("makeRng('proj-'");
    expect(proj).not.toMatch(/:\s*any\b/);
  });
});

describe('fx projectile hook', () => {
  it('routes the five bolt kinds through the painted sprite', () => {
    expect(fx).toContain("from './projectiles'");
    expect(fx).toContain('if (isProjectileKind(kind)) return this.buildEnergyBolt(kind);');
    expect(fx).toContain('new THREE.Sprite(new THREE.SpriteMaterial({');
    expect(fx).toContain('blending: THREE.AdditiveBlending');
    expect(fx).toContain('new THREE.SphereGeometry(spec.core, 8, 8)');
    for (const kind of BOLTS) expect(fx, `${kind} has no bolt spec`).toContain(`${kind}: { core:`);
  });

  it('leaves nail, grenade and voidorb on their own meshes', () => {
    for (const kind of ['nail', 'grenade', 'voidorb']) {
      expect(fx, `${kind} case lost`).toContain(`case '${kind}': {`);
    }
    // and the sim-side spin/aim behaviour is untouched
    expect(fx).toContain("if (p.kind === 'grenade') mesh.rotation.x += 0.3;");
    expect(fx).toContain("if (p.kind === 'voidorb') mesh.rotation.y += 0.2;");
  });

  it('builds a full rig for every bolt kind without touching WebGL', async () => {
    const three = await import('three');
    const { FxRenderer } = await import('../../src/render/fx');
    const scene = new three.Scene();
    const rndr = new FxRenderer(scene);
    const shots = BOLTS.map((kind, i) => ({
      id: i, kind, x: i, y: 1, z: 0, vx: 0, vy: 0, vz: 12,
    }));
    rndr.syncProjectiles(shots as never);
    const sprites: THREE.Sprite[] = [];
    scene.traverse(o => { if ((o as THREE.Sprite).isSprite) sprites.push(o as THREE.Sprite); });
    // head + two trail puffs per bolt
    expect(sprites.length).toBe(BOLTS.length * 3);
    for (const s of sprites) {
      expect((s.material as THREE.SpriteMaterial).blending).toBe(three.AdditiveBlending);
      expect((s.material as THREE.SpriteMaterial).map).toBeTruthy();
    }
    // trail puffs hang behind the bolt on the local -z (velocity) axis
    expect(sprites.filter(s => s.position.z < 0).length).toBe(BOLTS.length * 2);
    rndr.clearTransient();
  });
});
