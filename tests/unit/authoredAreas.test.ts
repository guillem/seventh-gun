import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { CAMPAIGN } from '../../src/campaign';
import {
  areaReady, AUTHORED_AREAS, authoredCell, authoredDoor, readyAreaPracticals, setAreaLoadedForTest,
} from '../../src/render/authoredAreas';
import { CAMPAIGN_ART_IDS } from '../../src/render/campaignTextures';
import { selectModernPracticalLights } from '../../src/render/modernLighting';
import { foundryCell } from '../../src/render/foundry';
import { BASE_CEILING, planRoomVolumes } from '../../src/render/roomVolumes';

const lazyAreas = AUTHORED_AREAS.filter(area => !area.boot);
const mapFor = (seed: string) => CAMPAIGN.find(c => c.map.seed === seed)!.map;

async function loadModel(id: string): Promise<THREE.Group> {
  const bytes = readFileSync(new URL(`../../public/modern/areas/${id}/environment.glb`, import.meta.url));
  const model = (await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')).scene;
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

  it('keeps every ordinary room\'s practical light when a map\'s areas load', () => {
    for (const campaign of CAMPAIGN) {
      const map = campaign.map;
      const artId = CAMPAIGN_ART_IDS.find(id => campaign.id.endsWith(id))!;
      const litRooms = (ready: boolean) => {
        for (const area of lazyAreas) setAreaLoadedForTest(area.id, ready && area.mapSeed === map.seed);
        const lights = selectModernPracticalLights(map, artId, undefined, planRoomVolumes(map, artId));
        expect(lights.length).toBeLessThanOrEqual(12);
        return new Set(lights.map(light => light.roomId));
      };
      const before = litRooms(false), after = litRooms(true);
      for (const area of lazyAreas) setAreaLoadedForTest(area.id, false);
      const areaRoom = (x: number, z: number) => lazyAreas.some(area => area.mapSeed === map.seed &&
        area.rects.some(([x0, z0, x1, z1]) => x >= x0 && x < x1 && z >= z0 && z < z1));
      for (const room of map.rooms) {
        if (room.kind === 'secret' || room.outdoor || areaRoom(room.x, room.z)) continue;
        if (before.has(room.id)) expect(after.has(room.id), `${campaign.id} room ${room.id}`).toBe(true);
      }
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

  it.each(lazyAreas.map(area => [area.id, area] as const))('%s has no coplanar floor inlays (z-fighting)', { timeout: 30_000 }, async (_, area) => {
    const model = await loadModel(area.id);
    // Upward faces near the floor, bucketed by height (1 mm): two of them
    // overlapping at one height flicker as the camera moves.
    const buckets = new Map<number, { name: string; tri: [number, number][] }[]>();
    const v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), n = new THREE.Vector3();
    model.traverse(node => {
      if (!(node instanceof THREE.Mesh)) return;
      const pos = node.geometry.getAttribute('position'), index = node.geometry.index!;
      for (let i = 0; i < index.count; i += 3) {
        for (let k = 0; k < 3; k++) v[k].fromBufferAttribute(pos, index.getX(i + k)).applyMatrix4(node.matrixWorld);
        n.crossVectors(e1.subVectors(v[1], v[0]), e2.subVectors(v[2], v[0]));
        if (n.length() < 1e-6 || n.normalize().y < .999 || v[0].y > .05) continue;
        if (Math.abs(v[1].y - v[0].y) > .0008 || Math.abs(v[2].y - v[0].y) > .0008) continue;
        const key = Math.round(v[0].y * 1000);
        const list = buckets.get(key) ?? [];
        buckets.set(key, list);
        list.push({ name: (node.material as THREE.Material).name, tri: v.map(p => [p.x, p.z] as [number, number]) });
      }
    });
    const inside = (p: [number, number], t: [number, number][]) => {
      const s = (a: [number, number], b: [number, number], c: [number, number]) => (a[0] - c[0]) * (b[1] - c[1]) - (b[0] - c[0]) * (a[1] - c[1]);
      const d = [s(p, t[0], t[1]), s(p, t[1], t[2]), s(p, t[2], t[0])];
      return !(d.some(x => x < -1e-6) && d.some(x => x > 1e-6));
    };
    const clashes: string[] = [];
    for (const [height, list] of buckets) {
      for (const a of list) {
        const centre: [number, number] = [(a.tri[0][0] + a.tri[1][0] + a.tri[2][0]) / 3, (a.tri[0][1] + a.tri[1][1] + a.tri[2][1]) / 3];
        const other = list.find(b => b.name !== a.name && inside(centre, b.tri));
        if (other) clashes.push(`${height} mm: ${a.name} / ${other.name}`);
      }
    }
    expect([...new Set(clashes)]).toEqual([]);
  });

  it.each(lazyAreas.map(area => [area.id, area] as const))('%s has the exact floor, bake UVs and no new low obstacle', { timeout: 30_000 }, async (_, area) => {
    const map = mapFor(area.mapSeed);
    const model = await loadModel(area.id);
    const inside = (x: number, z: number) => area.rects.some(([x0, z0, x1, z1]) => x >= x0 && x < x1 && z >= z0 && z < z1);
    let cells = 0;
    for (let z = 0; z < map.h; z++) for (let x = 0; x < map.w; x++) if (inside(x, z) && map.grid[z * map.w + x] === 1) cells++;
    let floorArea = 0;
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    const ab = new THREE.Vector3(), ac = new THREE.Vector3();
    let badUv: string | undefined, offFloor: number | undefined, obstacle: string | undefined;
    model.traverse(node => {
      if (!(node instanceof THREE.Mesh)) return;
      const pos = node.geometry.getAttribute('position');
      const uv = node.geometry.getAttribute('uv1');
      expect(uv, 'light-bake UV set').toBeDefined();
      // Collect, then assert once: per-vertex expect() calls made the dense
      // ossuary take seconds and time out on CI.
      for (let i = 0; i < uv.count; i++) {
        const [u, w] = [uv.getX(i), uv.getY(i)];
        if (u < 0 || u > 1 || w < 0 || w > 1) badUv ??= `${(node.material as THREE.Material).name} uv ${u},${w}`;
      }
      const name = (node.material as THREE.Material).name;
      if (name === 'area.floor') {
        const indices = node.geometry.index!;
        for (let i = 0; i < indices.count; i += 3) {
          a.fromBufferAttribute(pos, indices.getX(i)).applyMatrix4(node.matrixWorld);
          b.fromBufferAttribute(pos, indices.getX(i + 1)).applyMatrix4(node.matrixWorld);
          c.fromBufferAttribute(pos, indices.getX(i + 2)).applyMatrix4(node.matrixWorld);
          floorArea += ab.subVectors(b, a).cross(ac.subVectors(c, a)).length() / 2;
          if (Math.abs(a.y) >= 1e-4) offFloor ??= a.y;
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
        if (distanceToWall > .18) obstacle ??= `${area.id}: low obstacle at ${a.toArray().map(v => v.toFixed(2)).join(',')} (${distanceToWall.toFixed(3)} m from a wall)`;
      }
    });
    // Meshopt quantises positions (a few mm over the whole mesh's extent).
    expect(badUv).toBeUndefined();
    expect(offFloor).toBeUndefined();
    expect(obstacle).toBeUndefined();
    expect(Math.abs(floorArea - cells * 4)).toBeLessThan(Math.max(.05, cells * 4 * 2e-4));
    // Taller than a 6 m corridor (catches empty or flat exports).
    expect(new THREE.Box3().setFromObject(model).max.y).toBeGreaterThan(6.5);
  });
});
