import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { addModernArchitecture, MODERN_ARCHITECTURE_CHUNK_SIZE } from '../../src/render/modernWorld';
import { disposeOwnedObject } from '../../src/render/dispose';
import { CELL, type GameMap } from '../../src/sim/types';

let source: THREE.Group;

beforeAll(async () => {
  const bytes = readFileSync(new URL('../../public/modern/models/architecture.glb', import.meta.url));
  source = (await new GLTFLoader().parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '',
  )).scene;
  source.updateMatrixWorld(true);
});

function floorMap(w: number, h: number, cells: [number, number][]): GameMap {
  const grid = new Uint8Array(w * h);
  for (const [x, z] of cells) grid[z * w + x] = 1;
  // Architecture deliberately consumes only the immutable floor grid.
  return { w, h, grid } as GameMap;
}

describe('saved architecture assembly', () => {
  it.each([
    { name: 'wall_rib', x: 3, z: 3, y: 0 },
    { name: 'pipe_run', x: 3, z: 3, y: 3.65 },
    { name: 'wall_fixture', x: 2, z: 3, y: 3.15 },
  ])('preserves exported $name sizing, orientation and offset at every wall facing', ({ name, x, z, y }) => {
    const group = new THREE.Group();
    addModernArchitecture(group, floorMap(8, 8, [[x, z]]), source);
    group.updateMatrixWorld(true);
    const actual = new THREE.Box3();
    group.traverse(node => {
      if (node.name === `modern-${name}`) actual.union(new THREE.Box3().setFromObject(node));
    });
    // The exported module already includes its authored transforms. Apply
    // only each wall placement to that reference volume; stripping the root
    // transform makes ribs too short and rotates horizontal pipes vertically.
    const authored = new THREE.Box3().setFromObject(source.getObjectByName(name)!);
    const expected = new THREE.Box3();
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const wall = new THREE.Object3D();
      wall.position.set((x + .5) * CELL + dx * (CELL / 2 - .02), y,
        (z + .5) * CELL + dz * (CELL / 2 - .02));
      wall.rotation.y = Math.atan2(-dx, -dz);
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
    const cells: [number, number][] = Array.from({ length: 94 }, (_, i) => [i + 1, 3]);
    addModernArchitecture(group, floorMap(96, 7, cells), source);
    group.updateMatrixWorld(true);
    const batches = group.children.filter((node): node is THREE.InstancedMesh => node instanceof THREE.InstancedMesh);
    expect(batches.length).toBeGreaterThan(16);
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
