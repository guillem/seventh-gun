import * as THREE from 'three';

export type CreatureSurfaceRole = 'skin' | 'raw' | 'armour' | 'bone';
export interface CreatureSurface {
  albedo: THREE.Texture;
  normal: THREE.Texture;
  roughness: THREE.Texture;
}
export type CreatureSurfaces = Record<CreatureSurfaceRole, CreatureSurface>;

const NORMAL_STRENGTH: Record<CreatureSurfaceRole, number> = {
  skin: .42, raw: .48, armour: .38, bone: .28,
};

/** Generated color and separately sculpted surface relief stay shared across
 * creature clones. Data maps are linear; treating normals as sRGB distorts
 * lighting as the camera turns. Cavity/eye materials retain their own response. */
export function bindCreatureSurface(material: THREE.MeshStandardMaterial, surfaces: CreatureSurfaces): boolean {
  const role = material.name.match(/^enemy\.(skin|raw|armour|bone)(?:\.|$)/)?.[1] as CreatureSurfaceRole | undefined;
  if (!role) return false;
  const surface = surfaces[role];
  surface.albedo.colorSpace = THREE.SRGBColorSpace;
  for (const map of [surface.normal, surface.roughness]) map.colorSpace = THREE.NoColorSpace;
  for (const map of [surface.albedo, surface.normal, surface.roughness]) {
    map.flipY = false;
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
  }
  material.map = surface.albedo;
  material.normalMap = surface.normal;
  material.normalScale.setScalar(NORMAL_STRENGTH[role]);
  material.roughnessMap = surface.roughness;
  material.roughness = 1;
  material.metalness = 0;
  material.envMapIntensity = .24;
  material.needsUpdate = true;
  return true;
}
