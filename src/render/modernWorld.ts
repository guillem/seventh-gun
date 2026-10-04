// Instance saved Blender architecture modules against existing collision walls.
// Instancing keeps repeated fixtures inexpensive; no simulation data changes.
import * as THREE from 'three';
import { CELL } from '../sim/types';
import { applyRadialFog } from './radialFog';

export type ArchitecturePlacement = { x: number; y: number; z: number; yaw: number; color?: THREE.Color; scaleY?: number };
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
        transform.scale.set(1, placement.scaleY ?? 1, 1);
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

/** Kit modules whose placements share one material in a single multi-draw.
 * A mixed-identity maze would otherwise submit one instanced draw per module
 * mesh per 16 m chunk. Geometry is stored once per module mesh; BatchedMesh
 * culls each placement against the frustum. `materialKey` names the shared
 * material, and `configure` binds it the first time that key is seen. */
export function batchArchitecture(
  parent: THREE.Group, source: THREE.Group, placements: Record<string, Placement[]>,
  materialKey: (module: string, material: THREE.Material) => string,
  configure: (module: string, material: THREE.Material) => void,
): void {
  source.updateMatrixWorld(true);
  const origin = new THREE.Matrix4().copy(source.matrixWorld).invert();
  type Entry = { geometry: THREE.BufferGeometry; placements: Placement[] };
  const groups = new Map<string, { material: THREE.Material; entries: Entry[] }>();
  for (const [name, list] of Object.entries(placements).sort(([a], [b]) => a.localeCompare(b))) {
    const part = source.getObjectByName(name);
    if (!part || !list.length) continue;
    part.traverse(node => {
      if (!(node instanceof THREE.Mesh) || Array.isArray(node.material)) return;
      const key = materialKey(name, node.material);
      let group = groups.get(key);
      if (!group) {
        const material = node.material.clone();
        configure(name, material);
        applyRadialFog(material);
        group = { material, entries: [] };
        groups.set(key, group);
      }
      // BatchedMesh needs one attribute layout; the kit's extra UV sets and
      // tangents are not used by these materials.
      const geometry = new THREE.BufferGeometry();
      for (const attribute of ['position', 'normal', 'uv']) {
        const value = node.geometry.getAttribute(attribute);
        if (value) geometry.setAttribute(attribute, value.clone());
      }
      geometry.setIndex(node.geometry.index ? node.geometry.index.clone()
        : [...Array(node.geometry.getAttribute('position').count).keys()]);
      geometry.applyMatrix4(new THREE.Matrix4().multiplyMatrices(origin, node.matrixWorld));
      group.entries.push({ geometry, placements: list });
    });
  }
  const transform = new THREE.Object3D();
  for (const [key, { material, entries }] of groups) {
    const instances = entries.reduce((sum, entry) => sum + entry.placements.length, 0);
    const vertices = entries.reduce((sum, entry) => sum + entry.geometry.getAttribute('position').count, 0);
    const indices = entries.reduce((sum, entry) => sum + entry.geometry.index!.count, 0);
    const batch = new THREE.BatchedMesh(instances, vertices, indices, material);
    batch.name = `modern-batch-${key}`;
    batch.perObjectFrustumCulled = true;
    batch.sortObjects = false;
    batch.castShadow = false;
    batch.receiveShadow = true;
    for (const { geometry, placements: list } of entries) {
      const id = batch.addGeometry(geometry);
      geometry.dispose();
      for (const placement of list) {
        const instance = batch.addInstance(id);
        transform.position.set(placement.x, placement.y, placement.z);
        transform.rotation.set(0, placement.yaw, 0);
        transform.scale.set(1, placement.scaleY ?? 1, 1);
        transform.updateMatrix();
        batch.setMatrixAt(instance, transform.matrix);
        if (placement.color) batch.setColorAt(instance, placement.color);
      }
    }
    parent.add(batch);
  }
}
