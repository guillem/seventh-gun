import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CAMPAIGN } from '../../src/campaign';
import { CAMPAIGN_ART_IDS } from '../../src/render/campaignTextures';
import {
  addCampaignEnvironment, campaignEnvironmentPlacements, MODERN_CAMPAIGN_CEILING,
  type EnvironmentAssets,
} from '../../src/render/campaignEnvironment';
import { MODERN_ARCHITECTURE_CHUNK_SIZE } from '../../src/render/modernWorld';
import { disposeOwnedObject } from '../../src/render/dispose';
import { foundryCell } from '../../src/render/foundry';

let kit: THREE.Group;
let assets: EnvironmentAssets;
beforeAll(async () => {
  const bytes = readFileSync(new URL('../../public/modern/roster/environment/kit.glb', import.meta.url));
  kit = (await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')).scene;
  kit.updateMatrixWorld(true);
  const texture = new THREE.Texture();
  assets = { environmentKit: kit, surfaces: {}, concrete: texture, steel: texture, titanium: texture,
    entranceFloor: texture, concreteNormal: texture, steelNormal: texture, concreteRoughness: texture, steelRoughness: texture };
});

describe('saved campaign architecture', () => {
  it('contains distinct authored modules for all seven identities and stays outside the combat volume', () => {
    const vertex = new THREE.Vector3();
    for (const id of CAMPAIGN_ART_IDS) for (const role of ['relief', 'fixture', 'crown', 'trim']) {
      const module = kit.getObjectByName(`${id}_${role}`);
      expect(module, `${id}_${role}`).toBeDefined();
      let vertices = 0;
      module!.traverse(node => {
        if (!(node instanceof THREE.Mesh)) return;
        const positions = node.geometry.getAttribute('position');
        expect(node.geometry.getAttribute('uv')).toBeDefined();
        for (let i = 0; i < positions.count; i++) {
          vertex.fromBufferAttribute(positions, i).applyMatrix4(node.matrixWorld);
          vertices++;
          expect(Math.abs(vertex.x), `${id}_${role} exceeds its wall cell`).toBeLessThanOrEqual(1.001);
          expect(vertex.y).toBeLessThanOrEqual(MODERN_CAMPAIGN_CEILING);
          if (role === 'crown') expect(vertex.y).toBeGreaterThan(4.3);
          if (vertex.y < 4.3) {
            expect(vertex.z, `${id}_${role} protrudes into the play area`).toBeLessThanOrEqual(.18001);
            // A mount may be embedded a little into its solid backing wall.
            expect(vertex.z).toBeGreaterThanOrEqual(-.2);
          }
        }
      });
      expect(vertices).toBeGreaterThan(50);
    }
  });

  it.each(CAMPAIGN_ART_IDS)('covers %s with bounded cullable batches, preserving the map and the Foundry slice', id => {
    const map = CAMPAIGN.find(c => c.id.endsWith(id))!.map;
    const before = JSON.stringify(map);
    const placements = campaignEnvironmentPlacements(map, id);
    for (const role of ['relief', 'fixture', 'crown', 'trim']) expect(placements[role].length).toBeGreaterThan(0);
    const group = new THREE.Group();
    addCampaignEnvironment(group, map, id, assets);
    group.updateMatrixWorld(true);
    const batches: THREE.InstancedMesh[] = [];
    group.traverse(node => { if (node instanceof THREE.InstancedMesh) batches.push(node); });
    expect(batches.length).toBeGreaterThan(8);
    for (const batch of batches) {
      expect(batch.frustumCulled).toBe(true);
      const size = batch.boundingBox!.getSize(new THREE.Vector3());
      expect(size.x).toBeLessThan(MODERN_ARCHITECTURE_CHUNK_SIZE + 3);
      expect(size.z).toBeLessThan(MODERN_ARCHITECTURE_CHUNK_SIZE + 3);
    }
    // All mounts lie on a real solid/walkable boundary. Inward-facing relief
    // therefore cannot be placed across a doorway or become false cover.
    for (const placement of Object.values(placements).flat()) {
      const nx = Math.sin(placement.yaw), nz = Math.cos(placement.yaw);
      const cx = Math.floor((placement.x + nx * .01) / 2);
      const cz = Math.floor((placement.z + nz * .01) / 2);
      expect(map.grid[cz * map.w + cx]).toBe(1);
      expect(foundryCell(map, cx, cz)).toBe(false);
      const outsideX = Math.floor((placement.x - nx * .01) / 2);
      const outsideZ = Math.floor((placement.z - nz * .01) / 2);
      if (outsideX >= 0 && outsideZ >= 0 && outsideX < map.w && outsideZ < map.h) {
        expect(map.grid[outsideZ * map.w + outsideX]).toBe(0);
      }
    }
    expect(JSON.stringify(map)).toBe(before);
    disposeOwnedObject(group);
  });
});
