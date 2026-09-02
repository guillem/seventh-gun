// THREE.Fog is a depth slab: vFogDepth = -mvPosition.z. Looking down a hall
// fogs the vanishing point while wall/ceiling corners (smaller camera-Z)
// stay bright, and a sideways glance un-fogs distant enemies. Replace with
// radial distance so near/far + fog color stay the same in every direction.
import type * as THREE from 'three';

const DEPTH = 'vFogDepth = - mvPosition.z;';
const RADIAL = 'vFogDepth = length( mvPosition.xyz );';

export function applyRadialFog(mat: THREE.Material): void {
  if (mat.userData.radialFog) return;
  const foggy = (mat as THREE.MeshBasicMaterial).fog;
  if (foggy === false) return;
  mat.userData.radialFog = true;
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, renderer) => {
    prev.call(mat, shader, renderer);
    shader.vertexShader = shader.vertexShader.replaceAll(DEPTH, RADIAL);
  };
  const prevKey = mat.customProgramCacheKey.bind(mat);
  mat.customProgramCacheKey = () => prevKey() + '|radialFog';
}

export function applyRadialFogDeep(root: THREE.Object3D): void {
  root.traverse(obj => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) {
      if (m) applyRadialFog(m);
    }
  });
}
