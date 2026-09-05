// GPU objects created for a transient rig belong to that rig.  Three removes
// objects from a scene but deliberately does not free their GL allocations,
// so lifecycle owners must use this helper when a rig is replaced or expires.
// Texture caches are shared between runs and are intentionally never inferred
// from a material here.  Callers mark per-rig CanvasTextures in userData.
import * as THREE from 'three';

type OwnedTextureNode = THREE.Object3D & { userData: { ownedTextures?: unknown } };

export function disposeOwnedObject(root: THREE.Object3D): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();

  root.traverse((node) => {
    const renderable = node as THREE.Object3D & {
      geometry?: THREE.BufferGeometry;
      material?: THREE.Material | THREE.Material[];
    };
    if (renderable.geometry) geometries.add(renderable.geometry);
    const material = renderable.material;
    if (Array.isArray(material)) material.forEach(m => materials.add(m));
    else if (material) materials.add(material);

    const owned = (node as OwnedTextureNode).userData.ownedTextures;
    if (Array.isArray(owned)) {
      for (const texture of owned) if (texture instanceof THREE.Texture) textures.add(texture);
    }
  });

  root.removeFromParent();
  geometries.forEach(geometry => geometry.dispose());
  materials.forEach(material => material.dispose());
  textures.forEach(texture => texture.dispose());
}
