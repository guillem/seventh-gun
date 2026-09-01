import type { MapBlueprint } from '../../src/sim/blueprint';
import type { EnemyType } from '../../src/sim/types';

export function tinyGunSealBlueprint(): MapBlueprint {
  return {
    codec: 1,
    title: 'TIN HALL',
    cosmeticSeed: 1001,
    sealBreak: { type: 'gun', gun: 2 },
    rooms: [
      { id: 0, x: 4, z: 20, w: 7, h: 7, theme: 'industrial', kind: 'start', outdoor: false },
      { id: 1, x: 16, z: 18, w: 9, h: 9, theme: 'organic', kind: 'spine', outdoor: false },
      { id: 2, x: 32, z: 20, w: 7, h: 7, theme: 'tech', kind: 'antechamber', outdoor: false },
      { id: 3, x: 46, z: 16, w: 13, h: 12, theme: 'tech', kind: 'arena', outdoor: false },
    ],
    corridors: [
      { x: 10, z: 22, w: 7, h: 3 },
      { x: 24, z: 22, w: 9, h: 3 },
      { x: 38, z: 22, w: 9, h: 3 },
    ],
    doors: [
      { cx: 10, cz: 23, axis: 'x', locked: false },
    ],
    pickups: [
      { kind: 'gun', gun: 2, x: 35, z: 23, roomId: 2 },
      { kind: 'medikit', x: 19, z: 22, roomId: 1 },
    ],
    enemies: [
      { type: 'husk', x: 20, z: 22, yaw: 0.5, roomId: 1 },
      { type: 'slab', x: 52, z: 22, yaw: 1.2, roomId: 3 },
    ],
  };
}

export function tinyKeySealBlueprint(): MapBlueprint {
  const bp = tinyGunSealBlueprint();
  return {
    ...bp,
    title: 'KEY WARD',
    cosmeticSeed: 1002,
    sealBreak: { type: 'key' },
    pickups: [
      { kind: 'key', x: 20, z: 24, roomId: 1 },
      { kind: 'medikit', x: 19, z: 22, roomId: 1 },
    ],
  };
}

export function crowdedBlueprint(): MapBlueprint {
  const bp = tinyGunSealBlueprint();
  const enemies = [...bp.enemies];
  const types: EnemyType[] = ['husk', 'crawler', 'slab', 'wisp', 'hierophant'];
  for (let i = 0; i < 62; i++) {
    const x = 47 + (i % 10);
    const z = 18 + ((i / 10) | 0);
    enemies.push({
      type: types[i % types.length],
      x, z, yaw: i * 0.17, roomId: 3,
    });
  }
  return { ...bp, title: 'CROWD', cosmeticSeed: 2002, enemies };
}

export function mazeSizedBlueprint(): MapBlueprint {
  const rooms: MapBlueprint['rooms'] = [];
  const corridors: MapBlueprint['corridors'] = [];

  for (let i = 0; i < 8; i++) {
    const x = 4 + i * 10;
    rooms.push({
      id: i, x, z: 8, w: 7, h: 7,
      theme: i < 3 ? 'industrial' : 'organic',
      kind: i === 0 ? 'start' : 'spine',
      outdoor: false,
    });
    if (i < 7) corridors.push({ x: x + 6, z: 10, w: 5, h: 3 });
  }
  corridors.push({ x: 76, z: 14, w: 3, h: 15 });

  for (let j = 0; j < 8; j++) {
    const x = 74 - j * 10;
    const id = 8 + j;
    rooms.push({
      id, x, z: 28, w: 7, h: 7,
      theme: id >= 14 ? 'tech' : 'stone',
      kind: id === 15 ? 'antechamber' : 'spine',
      outdoor: false,
    });
    if (j < 7) corridors.push({ x: x - 4, z: 30, w: 5, h: 3 });
  }

  rooms.push({
    id: 16, x: 4, z: 42, w: 13, h: 12,
    theme: 'tech', kind: 'arena', outdoor: false,
  });
  corridors.push({ x: 9, z: 34, w: 3, h: 9 });

  const enemies: MapBlueprint['enemies'] = [];
  for (let i = 0; i < 64; i++) {
    enemies.push({
      type: i % 5 === 0 ? 'slab' : 'husk',
      x: 5 + (i % 11),
      z: 43 + ((i / 11) | 0),
      yaw: i * 0.11,
      roomId: 16,
    });
  }

  return {
    codec: 1,
    title: 'LONG WALK',
    cosmeticSeed: 777,
    sealBreak: { type: 'gun', gun: 2 },
    rooms,
    corridors,
    doors: [{ cx: 10, cz: 11, axis: 'x', locked: false }],
    pickups: [
      { kind: 'gun', gun: 2, x: 7, z: 31, roomId: 15 },
      { kind: 'ammo', ammoType: 'shells', amount: 8, x: 18, z: 11, roomId: 1 },
      { kind: 'medikit', x: 28, z: 11, roomId: 2 },
    ],
    enemies,
  };
}
