import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { cloneOwnedModel } from '../../src/render/modernAssets';
import { disposeOwnedObject } from '../../src/render/dispose';
import { ENEMIES, enemyVolumeY } from '../../src/sim/enemyTypes';

async function loadModel(name: string): Promise<THREE.Group> {
  const bytes = readFileSync(new URL(`../../public/modern/models/${name}.glb`, import.meta.url));
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return (await new GLTFLoader().parseAsync(buffer, '')).scene;
}

describe('saved modern art assets', () => {
  it('pistol exports the forward muzzle, slide and removable hands contract', async () => {
    const model = await loadModel('pistol');
    model.updateMatrixWorld(true);
    const muzzle = model.getObjectByName('muzzle');
    expect(muzzle).toBeDefined();
    const point = muzzle!.getWorldPosition(new THREE.Vector3());
    expect(point.z).toBeLessThan(-0.1);
    expect(Math.abs(point.x)).toBeLessThan(0.01);
    expect(point.y).toBeCloseTo(0.055, 2);
    expect(model.getObjectByName('slide')).toBeDefined();
    expect(model.getObjectByName('hands')).toBeDefined();
  });

  it('husk exports articulation and stays within the existing vertical hit volume', async () => {
    const model = await loadModel('husk');
    for (const name of ['head', 'arm_l', 'arm_r', 'leg_l', 'leg_r']) expect(model.getObjectByName(name), name).toBeDefined();
    const bounds = new THREE.Box3().setFromObject(model);
    const volume = enemyVolumeY(ENEMIES.husk);
    expect(bounds.min.y).toBeGreaterThanOrEqual(-0.03);
    expect(bounds.max.y).toBeLessThanOrEqual(volume.yMax + 0.02);
    expect(bounds.max.y).toBeGreaterThan(1.7);
  });

  it('architecture exports the required reusable wall assemblies', async () => {
    const model = await loadModel('architecture');
    for (const name of ['wall_rib', 'wall_fixture', 'pipe_run']) expect(model.getObjectByName(name), name).toBeDefined();
  });

  it('retiring one rig cannot dispose cached or other live model resources', () => {
    const source = new THREE.Group();
    const texture = new THREE.Texture();
    const geometry = new THREE.BoxGeometry();
    const material = new THREE.MeshStandardMaterial({ map: texture });
    source.add(new THREE.Mesh(geometry, material), new THREE.Mesh(geometry, material));
    const first = cloneOwnedModel(source);
    const second = cloneOwnedModel(source);
    const geometryDispose = vi.spyOn(geometry, 'dispose');
    const materialDispose = vi.spyOn(material, 'dispose');
    const textureDispose = vi.spyOn(texture, 'dispose');
    let secondMesh: THREE.Mesh | undefined;
    second.traverse(node => { if (node instanceof THREE.Mesh) secondMesh = node; });
    const liveDispose = vi.spyOn(secondMesh!.geometry, 'dispose');
    disposeOwnedObject(first);
    expect(geometryDispose).not.toHaveBeenCalled();
    expect(materialDispose).not.toHaveBeenCalled();
    expect(textureDispose).not.toHaveBeenCalled();
    expect(liveDispose).not.toHaveBeenCalled();
    expect((secondMesh!.material as THREE.MeshStandardMaterial).map).toBe(texture);
    disposeOwnedObject(second);
    disposeOwnedObject(source);
    texture.dispose();
  });
});
