import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { disposeOwnedObject } from '../../src/render/dispose';

describe('disposeOwnedObject', () => {
  it('frees each owned geometry/material/canvas texture once while preserving cached textures', () => {
    const root = new THREE.Group();
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshBasicMaterial();
    const cachedTexture = new THREE.Texture();
    const labelTexture = new THREE.Texture();
    const first = new THREE.Mesh(geometry, material);
    const second = new THREE.Mesh(geometry, material);
    second.userData.ownedTextures = [labelTexture, labelTexture];
    // A shared cache texture can be used by the disposed material without
    // becoming owned by this transient rig.
    material.map = cachedTexture;
    root.add(first, second);

    const geometryDispose = vi.spyOn(geometry, 'dispose');
    const materialDispose = vi.spyOn(material, 'dispose');
    const labelDispose = vi.spyOn(labelTexture, 'dispose');
    const cachedDispose = vi.spyOn(cachedTexture, 'dispose');

    disposeOwnedObject(root);

    expect(root.parent).toBeNull();
    expect(geometryDispose).toHaveBeenCalledTimes(1);
    expect(materialDispose).toHaveBeenCalledTimes(1);
    expect(labelDispose).toHaveBeenCalledTimes(1);
    expect(cachedDispose).not.toHaveBeenCalled();
  });

  it('does not dispose Three’s shared sprite quad while a different sprite remains live', () => {
    const root = new THREE.Group();
    const transient = new THREE.Sprite(new THREE.SpriteMaterial());
    const live = new THREE.Sprite(new THREE.SpriteMaterial());
    root.add(transient);
    const spriteGeometryDispose = vi.spyOn(transient.geometry, 'dispose');

    disposeOwnedObject(root);

    expect(transient.geometry).toBe(live.geometry);
    expect(spriteGeometryDispose).not.toHaveBeenCalled();
  });
});
