import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CAMPAIGN } from '../../src/campaign';
import { generateMap } from '../../src/sim/mapgen';
import type { GameMap } from '../../src/sim/types';
import { CAMPAIGN_ART_IDS, type CampaignArtId } from '../../src/render/campaignTextures';
import {
  addCampaignEnvironment, secretControlFaces, verticalEnvironmentPlacements, type EnvironmentAssets,
} from '../../src/render/campaignEnvironment';
import { selectModernPracticalLights } from '../../src/render/modernLighting';
import { disposeOwnedObject } from '../../src/render/dispose';
import { foundryCell } from '../../src/render/foundry';
import {
  BASE_CEILING, HANG_DEPTH, planRoomVolumes, VERTICAL_CAMPAIGN_ART,
} from '../../src/render/roomVolumes';

const SEEDS = ['1984', '1986', 'doom', 'abc'];
// Grid hashes as computed by the game's mapHash() debug call. Players keep
// favourite seeds; presentation work must never move a wall.
const SEED_GRID_HASH: Record<string, string> = { 1984: '62624244', 1986: '8f50b164' };

function gridHash(map: GameMap): string {
  let h = 5381;
  const s = [...map.grid].join('');
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(16);
}

const mazes = () => SEEDS.map(seed => generateMap(seed, 'normal'));
const gullet = () => CAMPAIGN.find(c => c.id.endsWith('gullet'))!.map;

let kit: THREE.Group;
beforeAll(async () => {
  const bytes = readFileSync(new URL('../../public/modern/roster/environment/kit.glb', import.meta.url));
  kit = (await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')).scene;
  kit.updateMatrixWorld(true);
});

function moduleBounds(name: string): THREE.Box3 {
  const module = kit.getObjectByName(name);
  expect(module, name).toBeDefined();
  const origin = new THREE.Matrix4().copy(kit.matrixWorld).invert();
  const box = new THREE.Box3();
  module!.traverse(node => {
    if (!(node instanceof THREE.Mesh)) return;
    const geometry = node.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(origin, node.matrixWorld));
    geometry.computeBoundingBox();
    box.union(geometry.boundingBox!);
  });
  return box;
}

describe('room vertical grammar', () => {
  it('keeps seeded layouts byte-identical', () => {
    for (const [seed, hash] of Object.entries(SEED_GRID_HASH)) {
      expect(gridHash(generateMap(seed, 'normal')), seed).toBe(hash);
    }
    for (const map of [...mazes(), gullet()]) {
      const before = JSON.stringify(map);
      const volumes = planRoomVolumes(map, map.seed.startsWith('campaign:') ? 'gullet' : undefined, true);
      verticalEnvironmentPlacements(map, volumes);
      selectModernPracticalLights(map, volumes.primaryArt, undefined, volumes);
      expect(JSON.stringify(map)).toBe(before);
    }
  });

  it('is deterministic and draws maze identities from each room theme', () => {
    const themeArt: Record<string, CampaignArtId[]> = {
      industrial: ['foundry', 'pit'], organic: ['gullet'], stone: ['catacombs', 'spire'], tech: ['sanctum', 'ward'],
    };
    for (const map of mazes()) {
      const a = planRoomVolumes(map, undefined, true);
      const b = planRoomVolumes(map, undefined, true);
      expect(a.rooms.map(r => [r.art, r.ceiling])).toEqual(b.rooms.map(r => [r.art, r.ceiling]));
      for (const { room, art } of a.rooms) expect(themeArt[room.theme]).toContain(art);
      expect(a.rooms.some(r => r.ceiling > BASE_CEILING)).toBe(true);
    }
  });

  it('raises only ordinary indoor rooms; corridors, doors and secrets keep 6 m', () => {
    for (const map of [...mazes(), gullet()]) {
      const volumes = planRoomVolumes(map, map.seed.startsWith('campaign:') ? 'gullet' : undefined, true);
      for (const { room, ceiling } of volumes.rooms) {
        if (room.outdoor || room.kind === 'secret') expect(ceiling).toBe(BASE_CEILING);
        expect(ceiling).toBeGreaterThanOrEqual(BASE_CEILING);
      }
      for (let z = 0; z < map.h; z++) for (let x = 0; x < map.w; x++) {
        if (!volumes.roomAt(x, z)) expect(volumes.ceilingAt(x, z)).toBe(BASE_CEILING);
      }
      for (const door of map.doors) for (const [x, z] of door.cells) expect(volumes.ceilingAt(x, z)).toBe(BASE_CEILING);
      for (const secret of map.secrets ?? []) for (const [x, z] of secret.cells) expect(volumes.ceilingAt(x, z)).toBe(BASE_CEILING);
    }
  });

  it('raises every campaign map but leaves the authored Foundry opening alone', () => {
    for (const campaign of CAMPAIGN) {
      const artId = CAMPAIGN_ART_IDS.find(id => campaign.id.endsWith(id))!;
      expect(VERTICAL_CAMPAIGN_ART.has(artId)).toBe(true);
      const volumes = planRoomVolumes(campaign.map, artId);
      expect(volumes.vertical).toBe(true);
      expect(volumes.rooms.every(r => r.art === artId)).toBe(true);
      expect(volumes.rooms.filter(r => r.ceiling > BASE_CEILING).length, campaign.id).toBeGreaterThanOrEqual(4);
      for (const { room, ceiling } of volumes.rooms) {
        let authored = false;
        for (let z = room.z; z < room.z + room.h; z++) for (let x = room.x; x < room.x + room.w; x++) {
          authored ||= foundryCell(campaign.map, x, z);
        }
        if (authored) expect(ceiling, `${campaign.id} room ${room.id}`).toBe(BASE_CEILING);
      }
    }
    // Arena and shared maps are not mazes: no grammar without the flag.
    expect(planRoomVolumes(mazes()[0]).vertical).toBe(false);
  });

  it('keeps every campaign layout and secret intact while dressing it', () => {
    for (const campaign of CAMPAIGN) {
      const artId = CAMPAIGN_ART_IDS.find(id => campaign.id.endsWith(id))!;
      const before = JSON.stringify(campaign.map);
      const volumes = planRoomVolumes(campaign.map, artId);
      verticalEnvironmentPlacements(campaign.map, volumes);
      const lights = selectModernPracticalLights(campaign.map, artId, undefined, volumes);
      expect(lights.length).toBeGreaterThan(0);
      expect(lights.length).toBeLessThanOrEqual(12);
      expect(JSON.stringify(campaign.map)).toBe(before);
    }
  });

  it('authors the tall-room modules for every identity inside their envelopes', () => {
    for (const id of CAMPAIGN_ART_IDS) {
      const course = moduleBounds(`${id}_course`);
      expect(course.min.y).toBeGreaterThanOrEqual(-.35);
      expect(course.max.y).toBeLessThanOrEqual(.5);
      const upper = moduleBounds(`${id}_upper`);
      expect(upper.min.y).toBeGreaterThanOrEqual(-.15);
      expect(upper.max.y).toBeLessThanOrEqual(4.15);
      expect(upper.min.z).toBeGreaterThanOrEqual(-.05);
      const span = moduleBounds(`${id}_span`);
      expect(span.max.y).toBeLessThanOrEqual(.05);
      expect(span.min.y).toBeGreaterThanOrEqual(-1.5);
      const hang = moduleBounds(`${id}_hang`);
      expect(hang.max.y).toBeLessThanOrEqual(.05);
      expect(hang.min.y).toBeGreaterThanOrEqual(-HANG_DEPTH);
    }
  });

  it('frames doors without narrowing the doorway or blocking the slab', () => {
    const vertex = new THREE.Vector3();
    const origin = new THREE.Matrix4().copy(kit.matrixWorld).invert();
    for (const id of CAMPAIGN_ART_IDS) {
      for (const role of ['doorhead', 'doorleaf', 'relief2', 'upper2']) {
        const module = kit.getObjectByName(`${id}_${role}`);
        expect(module, `${id}_${role}`).toBeDefined();
        module!.traverse(node => {
          if (!(node instanceof THREE.Mesh)) return;
          const m = new THREE.Matrix4().multiplyMatrices(origin, node.matrixWorld);
          const positions = node.geometry.getAttribute('position');
          for (let i = 0; i < positions.count; i++) {
            vertex.fromBufferAttribute(positions, i).applyMatrix4(m);
            if (role === 'doorhead') {
              // Below the housing only the jambs exist, within wall clearance.
              if (vertex.y < 4.19) expect(Math.abs(vertex.x), `${id} jamb`).toBeGreaterThanOrEqual(2.8);
              expect(vertex.y).toBeLessThanOrEqual(6.001);
            } else if (role === 'doorleaf') {
              expect(Math.abs(vertex.z), `${id} leaf depth`).toBeLessThanOrEqual(.36);
              expect(Math.abs(vertex.z), `${id} leaf inside slab`).toBeGreaterThan(.2);
              expect(Math.abs(vertex.y)).toBeLessThanOrEqual(2.16);
            } else if (role === 'relief2' && vertex.y < 4.3) {
              expect(vertex.z, `${id} relief2`).toBeLessThanOrEqual(.18001);
            } else if (role === 'upper2') {
              expect(vertex.y).toBeLessThanOrEqual(4.15);
            }
          }
        });
      }
    }
  });

  it('keeps every overhead piece above the combat volume', () => {
    const campaigns = CAMPAIGN.map(c => [c.map, CAMPAIGN_ART_IDS.find(id => c.id.endsWith(id))!] as const);
    for (const [map, artId] of [...mazes().map(m => [m, undefined] as const), ...campaigns]) {
      const volumes = planRoomVolumes(map, artId, true);
      const placements = verticalEnvironmentPlacements(map, volumes);
      for (const [module, list] of Object.entries(placements)) {
        const role = module.split('_')[1];
        if (!['course', 'upper', 'span', 'hang', 'crown'].includes(role)) continue;
        const bounds = moduleBounds(module);
        for (const p of list) {
          const bottom = p.y + bounds.min.y * (p.scaleY ?? 1);
          expect(bottom, `${module} at ${p.x},${p.z}`).toBeGreaterThan(4.29);
          if (role === 'upper') expect(p.scaleY).toBeGreaterThan(0);
        }
      }
    }
  });

  it('never hides a remote secret control behind relief or a luminaire', () => {
    let controls = 0;
    for (const campaign of CAMPAIGN) {
      const artId = CAMPAIGN_ART_IDS.find(id => campaign.id.endsWith(id))!;
      const map = campaign.map;
      const faces = secretControlFaces(map);
      controls += faces.size;
      const placements = verticalEnvironmentPlacements(map, planRoomVolumes(map, artId, true));
      for (const key of faces) {
        const [x, z, dx, dz] = key.split(',').map(Number);
        const px = (x + .5) * 2 + dx, pz = (z + .5) * 2 + dz;
        for (const [module, list] of Object.entries(placements)) {
          if (!/_(relief|fixture)$/.test(module)) continue;
          expect(list.some(p => Math.hypot(p.x - px, p.z - pz) < .1), `${campaign.id} ${module}`).toBe(false);
        }
      }
    }
    expect(controls).toBeGreaterThan(3);
  });

  it('lights tall rooms from their hanging lamps within the fixed budget', () => {
    const map = gullet();
    const volumes = planRoomVolumes(map, 'gullet');
    const lights = selectModernPracticalLights(map, 'gullet', undefined, volumes);
    expect(lights.length).toBeGreaterThan(0);
    expect(lights.length).toBeLessThanOrEqual(12);
    expect(lights.some(l => l.y > BASE_CEILING - 1)).toBe(true);
    for (const light of lights) {
      const room = volumes.roomAt(Math.floor(light.x / 2), Math.floor(light.z / 2));
      expect(light.y).toBeLessThan((room?.ceiling ?? BASE_CEILING) - 1);
    }
  });

  it('draws a mixed-identity maze in one culled batch per identity and material', () => {
    const texture = new THREE.Texture();
    const assets: EnvironmentAssets = { environmentKit: kit, surfaces: {}, concrete: texture, steel: texture, titanium: texture,
      entranceFloor: texture, concreteNormal: texture, steelNormal: texture, concreteRoughness: texture, steelRoughness: texture };
    const map = mazes()[0];
    const volumes = planRoomVolumes(map, undefined, true);
    const placements = verticalEnvironmentPlacements(map, volumes);
    const group = new THREE.Group();
    addCampaignEnvironment(group, map, volumes.primaryArt, assets, volumes);
    const batches: THREE.BatchedMesh[] = [];
    group.traverse(node => { if (node instanceof THREE.BatchedMesh) batches.push(node); });
    expect(group.children[0].children.every(node => node instanceof THREE.BatchedMesh)).toBe(true);
    const keys = batches.map(b => b.name.replace('modern-batch-', ''));
    expect(new Set(keys).size).toBe(keys.length);
    expect(new Set(keys.map(k => k.split('|')[0])).size).toBeGreaterThan(2);
    expect(batches.length).toBeLessThan(60);
    for (const batch of batches) expect(batch.perObjectFrustumCulled).toBe(true);
    // Every placement of every module mesh became exactly one batch instance.
    let expected = 0;
    for (const [module, list] of Object.entries(placements)) {
      kit.getObjectByName(module)!.traverse(node => { if (node instanceof THREE.Mesh) expected += list.length; });
    }
    expect(batches.reduce((sum, b) => sum + b.instanceCount, 0)).toBe(expected);
    disposeOwnedObject(group);
  });
});
