import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { FxRenderer } from '../../src/render/fx';
import type { ProjectileEnt } from '../../src/sim/sim';

function installCanvasStub(): void {
  if (typeof document !== 'undefined') return;
  const ctx = {
    fillStyle: '', strokeStyle: '', lineWidth: 1, lineCap: 'butt', lineJoin: 'miter', shadowColor: '', shadowBlur: 0, globalAlpha: 1,
    fillRect() {}, strokeRect() {}, clearRect() {}, beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, arc() {}, ellipse() {}, fill() {}, stroke() {}, clip() {}, rect() {},
    quadraticCurveTo() {}, bezierCurveTo() {}, createLinearGradient() { return { addColorStop() {} }; }, createRadialGradient() { return { addColorStop() {} }; },
    save() {}, restore() {}, setTransform() {}, translate() {}, rotate() {}, scale() {},
  };
  (globalThis as unknown as { document: { createElement: () => unknown } }).document = {
    createElement: () => ({ width: 0, height: 0, getContext: () => ctx }),
  };
}

const cache = vi.hoisted(() => ({ current: null as unknown }));
vi.mock('../../src/render/modernAssets', async importOriginal => ({
  ...await importOriginal<typeof import('../../src/render/modernAssets')>(),
  getModernAssets: () => cache.current,
}));
beforeAll(installCanvasStub);
afterEach(() => { cache.current = null; });

describe('FX lifecycle ownership', () => {
  function ownedDisposals(scene: THREE.Scene) {
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    scene.traverse((node) => {
      const renderable = node as THREE.Object3D & { geometry?: THREE.BufferGeometry; material?: THREE.Material | THREE.Material[] };
      if (renderable.geometry && !(node as THREE.Sprite).isSprite) geometries.add(renderable.geometry);
      if (Array.isArray(renderable.material)) renderable.material.forEach(m => materials.add(m));
      else if (renderable.material) materials.add(renderable.material);
    });
    return {
      geometries: [...geometries].map(geometry => vi.spyOn(geometry, 'dispose')),
      materials: [...materials].map(material => vi.spyOn(material, 'dispose')),
    };
  }

  it('retains prepared GPU resources across map resets and frees them on final disposal', () => {
    const scene = new THREE.Scene();
    const fx = new FxRenderer(scene);
    fx.tracer(0, 1, 0, 8, 1, 0, 'bullets');
    fx.explosion(3, 1, 0, 1.5);
    const projectile: ProjectileEnt = {
      id: 1, kind: 'nail', fromPlayer: true, x: 0, y: 1, z: 0,
      vx: 8, vy: 0, vz: 0, gravity: 0, radius: 0.1, damage: 0,
      splashRadius: 0, damageSelfPct: 0, age: 0,
    };
    fx.syncProjectiles([projectile]);

    const disposals = ownedDisposals(scene);

    fx.clearTransient();

    expect(scene.children.map(obj => obj.name)).toEqual(['fx-light-pool']);
    for (const dispose of disposals.geometries) expect(dispose).not.toHaveBeenCalled();
    for (const dispose of disposals.materials) expect(dispose).not.toHaveBeenCalled();
    fx.dispose();
    expect(scene.children).toHaveLength(0);
    for (const dispose of disposals.geometries) expect(dispose).toHaveBeenCalledTimes(1);
    for (const dispose of disposals.materials) expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('returns expired effects to reuse without leaving visible draws or active lights', () => {
    const scene = new THREE.Scene();
    const fx = new FxRenderer(scene);
    fx.tracer(0, 1, 0, 8, 1, 0, 'rail');
    fx.explosion(3, 1, 0, 1.5);
    const disposals = ownedDisposals(scene);

    fx.update(2); // longer than every timed effect and particle lifetime

    expect(scene.children.map(obj => obj.name)).toEqual(['fx-light-pool']);
    const lights = scene.children[0].children as THREE.PointLight[];
    expect(lights.every(light => light.visible && light.intensity === 0)).toBe(true);
    for (const dispose of disposals.geometries) expect(dispose).not.toHaveBeenCalled();
    for (const dispose of disposals.materials) expect(dispose).not.toHaveBeenCalled();
    fx.dispose();
    for (const dispose of disposals.geometries) expect(dispose).toHaveBeenCalledTimes(1);
    for (const dispose of disposals.materials) expect(dispose).toHaveBeenCalledTimes(1);
  });
  it('uses saved transparent explosion layers and frees instance materials while preserving their cached textures', () => {
    const flash = new THREE.Texture(), smoke = new THREE.Texture();
    const flashDispose = vi.spyOn(flash, 'dispose'), smokeDispose = vi.spyOn(smoke, 'dispose');
    cache.current = { flash, smoke };
    try {
      const scene = new THREE.Scene();
      const fx = new FxRenderer(scene);
      fx.explosion(3, 1, 0, 2);
      const sprites: THREE.Sprite[] = [];
      scene.traverse(node => { if (node instanceof THREE.Sprite) sprites.push(node); });
      expect(sprites.some(sprite => sprite.material.map === flash)).toBe(true);
      expect(sprites.filter(sprite => sprite.material.map === smoke)).toHaveLength(3);
      const disposals = ownedDisposals(scene);
      fx.update(2);
      expect(scene.children.map(obj => obj.name)).toEqual(['fx-light-pool']);
      fx.dispose();
      disposals.materials.forEach(dispose => expect(dispose).toHaveBeenCalledTimes(1));
      expect(flashDispose).not.toHaveBeenCalled();
      expect(smokeDispose).not.toHaveBeenCalled();
    } finally { cache.current = null; flash.dispose(); smoke.dispose(); }
  });

  it('keeps exactly three attached lights through overlapping muzzle, rail, explosion and projectile effects', () => {
    const scene = new THREE.Scene();
    const fx = new FxRenderer(scene);
    const visibleLights = () => {
      const lights: THREE.PointLight[] = [];
      scene.traverseVisible(obj => { if (obj instanceof THREE.PointLight) lights.push(obj); });
      return lights;
    };
    const originalIds = visibleLights().map(light => light.id);
    expect(originalIds).toHaveLength(3);
    fx.muzzleFlashWorld(1, 2, 3, 1);
    fx.tracer(1, 2, 3, 8, 2, 3, 'rail');
    fx.explosion(5, 2, 3, 2);
    fx.syncProjectiles([{ id: 1, kind: 'fireball', x: 2, y: 2, z: 3, vx: 1, vy: 0, vz: 0 } as ProjectileEnt,
      { id: 2, kind: 'voidorb', x: 3, y: 2, z: 3, vx: 1, vy: 0, vz: 0 } as ProjectileEnt]);
    fx.update(.01);
    expect(visibleLights().map(light => light.id)).toEqual(originalIds);
    expect(visibleLights().every(light => light.intensity > 0)).toBe(true);
    fx.clearTransient();
    expect(visibleLights().map(light => light.id)).toEqual(originalIds);
    expect(visibleLights().every(light => light.intensity === 0)).toBe(true);
    fx.dispose();
  });

  it.each([false, true])('uses only warmed geometry/material instances for first shots and a reset (modern=%s)', (modern) => {
    cache.current = modern ? { flash: new THREE.Texture(), smoke: new THREE.Texture() } : null;
    const scene = new THREE.Scene();
    const fx = new FxRenderer(scene);
    const warmup = fx.prepareForWarmup();
    const preparedGeometry = new Set<THREE.BufferGeometry>();
    const preparedMaterials = new Set<THREE.Material>();
    warmup.group.traverse(obj => {
      if (obj instanceof THREE.Mesh || obj instanceof THREE.Sprite) {
        preparedGeometry.add(obj.geometry);
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        mats.forEach(mat => preparedMaterials.add(mat));
      }
    });
    expect(preparedGeometry.size).toBeGreaterThan(8);
    warmup.release();
    warmup.release(); // cleanup is safe if an offscreen render failed
    for (let run = 0; run < 2; run++) {
      fx.muzzleFlashWorld(0, 1, 0, 1);
      for (let i = 0; i < 12; i++) fx.tracer(0, 1, 0, 8, 1, 0, 'bullets');
      fx.tracer(0, 1, 0, 8, 1, 0, 'rail');
      fx.explosion(3, 1, 0, 2);
      fx.blood(2, 1, 0, true);
      fx.syncProjectiles(['nail', 'grenade', 'voidorb', 'plasma', 'spit', 'fireball', 'bolt', 'orb'].map((kind, id) => ({
        id, kind, x: 0, y: 1, z: 0, vx: 1, vy: 0, vz: 0,
      } as ProjectileEnt)));
      scene.traverse(obj => {
        if (obj instanceof THREE.Mesh || obj instanceof THREE.Sprite) {
          expect(preparedGeometry.has(obj.geometry), `new geometry for ${obj.type}`).toBe(true);
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          mats.forEach(mat => expect(preparedMaterials.has(mat), `new material for ${obj.type}`).toBe(true));
        }
      });
      fx.clearTransient();
    }
    fx.dispose();
  });

});
