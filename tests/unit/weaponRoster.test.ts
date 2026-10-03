import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { WEAPONS } from '../../src/sim/weapons';
import { animateAuthoredWeapon, buildWorldGun } from '../../src/render/viewmodels';
import { cloneOwnedModel } from '../../src/render/modernAssets';

const cache = vi.hoisted(() => ({ current: null as null | { weapons: Record<number, THREE.Group> } }));
vi.mock('../../src/render/modernAssets', async importOriginal => ({
  ...await importOriginal<typeof import('../../src/render/modernAssets')>(),
  getModernAssets: () => cache.current,
}));

async function load(id: number) {
  const bytes = readFileSync(new URL(`../../public/modern/roster/weapons/${id}.glb`, import.meta.url));
  return new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
}

function visibleBounds(group: THREE.Object3D) {
  group.updateMatrixWorld(true);
  const bounds = new THREE.Box3();
  group.traverseVisible(node => {
    if (!(node instanceof THREE.Mesh)) return;
    node.geometry.computeBoundingBox();
    bounds.union(node.geometry.boundingBox!.clone().applyMatrix4(node.matrixWorld));
  });
  return bounds;
}

describe('complete saved weapon roster', () => {
  it.each(WEAPONS)('$name has a neutral forward muzzle, removable hands and all three authored actions', async def => {
    const model = await load(def.id);
    model.scene.updateMatrixWorld(true);
    for (const name of ['weapon_motion', 'equip_motion', 'recoil_motion', 'mechanism', 'hands', 'right_hand', 'left_hand']) {
      expect(model.scene.getObjectByName(name), `${def.name}: ${name}`).toBeDefined();
    }
    const muzzle = model.scene.getObjectByName('muzzle')!.getWorldPosition(new THREE.Vector3());
    expect(muzzle.x).toBeCloseTo(0, 5);
    expect(muzzle.y).toBeGreaterThan(0.04);
    expect(muzzle.y).toBeLessThan(0.08);
    expect(muzzle.z).toBeLessThan(-0.3);
    const fire = model.animations.find(a => a.name === 'fire')!;
    expect(fire.duration).toBeCloseTo(def.fireInterval, 5);
    expect(model.animations.map(a => a.name).sort()).toEqual(['equip', 'fire', 'idle']);
    const trackNames = model.animations.flatMap(a => a.tracks.map(t => t.name));
    expect(trackNames.every(name => /^(weapon_motion|equip_motion|recoil_motion|mechanism|left_hand)\./.test(name))).toBe(true);
    let triangles = 0;
    let meshes = 0;
    model.scene.traverse(node => {
      if (!(node instanceof THREE.Mesh)) return;
      meshes++;
      triangles += (node.geometry.index?.count ?? node.geometry.getAttribute('position').count) / 3;
      expect(node.geometry.getAttribute('uv')).toBeDefined();
    });
    expect(triangles).toBeGreaterThan(8000);
    expect(triangles).toBeLessThan(30000);
    expect(meshes).toBeLessThanOrEqual(24);
  });

  it('samples firing from the exact cooldown and leaves the cached source pose untouched', async () => {
    const model = await load(1);
    const copy = cloneOwnedModel(model.scene);
    const animate = animateAuthoredWeapon(copy, model.animations, 1);
    const base = { moving: 0, firing: false, recoil: 0, time: 0, fireCooldown: 0 };
    animate.update(1, base); // complete equip
    const rest = copy.getObjectByName('mechanism')!.position.clone();
    animate.update(0.035, { ...base, firing: true, recoil: 1, fireCooldown: 0.265 });
    expect(copy.getObjectByName('mechanism')!.position.z).toBeGreaterThan(rest.z + 0.02);
    expect(copy.getObjectByName('recoil_motion')!.position.z).toBeGreaterThan(0.02);
    animate.update(0.30, base);
    expect(copy.getObjectByName('mechanism')!.position.distanceTo(rest)).toBeLessThan(0.0001);
    expect(model.scene.getObjectByName('mechanism')!.position.length()).toBe(0);
    expect(model.scene.getObjectByName('equip_motion')!.position.length()).toBe(0);
    animate.dispose();
  });

  it('the shotgun support hand stays attached throughout the pump stroke', async () => {
    const model = await load(2);
    const copy = cloneOwnedModel(model.scene);
    const animation = animateAuthoredWeapon(copy, model.animations, 2);
    for (const phase of [0, 0.2, 0.3, 0.54, 0.9, 1.05]) {
      animation.update(1, { moving: 0, firing: phase < 1.05, recoil: 0,
        time: 0, fireCooldown: 1.05 - phase });
      const pump = copy.getObjectByName('mechanism')!;
      const support = copy.getObjectByName('left_hand')!;
      expect(support.position.z).toBeCloseTo(pump.position.z, 5);
    }
    animation.dispose();
  });

  it('world pickups use every authored model and exclude hidden arms from their recentering bounds', async () => {
    for (const def of WEAPONS) {
      const model = await load(def.id);
      cache.current = { weapons: { [def.id]: model.scene } };
      try {
        const pickup = buildWorldGun(def.id);
        expect(pickup.getObjectByName('hands')!.visible).toBe(false);
        pickup.rotation.set(0, 0, 0);
        const center = visibleBounds(pickup).getCenter(new THREE.Vector3());
        expect(center.length()).toBeLessThan(0.003);
        expect(model.scene.getObjectByName('hands')!.visible).toBe(true);
      } finally { cache.current = null; }
    }
  });
});
