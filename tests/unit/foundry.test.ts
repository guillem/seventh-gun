import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CAMPAIGN } from '../../src/campaign';
import { addFoundryDoorHardware, foundryCell } from '../../src/render/foundry';

describe('authored Foundry environment', () => {
  it('separates the pier cladding and lower vessel flange from their former coplanar backing faces', async () => {
    const bytes = readFileSync(new URL('../../public/modern/foundry/environment.glb', import.meta.url));
    const model = (await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')).scene;
    model.updateMatrixWorld(true);
    const pier = new Map<string, number[]>();
    const cap = new Map<string, number[]>();
    const vertex = new THREE.Vector3();
    model.traverse(node => {
      if (!(node instanceof THREE.Mesh)) return;
      const name = (node.material as THREE.Material).name;
      if (!['foundry.concrete', 'foundry.steel', 'foundry.edge'].includes(name)) return;
      const positions = node.geometry.getAttribute('position');
      for (let i = 0; i < positions.count; i++) {
        vertex.fromBufferAttribute(positions, i).applyMatrix4(node.matrixWorld);
        if (vertex.x > 38 && vertex.x < 40 && vertex.y > .005 && vertex.y < 1.61 && vertex.z > 77.9 && vertex.z < 78.5) {
          if (!pier.has(name)) pier.set(name, []);
          pier.get(name)!.push(vertex.z);
        }
        if (vertex.x > 62.5 && vertex.x < 67.5 && vertex.z > 84.5 && vertex.z < 89.5 && vertex.y > 8 && vertex.y < 8.4) {
          if (!cap.has(name)) cap.set(name, []);
          cap.get(name)!.push(vertex.y);
        }
      }
    });
    expect(pier.get('foundry.concrete')!.length).toBeGreaterThan(0);
    expect(pier.get('foundry.steel')!.length).toBeGreaterThan(0);
    expect(Math.max(...pier.get('foundry.steel')!) - Math.max(...pier.get('foundry.concrete')!)).toBeGreaterThan(.025);
    expect(cap.get('foundry.steel')!.length).toBeGreaterThan(0);
    expect(cap.get('foundry.edge')!.length).toBeGreaterThan(0);
    expect(Math.min(...cap.get('foundry.steel')!) - Math.min(...cap.get('foundry.edge')!)).toBeGreaterThan(.025);
  });

  it('keeps the saved door guards within the original span and attached throughout lift travel', async () => {
    const bytes = readFileSync(new URL('../../public/modern/foundry/door-hardware.glb', import.meta.url));
    const source = (await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')).scene;
    const slab = new THREE.Mesh(new THREE.BoxGeometry(.5, 4.32, 6));
    addFoundryDoorHardware(slab, source);
    const hardware = slab.getObjectByName('foundry-door-hardware')!;
    slab.position.set(35, 2.16, 87);
    slab.updateMatrixWorld(true);
    const closed = new THREE.Box3().setFromObject(hardware);
    expect(closed.min.y).toBeGreaterThanOrEqual(0);
    expect(closed.max.y).toBeLessThanOrEqual(4.32);
    expect(closed.min.z).toBeGreaterThanOrEqual(84);
    expect(closed.max.z).toBeLessThanOrEqual(90);
    expect(closed.min.x).toBeGreaterThan(34.69);
    expect(closed.max.x).toBeLessThan(35.31);
    slab.position.y += 4.57;
    slab.updateMatrixWorld(true);
    const open = new THREE.Box3().setFromObject(hardware);
    expect(open.min.y - closed.min.y).toBeCloseTo(4.57, 5);
    expect(open.min.y).toBeGreaterThan(4.32);
  });

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
      if (['foundry.floor', 'foundry.arrivalFloor'].includes(material.name)) {
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
    expect(atlasMeshes).toBe(11);
    expect(floorArea).toBeCloseTo(370 * 4, 3);
    expect(new THREE.Box3().setFromObject(model).max.y).toBeGreaterThan(16);
  });
});
