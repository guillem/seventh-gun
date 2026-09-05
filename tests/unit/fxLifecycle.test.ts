import { beforeAll, describe, expect, it, vi } from 'vitest';
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

beforeAll(installCanvasStub);

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

  it('releases tracer, explosion, particle, and projectile geometry/materials on clear', () => {
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

    expect(scene.children).toHaveLength(0);
    for (const dispose of disposals.geometries) expect(dispose).toHaveBeenCalledTimes(1);
    for (const dispose of disposals.materials) expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('releases expired timed effects and particles without waiting for a map reset', () => {
    const scene = new THREE.Scene();
    const fx = new FxRenderer(scene);
    fx.tracer(0, 1, 0, 8, 1, 0, 'rail');
    fx.explosion(3, 1, 0, 1.5);
    const disposals = ownedDisposals(scene);

    fx.update(2); // longer than every timed effect and particle lifetime

    expect(scene.children).toHaveLength(0);
    for (const dispose of disposals.geometries) expect(dispose).toHaveBeenCalledTimes(1);
    for (const dispose of disposals.materials) expect(dispose).toHaveBeenCalledTimes(1);
  });
});
