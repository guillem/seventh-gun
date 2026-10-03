import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CAMPAIGN } from '../../src/campaign';
import { generateMap } from '../../src/sim/mapgen';
import { CELL, type GameMap } from '../../src/sim/types';
import { campaignEnvironmentPlacements } from '../../src/render/campaignEnvironment';
import { foundryCell } from '../../src/render/foundry';
import { MODERN_PRACTICAL_LIGHT_LIMIT, selectModernPracticalLights } from '../../src/render/modernLighting';
import type { CampaignArtId } from '../../src/render/campaignTextures';

const cases = CAMPAIGN.map(entry => ({ map: entry.map, artId: entry.id.slice(3) as CampaignArtId }));
const mazeCases = Array.from({ length: 7 }, (_, i) => ({ map: generateMap(`stationary-light-${i}`, 'normal'), artId: 'foundry' as const }));
let kit: THREE.Group;

beforeAll(async () => {
  const bytes = readFileSync(new URL('../../public/modern/roster/environment/kit.glb', import.meta.url));
  kit = (await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')).scene;
  kit.updateMatrixWorld(true);
});

describe('stationary modern fixture lighting', () => {
  it.each([...cases, ...mazeCases])('selects a bounded repeatable set for $map.seed without changing its map', ({ map, artId }) => {
    const before = JSON.stringify(map);
    const selected = selectModernPracticalLights(map, artId);
    expect(selected.length).toBeGreaterThan(0);
    expect(selected.length).toBeLessThanOrEqual(MODERN_PRACTICAL_LIGHT_LIMIT);
    expect(selectModernPracticalLights(map, artId)).toEqual(selected);
    expect(JSON.stringify(map)).toBe(before);
    expect(new Set(selected.map(light => `${light.x},${light.y},${light.z}`)).size).toBe(selected.length);
    for (const light of selected) {
      expect(map.lights[light.sourceIndex].roomId).toBe(light.roomId);
      expect(map.rooms.find(room => room.id === light.roomId)?.outdoor).toBe(false);
      expect(light.intensity).toBeGreaterThan(0);
      expect(light.distance).toBeLessThanOrEqual(24);
      expect(map.grid[Math.floor(light.z / CELL) * map.w + Math.floor(light.x / CELL)]).toBe(1);
    }
  });

  it('lights every Foundry side room, including secrets, before adding a second arena fixture', () => {
    const map = CAMPAIGN[0].map;
    const selected = selectModernPracticalLights(map, 'foundry');
    const rooms = map.rooms.filter(room => map.lights.some(source => source.roomId === room.id &&
      !foundryCell(map, Math.floor(source.x / CELL), Math.floor(source.z / CELL))));
    expect(new Set(selected.map(light => light.roomId))).toEqual(new Set(rooms.map(room => room.id)));
    expect(selected).toHaveLength(10);
    expect(selected.filter(light => light.roomId === map.arenaRoomId)).toHaveLength(2);
    expect(selected.every(light => !foundryCell(map, Math.floor(light.x / CELL), Math.floor(light.z / CELL)))).toBe(true);
  });

  it.each(cases)('covers ordinary indoor rooms before spending extra slots in $map.seed', ({ map, artId }) => {
    const required = map.rooms.filter(room => !room.outdoor && room.kind !== 'secret' &&
      map.lights.some(source => source.roomId === room.id && !foundryCell(map, Math.floor(source.x / CELL), Math.floor(source.z / CELL))));
    expect(required.length).toBeLessThanOrEqual(MODERN_PRACTICAL_LIGHT_LIMIT);
    const selected = selectModernPracticalLights(map, artId);
    for (const room of required) expect(selected.some(light => light.roomId === room.id), `room ${room.id}`).toBe(true);
    for (const room of map.rooms) expect(selected.filter(light => light.roomId === room.id).length).toBeLessThanOrEqual(2);
  });

  it.each(cases)('matches the saved fixture lenses and their walkable side in $map.seed', ({ map, artId }) => {
    const fixtures = campaignEnvironmentPlacements(map, artId).fixture;
    const module = kit.getObjectByName(`${artId}_fixture`)!;
    const lens = new THREE.Box3();
    module.traverse(node => {
      if (!(node instanceof THREE.Mesh)) return;
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      if (materials.some(material => material.name.startsWith('env.lamp.'))) lens.union(new THREE.Box3().setFromObject(node, true));
    });
    expect(lens.isEmpty()).toBe(false);
    for (const light of selectModernPracticalLights(map, artId)) {
      expect(fixtures.some(fixture => Math.abs(light.x - fixture.x - Math.sin(fixture.yaw) * .24) < .0001 &&
        Math.abs(light.z - fixture.z - Math.cos(fixture.yaw) * .24) < .0001), `room ${light.roomId}`).toBe(true);
      expect(light.y).toBeGreaterThanOrEqual(lens.min.y - .01);
      expect(light.y).toBeLessThanOrEqual(lens.max.y + .01);
    }
  });

  it('is independent of start/viewer location and cosmetic list ordering', () => {
    const map = CAMPAIGN[0].map;
    const expected = selectModernPracticalLights(map);
    for (const room of map.rooms) {
      const relocated = { ...map, playerStart: { x: room.cx, z: room.cz, yaw: 1 } };
      expect(selectModernPracticalLights(relocated)).toEqual(expected);
    }
    const reordered = { ...map, rooms: [...map.rooms].reverse(), lights: [...map.lights].reverse() };
    const physical = (lights: typeof expected) => lights.map(({ sourceIndex: _index, ...light }) => light);
    expect(physical(selectModernPracticalLights(reordered))).toEqual(physical(expected));
  });

  it('respects reduced budgets and never expands the fixed maximum', () => {
    const map = CAMPAIGN[1].map;
    expect(selectModernPracticalLights(map, 'gullet', 0)).toEqual([]);
    expect(selectModernPracticalLights(map, 'gullet', -5)).toEqual([]);
    expect(selectModernPracticalLights(map, 'gullet', 5)).toHaveLength(5);
    expect(selectModernPracticalLights(map, 'gullet', 100)).toHaveLength(12);
    const noSources: GameMap = { ...map, lights: [] };
    expect(selectModernPracticalLights(noSources, 'gullet')).toEqual([]);
  });
});
