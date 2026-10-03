import { beforeAll, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { PLAYER_HEIGHT, PLAYER_RADIUS } from '../../src/sim/types';
import { PLAYER_PALETTES, PlayerRenderer } from '../../src/render/players';
import { buildSavedPickup } from '../../src/render/pickups';
import { disposeOwnedObject } from '../../src/render/dispose';
import type { SolidState } from '../../src/sim/physics';
import type { PickupEnt } from '../../src/sim/sim';

const cache = vi.hoisted(() => ({ current: null as null | { support: THREE.Group } }));
vi.mock('../../src/render/modernAssets', async importOriginal => ({
  ...await importOriginal<typeof import('../../src/render/modernAssets')>(),
  getModernAssets: () => cache.current,
}));
vi.mock('../../src/render/textures', async () => {
  const { Texture } = await import('three');
  const shadow = new Texture();
  return { getTextures: () => ({ shadow }) };
});

let support: THREE.Group;
beforeAll(async () => {
  const bytes = readFileSync(new URL('../../public/modern/roster/support/support.glb', import.meta.url));
  support = (await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')).scene;
  const ctx = { fillRect() {}, clearRect() {}, strokeRect() {}, fillText() {} };
  vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) });
});

describe('saved support art', () => {
  it.each(['medikit', 'ammo', 'key', 'powerup', 'pedestal'])('%s is saved with UVs and at most five material meshes', name => {
    const source = support.getObjectByName(name)!;
    expect(source).toBeDefined();
    let meshes = 0;
    source.traverse(node => {
      if (!(node instanceof THREE.Mesh)) return;
      meshes++;
      expect(node.geometry.getAttribute('uv')).toBeDefined();
    });
    expect(meshes).toBeGreaterThan(1);
    expect(meshes).toBeLessThanOrEqual(5);
    const size = new THREE.Box3().setFromObject(source).getSize(new THREE.Vector3());
    expect(Math.max(size.x, size.y, size.z)).toBeLessThan(0.9);
  });

  it('marine has five valid skinned meshes inside the existing neutral player volume', () => {
    const marine = support.getObjectByName('marine')!;
    const bounds = new THREE.Box3().setFromObject(marine);
    expect(bounds.min.y).toBeGreaterThanOrEqual(0);
    expect(bounds.max.y).toBeLessThanOrEqual(PLAYER_HEIGHT);
    expect(bounds.max.y).toBeGreaterThan(1.8);
    expect(Math.max(Math.abs(bounds.min.x), Math.abs(bounds.max.x))).toBeLessThanOrEqual(PLAYER_RADIUS);
    let count = 0;
    marine.traverse(node => {
      if (!(node instanceof THREE.SkinnedMesh)) return;
      count++;
      const weights = node.geometry.getAttribute('skinWeight');
      const indices = node.geometry.getAttribute('skinIndex');
      for (let i = 0; i < weights.count; i++) {
        expect(weights.getX(i) + weights.getY(i) + weights.getZ(i) + weights.getW(i)).toBeCloseTo(1, 5);
        expect(indices.getX(i)).toBeLessThan(node.skeleton.bones.length);
      }
    });
    expect(count).toBe(5);
    for (const [name, height] of [['head', 1.6], ['arm_r', 1.46], ['elbow_r', 1.16], ['leg_r', 0.95], ['knee_r', 0.52]] as const) {
      expect(marine.getObjectByName(name)!.getWorldPosition(new THREE.Vector3()).y).toBeCloseTo(height, 5);
    }
  });

  it('pickup variants retain readable colors without recoloring cached shared props', () => {
    const originalColors: [THREE.MeshStandardMaterial, number][] = [];
    support.traverse(node => {
      if (node instanceof THREE.Mesh && !Array.isArray(node.material) && node.material.name === 'support.accent') {
        const material = node.material as THREE.MeshStandardMaterial;
        originalColors.push([material, material.color.getHex()]);
      }
    });
    const base = { id: 1, x: 4, z: 4, taken: false };
    const entries = [
      { ...base, kind: 'ammo', ammoType: 'shells' },
      { ...base, kind: 'powerup', powerup: 'wrath' },
    ] as PickupEnt[];
    for (const [index, p] of entries.entries()) {
      const prop = buildSavedPickup(p, support);
      const accent: THREE.MeshStandardMaterial[] = [];
      prop.traverse(node => {
        if (node instanceof THREE.Mesh && !Array.isArray(node.material) && node.material.name === 'support.accent') accent.push(node.material as THREE.MeshStandardMaterial);
      });
      expect(accent.length).toBeGreaterThan(0);
      expect(accent[0]!.color.getHex()).toBe(index === 0 ? 0xc4452a : 0xA24BFF);
      expect(prop.children.some(node => node instanceof THREE.Sprite)).toBe(true);
      disposeOwnedObject(prop);
    }
    for (const [material, color] of originalColors) expect(material.color.getHex()).toBe(color);
  });

  it('marine tint, articulation, respawn and labels remain isolated from the cached skeleton; walls still hide it', () => {
    cache.current = { support };
    const scene = new THREE.Scene();
    const renderer = new PlayerRenderer(scene);
    const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 100);
    camera.position.set(10, 1.7, 12);
    const grid = new Uint8Array(32 * 32).fill(1);
    const solid = { map: { w: 32, h: 32, grid }, doors: [], secrets: [], sealIntact: false } as unknown as SolidState;
    const pose = { id: 5, name: 'MARINE', colorIndex: 1, x: 10, z: 6, yaw: Math.PI, hp: 80, alive: true };
    try {
      renderer.update(0.016, [pose], camera, solid);
      const group = scene.children[0]!;
      expect(group.visible).toBe(true);
      let team: THREE.MeshStandardMaterial | undefined;
      group.traverse(node => { if (node instanceof THREE.Mesh && !Array.isArray(node.material) && node.material.name === 'marine.team') team = node.material as THREE.MeshStandardMaterial; });
      expect(team!.color.getHex()).toBe(PLAYER_PALETTES[1]);
      const label = group.children.find(node => node instanceof THREE.Sprite)!;
      expect(label.position.y).toBeCloseTo(PLAYER_HEIGHT + 0.45);
      for (let i = 0; i < 40; i++) renderer.update(0.016, [{ ...pose, x: 10 + i * 0.02 }], camera, solid);
      expect(Math.abs(group.getObjectByName('leg_r')!.rotation.x)).toBeGreaterThan(0.05);
      expect(support.getObjectByName('leg_r')!.rotation.x).toBe(0);
      for (let i = 0; i < 8; i++) renderer.update(0.1, [{ ...pose, alive: false }], camera, solid);
      expect(Math.abs(group.children[0]!.rotation.x)).toBeGreaterThan(1);
      renderer.update(0.016, [pose], camera, solid);
      expect(group.children[0]!.rotation.x).toBe(0);
      expect(group.getObjectByName('arm_r')!.rotation.z).toBeCloseTo(0.12);
      expect(label.position.y).toBeCloseTo(PLAYER_HEIGHT + 0.45);
      for (let x = 0; x < 32; x++) grid[4 * 32 + x] = 0;
      renderer.update(0.016, [pose], camera, solid);
      expect(group.visible).toBe(false);
      let source: THREE.SkinnedMesh | undefined;
      support.getObjectByName('marine')!.traverse(node => { if (node instanceof THREE.SkinnedMesh) source = node; });
      const dispose = vi.spyOn(source!.skeleton, 'dispose');
      renderer.dispose();
      expect(scene.children).toHaveLength(0);
      expect(dispose).not.toHaveBeenCalled();
    } finally { renderer.dispose(); cache.current = null; }
  });
});
