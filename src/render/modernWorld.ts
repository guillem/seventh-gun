// Instance saved Blender architecture modules against existing collision walls.
// Instancing keeps repeated fixtures inexpensive; no simulation data changes.
import * as THREE from 'three';
import { CELL } from '../sim/types';
import { applyRadialFog } from './radialFog';

export type ArchitecturePlacement = { x: number; y: number; z: number; yaw: number; color?: THREE.Color };
type Placement = ArchitecturePlacement;
export const MODERN_ARCHITECTURE_CHUNK_SIZE = CELL * 8;

export function instanceArchitecturePart(
  parent: THREE.Group, source: THREE.Group, name: string, placements: Placement[],
  configure?: (material: THREE.Material) => void,
): void {
  const part = source.getObjectByName(name);
  if (!part || placements.length === 0) return;
  source.updateMatrixWorld(true);
  // Module roots carry authored sizing/orientation. Preserve those transforms;
  // stripping part.matrixWorld would turn the horizontal pipe into a vertical
  // rack and shorten the rib from four metres to its unscaled source height.
  const origin = new THREE.Matrix4().copy(source.matrixWorld).invert();
  const transform = new THREE.Object3D();
  // One map-wide instance buffer submits every fixture whenever its enormous
  // bounding sphere intersects the camera. Local batches let Three cull rooms
  // outside the view while keeping geometry/material storage shared.
  const chunks = new Map<string, Placement[]>();
  for (const placement of placements) {
    const key = `${Math.floor(placement.x / MODERN_ARCHITECTURE_CHUNK_SIZE)},${Math.floor(placement.z / MODERN_ARCHITECTURE_CHUNK_SIZE)}`;
    const chunk = chunks.get(key);
    if (chunk) chunk.push(placement);
    else chunks.set(key, [placement]);
  }
  part.traverse(node => {
    if (!(node instanceof THREE.Mesh)) return;
    const geometry = node.geometry.clone();
    geometry.applyMatrix4(new THREE.Matrix4().multiplyMatrices(origin, node.matrixWorld));
    const originals = Array.isArray(node.material) ? node.material : [node.material];
    const materials = originals.map(material => {
      const clone = material.clone();
      configure?.(clone);
      applyRadialFog(clone);
      return clone;
    });
    for (const [key, chunk] of chunks) {
      const instanced = new THREE.InstancedMesh(geometry, Array.isArray(node.material) ? materials : materials[0], chunk.length);
      instanced.name = `modern-${name}`;
      instanced.userData.architectureChunk = key;
      chunk.forEach((placement, i) => {
        transform.position.set(placement.x, placement.y, placement.z);
        transform.rotation.set(0, placement.yaw, 0);
        transform.updateMatrix();
        instanced.setMatrixAt(i, transform.matrix);
        if (placement.color) instanced.setColorAt(i, placement.color);
      });
      instanced.instanceMatrix.needsUpdate = true;
      instanced.computeBoundingBox();
      instanced.computeBoundingSphere();
      instanced.frustumCulled = true;
      instanced.castShadow = false;
      instanced.receiveShadow = true;
      parent.add(instanced);
    }
  });
}
