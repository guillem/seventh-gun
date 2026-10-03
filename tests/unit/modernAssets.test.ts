import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { cloneOwnedModel } from '../../src/render/modernAssets';
import { disposeOwnedObject } from '../../src/render/dispose';

describe('saved model clone ownership', () => {
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
