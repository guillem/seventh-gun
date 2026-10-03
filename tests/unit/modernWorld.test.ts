import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { instanceArchitecturePart, MODERN_ARCHITECTURE_CHUNK_SIZE, type ArchitecturePlacement } from '../../src/render/modernWorld';
import { disposeOwnedObject } from '../../src/render/dispose';
import { CELL } from '../../src/sim/types';

let source: THREE.Group;

beforeAll(async () => {
  const bytes = readFileSync(new URL('../../public/modern/roster/environment/kit.glb', import.meta.url));
  source = (await new GLTFLoader().parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '',
  )).scene;
  source.updateMatrixWorld(true);
});

const FACINGS = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;

// The same wall placement campaignEnvironmentPlacements produces for cell (x, z).
function wallPlacement(x: number, z: number, dx: number, dz: number): ArchitecturePlacement {
  return { x: (x + .5) * CELL + dx * CELL / 2, y: 0, z: (z + .5) * CELL + dz * CELL / 2, yaw: Math.atan2(-dx, -dz) };
}

describe('saved architecture assembly', () => {
  it.each(['foundry_relief', 'foundry_fixture', 'foundry_crown', 'foundry_trim'])(
    'preserves exported %s sizing, orientation and offset at every wall facing', name => {
      const group = new THREE.Group();
      const placements = FACINGS.map(([dx, dz]) => wallPlacement(3, 3, dx, dz));
      instanceArchitecturePart(group, source, name, placements);
      group.updateMatrixWorld(true);
      const actual = new THREE.Box3();
      group.traverse(node => {
        if (node.name === `modern-${name}`) actual.union(new THREE.Box3().setFromObject(node));
      });
      // The exported module already includes its authored transforms. Apply
      // only each wall placement to that reference volume; stripping the root
      // transform would resize and rotate the module.
      const authored = new THREE.Box3().setFromObject(source.getObjectByName(name)!);
      const expected = new THREE.Box3();
      for (const placement of placements) {
        const wall = new THREE.Object3D();
        wall.position.set(placement.x, placement.y, placement.z);
        wall.rotation.y = placement.yaw;
        wall.updateMatrix();
        expected.union(authored.clone().applyMatrix4(wall.matrix));
      }
      for (const axis of ['x', 'y', 'z'] as const) {
        expect(actual.min[axis]).toBeCloseTo(expected.min[axis], 4);
        expect(actual.max[axis]).toBeCloseTo(expected.max[axis], 4);
      }
      disposeOwnedObject(group);
    });

  it('keeps distant fixtures in cullable local batches with shared resources', () => {
    const group = new THREE.Group();
    const placements = Array.from({ length: 94 }, (_, i) => wallPlacement(i + 1, 3, 0, -1));
    instanceArchitecturePart(group, source, 'foundry_relief', placements);
    group.updateMatrixWorld(true);
    const batches = group.children.filter((node): node is THREE.InstancedMesh => node instanceof THREE.InstancedMesh);
    const chunks = new Set(placements.map(p => Math.floor(p.x / MODERN_ARCHITECTURE_CHUNK_SIZE)));
    expect(chunks.size).toBeGreaterThan(8);
    expect(new Set(batches.map(batch => batch.userData.architectureChunk)).size).toBe(chunks.size);
    for (const batch of batches) {
      const size = batch.boundingBox!.getSize(new THREE.Vector3());
      expect(size.x).toBeLessThan(MODERN_ARCHITECTURE_CHUNK_SIZE + 4);
      expect(size.z).toBeLessThan(MODERN_ARCHITECTURE_CHUNK_SIZE + 4);
    }
    const geometries = new Set(batches.map(batch => batch.geometry));
    expect(geometries.size).toBeLessThan(batches.length / 2);
    const camera = new THREE.PerspectiveCamera(75, 1, .1, 24);
    camera.position.set(4, 1.7, 7);
    camera.lookAt(14, 1.7, 7);
    camera.updateMatrixWorld();
    const frustum = new THREE.Frustum().setFromProjectionMatrix(
      new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse),
    );
    const visible = batches.filter(batch => frustum.intersectsObject(batch));
    expect(visible.length).toBeGreaterThan(0);
    expect(visible.length).toBeLessThan(batches.length / 2);
    disposeOwnedObject(group);
  });
});
