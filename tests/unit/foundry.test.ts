import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CAMPAIGN } from '../../src/campaign';
import { foundryCell } from '../../src/render/foundry';

describe('authored Foundry environment', () => {
  it('replaces only the saved campaign footprint, leaving editor/maze maps alone', () => {
    const layout = JSON.parse(readFileSync(new URL('../../art/modern/foundry-room/layout.json', import.meta.url), 'utf8'));
    const map = CAMPAIGN[0].map;
    expect(layout.grid).toEqual(Array.from(map.grid));
    expect(layout.doors).toEqual(map.doors);
    expect(layout.playerStart).toEqual(map.playerStart);
    const cells: number[][] = [];
    for (let z = 0; z < map.h; z++) for (let x = 0; x < map.w; x++) if (foundryCell(map, x, z)) cells.push([x, z]);
    expect(cells).toEqual(layout.cells);
    expect(foundryCell({ ...map, seed: 'editor:foundry-copy' }, 9, 43)).toBe(false);
    expect(foundryCell(CAMPAIGN[1].map, 9, 43)).toBe(false);
  });

  it('exports a complete walkable floor, atlas UVs and no new low obstacles in the play area', async () => {
    const bytes = readFileSync(new URL('../../public/modern/foundry/environment.glb', import.meta.url));
    const model = (await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')).scene;
    model.updateMatrixWorld(true);
    const map = CAMPAIGN[0].map;
    let floorArea = 0;
    let atlasMeshes = 0;
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    const ab = new THREE.Vector3(), ac = new THREE.Vector3();
    model.traverse(node => {
      if (!(node instanceof THREE.Mesh)) return;
      const pos = node.geometry.getAttribute('position');
      const uv = node.geometry.getAttribute('uv1');
      expect(uv).toBeDefined();
      expect(uv.count).toBe(pos.count);
      for (let i = 0; i < uv.count; i++) {
        expect(uv.getX(i)).toBeGreaterThanOrEqual(0);
        expect(uv.getX(i)).toBeLessThanOrEqual(1);
        expect(uv.getY(i)).toBeGreaterThanOrEqual(0);
        expect(uv.getY(i)).toBeLessThanOrEqual(1);
      }
      atlasMeshes++;
      const material = node.material as THREE.Material;
      if (material.name === 'foundry.floor') {
        const indices = node.geometry.index!;
        for (let i = 0; i < indices.count; i += 3) {
          a.fromBufferAttribute(pos, indices.getX(i)).applyMatrix4(node.matrixWorld);
          b.fromBufferAttribute(pos, indices.getX(i + 1)).applyMatrix4(node.matrixWorld);
          c.fromBufferAttribute(pos, indices.getX(i + 2)).applyMatrix4(node.matrixWorld);
          floorArea += ab.subVectors(b, a).cross(ac.subVectors(c, a)).length() / 2;
        }
      } else {
        for (let i = 0; i < pos.count; i++) {
          a.fromBufferAttribute(pos, i).applyMatrix4(node.matrixWorld);
          if (a.y <= .02 || a.y >= 4.2) continue;
          const cx = Math.floor(a.x / 2), cz = Math.floor(a.z / 2);
          if (map.grid[cz * map.w + cx] !== 1) continue;
          // Thin trim may enter the existing player's wall-clearance margin;
          // no geometry may become convincing cover in the traversable room.
          let distanceToWall = Infinity;
          for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
            if (map.grid[(cz + dz) * map.w + cx + dx] === 1) continue;
            const x0 = (cx + dx) * 2, z0 = (cz + dz) * 2;
            const px = Math.max(x0 - a.x, 0, a.x - x0 - 2);
            const pz = Math.max(z0 - a.z, 0, a.z - z0 - 2);
            distanceToWall = Math.min(distanceToWall, Math.hypot(px, pz));
          }
          expect(distanceToWall, `new low obstacle at ${a.toArray().join(',')}`).toBeLessThanOrEqual(.2);
        }
      }
    });
    expect(atlasMeshes).toBe(8);
    expect(floorArea).toBeCloseTo(370 * 4, 3);
    expect(new THREE.Box3().setFromObject(model).max.y).toBeGreaterThan(16);
  });
});
