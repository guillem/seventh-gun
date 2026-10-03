// Place saved Blender architecture against existing collision walls.
// Instancing keeps repeated fixtures inexpensive; no simulation data changes.
import * as THREE from 'three';
import { CELL } from '../sim/types';
import type { GameMap } from '../sim/types';
import { applyRadialFog } from './radialFog';

type Placement = { x: number; y: number; z: number; yaw: number };
export const MODERN_ARCHITECTURE_CHUNK_SIZE = CELL * 8;

function instancePart(parent: THREE.Group, source: THREE.Group, name: string, placements: Placement[]): void {
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
    const materials = originals.map(material => { const clone = material.clone(); applyRadialFog(clone); return clone; });
    for (const [key, chunk] of chunks) {
      const instanced = new THREE.InstancedMesh(geometry, Array.isArray(node.material) ? materials : materials[0], chunk.length);
      instanced.name = `modern-${name}`;
      instanced.userData.architectureChunk = key;
      chunk.forEach((placement, i) => {
        transform.position.set(placement.x, placement.y, placement.z);
        transform.rotation.set(0, placement.yaw, 0);
        transform.updateMatrix();
        instanced.setMatrixAt(i, transform.matrix);
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

export function addModernArchitecture(parent: THREE.Group, map: GameMap, source: THREE.Group): void {
  const ribs: Placement[] = [];
  const pipes: Placement[] = [];
  const fixtures: Placement[] = [];
  const walkable = (x: number, z: number) => x >= 0 && z >= 0 && x < map.w && z < map.h && map.grid[z * map.w + x] === 1;
  for (let z = 0; z < map.h; z++) for (let x = 0; x < map.w; x++) {
    if (!walkable(x, z)) continue;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (walkable(x + dx, z + dz)) continue;
      // Parts face +Z into the room; their backs lie on the collision wall.
      const yaw = Math.atan2(-dx, -dz);
      const px = (x + 0.5) * CELL + dx * (CELL * 0.5 - 0.02);
      const pz = (z + 0.5) * CELL + dz * (CELL * 0.5 - 0.02);
      if ((x + z) % 3 === 0) ribs.push({ x: px, y: 0, z: pz, yaw });
      if ((x + z) % 4 === 1) fixtures.push({ x: px, y: 3.15, z: pz, yaw });
      if ((x + z) % 2 === 0) pipes.push({ x: px, y: 3.65, z: pz, yaw });
    }
  }
  instancePart(parent, source, 'wall_rib', ribs);
  instancePart(parent, source, 'wall_fixture', fixtures);
  instancePart(parent, source, 'pipe_run', pipes);
}
