import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { bindCreatureSurface, type CreatureSurfaces } from '../../src/render/creatureMaterials';

function surfaces(): CreatureSurfaces {
  return Object.fromEntries(['skin', 'raw', 'armour', 'bone'].map(role => [role, {
    albedo: new THREE.Texture(), normal: new THREE.Texture(), roughness: new THREE.Texture(),
  }])) as CreatureSurfaces;
}

describe('saved creature material responses', () => {
  it('uses shared linear normal/roughness maps while preserving authored tint', () => {
    const pack = surfaces();
    for (const role of ['skin', 'raw', 'armour', 'bone'] as const) {
      const material = new THREE.MeshStandardMaterial({ color: 0x879385, metalness: .4 });
      material.name = `enemy.${role}`;
      const originalTint = material.color.clone();
      expect(bindCreatureSurface(material, pack)).toBe(true);
      expect(material.map).toBe(pack[role].albedo);
      expect(material.normalMap).toBe(pack[role].normal);
      expect(material.roughnessMap).toBe(pack[role].roughness);
      expect(material.map?.colorSpace).toBe(THREE.SRGBColorSpace);
      expect(material.normalMap?.colorSpace).toBe(THREE.NoColorSpace);
      expect(material.roughnessMap?.colorSpace).toBe(THREE.NoColorSpace);
      expect(material.normalMap?.flipY).toBe(false);
      expect(material.roughnessMap?.wrapS).toBe(THREE.RepeatWrapping);
      expect(material.color.equals(originalTint)).toBe(true);
      expect(material.metalness).toBe(0);
      expect(material.normalScale.x).toBeGreaterThan(0);
      expect(material.normalScale.x).toBeLessThan(.6);
    }
  });

  it('leaves eye, cavity and non-creature materials untouched', () => {
    const pack = surfaces();
    for (const name of ['enemy.dark', 'eye.husk', 'weapon.metal', 'enemy.skinny']) {
      const material = new THREE.MeshStandardMaterial({ color: 0x111516, roughness: .7 });
      material.name = name;
      const before = material.toJSON();
      expect(bindCreatureSurface(material, pack)).toBe(false);
      expect(material.toJSON()).toEqual(before);
    }
  });
});
