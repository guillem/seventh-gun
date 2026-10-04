import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CAMPAIGN } from '../../src/campaign';
import {
  areaReady, AUTHORED_AREAS, authoredCell, authoredDoor, readyAreaPracticals,
} from '../../src/render/authoredAreas';
import { foundryCell } from '../../src/render/foundry';
import { BASE_CEILING, planRoomVolumes } from '../../src/render/roomVolumes';

const lazyAreas = AUTHORED_AREAS.filter(area => !area.boot);
const mapFor = (seed: string) => CAMPAIGN.find(c => c.map.seed === seed)!.map;

async function loadModel(id: string): Promise<THREE.Group> {
  const bytes = readFileSync(new URL(`../../public/modern/areas/${id}/environment.glb`, import.meta.url));
  const model = (await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')).scene;
  model.updateMatrixWorld(true);
  return model;
}

describe('authored area registry', () => {
  it('keeps the Foundry opening exactly where the original authored scene is', () => {
    const map = CAMPAIGN[0].map;
    for (let z = 0; z < map.h; z++) for (let x = 0; x < map.w; x++) {
      expect(authoredCell(map, x, z), `${x},${z}`).toBe(foundryCell(map, x, z));
    }
    expect(authoredDoor(map, 0)).toBe(true);
  });

  it('leaves lazily loaded areas to the room grammar until their assets arrive', () => {
    for (const area of lazyAreas) {
      const map = mapFor(area.mapSeed);
      expect(areaReady(area)).toBe(false);
      const [x0, z0] = area.rects[0];
      expect(authoredCell(map, x0, z0)).toBe(false);
      expect(readyAreaPracticals(map.seed)).toEqual([]);
      // Unloaded, the grammar raises the room as usual.
      const volumes = planRoomVolumes(map, undefined);
      expect(volumes.ceilingAt(x0, z0)).toBeGreaterThanOrEqual(BASE_CEILING);
    }
  });

  it.each(lazyAreas.map(area => [area.id, area] as const))('%s matches its exported layout and owns no runtime object', (_, area) => {
    const layout = JSON.parse(readFileSync(new URL(`../../art/modern/areas/${area.id}/layout.json`, import.meta.url), 'utf8'));
    expect(layout.seed).toBe(area.mapSeed);
    expect(layout.rects).toEqual(area.rects);
    expect(layout.conflicts).toEqual([]);
    const map = mapFor(area.mapSeed);
    // The exported grid is the current campaign grid.
    expect(layout.grid).toEqual(Array.from(map.grid));
    const manifest = JSON.parse(readFileSync(new URL(`../../art/modern/areas/${area.id}/manifest.json`, import.meta.url), 'utf8'));
    expect(manifest.rects).toEqual(area.rects);
    // Runtime actor lights sit at the baked fixtures.
    expect((area.practicals ?? []).map(p => [p.x, p.y, p.z].map(v => +v.toFixed(2))))
      .toEqual(manifest.practicals.map((p: { x: number; y: number; z: number }) => [p.x, p.y, p.z].map(v => +v.toFixed(2))));
    expect(existsSync(new URL(`../../public/modern/areas/${area.id}/irradiance.webp`, import.meta.url))).toBe(true);
  });

  it.each(lazyAreas.map(area => [area.id, area] as const))('%s has the exact floor, bake UVs and no new low obstacle', async (_, area) => {
    const map = mapFor(area.mapSeed);
    const model = await loadModel(area.id);
    const inside = (x: number, z: number) => area.rects.some(([x0, z0, x1, z1]) => x >= x0 && x < x1 && z >= z0 && z < z1);
    let cells = 0;
    for (let z = 0; z < map.h; z++) for (let x = 0; x < map.w; x++) if (inside(x, z) && map.grid[z * map.w + x] === 1) cells++;
    let floorArea = 0;
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    const ab = new THREE.Vector3(), ac = new THREE.Vector3();
    model.traverse(node => {
      if (!(node instanceof THREE.Mesh)) return;
      const pos = node.geometry.getAttribute('position');
      const uv = node.geometry.getAttribute('uv1');
      expect(uv, 'light-bake UV set').toBeDefined();
      for (let i = 0; i < uv.count; i++) {
        expect(uv.getX(i)).toBeGreaterThanOrEqual(0);
        expect(uv.getX(i)).toBeLessThanOrEqual(1);
        expect(uv.getY(i)).toBeGreaterThanOrEqual(0);
        expect(uv.getY(i)).toBeLessThanOrEqual(1);
      }
      const name = (node.material as THREE.Material).name;
      if (name === 'area.floor') {
        const indices = node.geometry.index!;
        for (let i = 0; i < indices.count; i += 3) {
          a.fromBufferAttribute(pos, indices.getX(i)).applyMatrix4(node.matrixWorld);
          b.fromBufferAttribute(pos, indices.getX(i + 1)).applyMatrix4(node.matrixWorld);
          c.fromBufferAttribute(pos, indices.getX(i + 2)).applyMatrix4(node.matrixWorld);
          floorArea += ab.subVectors(b, a).cross(ac.subVectors(c, a)).length() / 2;
          expect(Math.abs(a.y)).toBeLessThan(1e-4);
        }
        return;
      }
      for (let i = 0; i < pos.count; i++) {
        a.fromBufferAttribute(pos, i).applyMatrix4(node.matrixWorld);
        // Flat floor inlays (<= 2 cm) and anything above the combat volume.
        if (a.y <= .02 || a.y >= 4.3) continue;
        const cx = Math.floor(a.x / 2), cz = Math.floor(a.z / 2);
        if (map.grid[cz * map.w + cx] !== 1) continue;
        let distanceToWall = Infinity;
        for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
          if (map.grid[(cz + dz) * map.w + cx + dx] === 1) continue;
          const x0 = (cx + dx) * 2, z0 = (cz + dz) * 2;
          const px = Math.max(x0 - a.x, 0, a.x - x0 - 2);
          const pz = Math.max(z0 - a.z, 0, a.z - z0 - 2);
          distanceToWall = Math.min(distanceToWall, Math.hypot(px, pz));
        }
        expect(distanceToWall, `${area.id}: low obstacle at ${a.toArray().map(v => v.toFixed(2)).join(',')}`).toBeLessThanOrEqual(.18);
      }
    });
    expect(floorArea).toBeCloseTo(cells * 4, 3);
    expect(new THREE.Box3().setFromObject(model).max.y).toBeGreaterThan(8);
  });
});
