import { describe, it, expect } from 'vitest';
import {
  compileBlueprint, validateBlueprint, expandDoorCells, BlueprintError,
} from '../../src/sim/blueprint';
import { Sim, emptyInput } from '../../src/sim/sim';
import { CELL } from '../../src/sim/types';
import { ENEMIES } from '../../src/sim/enemyTypes';
import { DIFFICULTIES } from '../../src/sim/difficulty';
import {
  tinyGunSealBlueprint, tinyKeySealBlueprint, crowdedBlueprint,
} from '../helpers/authoredMaps';
import type { SimInput } from '../../src/sim/sim';

function input(partial: Partial<SimInput> = {}): SimInput {
  return { ...emptyInput(), ...partial };
}

function bfs(map: ReturnType<typeof compileBlueprint>, solid: Set<number>): Uint8Array {
  const seen = new Uint8Array(map.w * map.h);
  const start = map.rooms.find(r => r.kind === 'start')!;
  const q = [(start.z + (start.h >> 1)) * map.w + (start.x + (start.w >> 1))];
  seen[q[0]] = 1;
  for (let i = 0; i < q.length; i++) {
    const c = q[i];
    const x = c % map.w, z = (c / map.w) | 0;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x + dx, nz = z + dz;
      if (nx < 0 || nz < 0 || nx >= map.w || nz >= map.h) continue;
      const nk = nz * map.w + nx;
      if (seen[nk] || map.grid[nk] === 0 || solid.has(nk)) continue;
      seen[nk] = 1;
      q.push(nk);
    }
  }
  return seen;
}

describe('compileBlueprint', () => {
  it('carves a tiny handmade map: connected, spawn-safe, gun-seal', () => {
    const bp = tinyGunSealBlueprint();
    expect(validateBlueprint(bp)).toEqual([]);
    const map = compileBlueprint(bp);
    expect(map.w).toBe(88);
    expect(map.h).toBe(88);
    expect(map.sealBreak).toEqual({ type: 'gun', gun: 2 });
    expect(map.rooms.filter(r => r.kind === 'start').length).toBe(1);
    expect(map.rooms.filter(r => r.kind === 'arena').length).toBe(1);
    expect(map.rooms.filter(r => r.kind === 'antechamber').length).toBe(1);

    const open = bfs(map, new Set());
    for (const r of map.rooms) {
      const c = (r.z + (r.h >> 1)) * map.w + (r.x + (r.w >> 1));
      expect(open[c], `room ${r.id} unreachable`).toBe(1);
    }

    const doorCells = expandDoorCells(10, 23, 'x');
    expect(doorCells).toEqual([[10, 22], [10, 23], [10, 24]]);
    expect(map.doors[0].cells).toEqual(doorCells);

    const start = map.rooms.find(r => r.kind === 'start')!;
    for (const e of map.enemies) {
      expect(Math.hypot(e.x - start.cx, e.z - start.cz)).toBeGreaterThanOrEqual(16);
    }

    const gun = map.pickups.find(p => p.kind === 'gun' && p.gun === 2)!;
    const ante = map.rooms.find(r => r.kind === 'antechamber')!;
    expect(gun.roomId).toBe(ante.id);
    const gx = Math.floor(gun.x / CELL), gz = Math.floor(gun.z / CELL);
    expect(gx).toBe(35);
    expect(gz).toBe(23);
  });

  it('accepts a key-seal map and rejects a missing key', () => {
    const ok = tinyKeySealBlueprint();
    expect(validateBlueprint(ok)).toEqual([]);
    const map = compileBlueprint(ok);
    expect(map.sealBreak).toEqual({ type: 'key' });
    expect(map.pickups.some(p => p.kind === 'key')).toBe(true);

    const bad = { ...ok, pickups: ok.pickups.filter(p => p.kind !== 'key') };
    const errs = validateBlueprint(bad);
    expect(errs.some(e => /key/i.test(e))).toBe(true);
    expect(() => compileBlueprint(bad)).toThrow(BlueprintError);
  });

  it('rejects a seal-break gun placed in the arena', () => {
    const bp = tinyGunSealBlueprint();
    bp.pickups = [{ kind: 'gun', gun: 2, x: 52, z: 22, roomId: 3 }];
    const errs = validateBlueprint(bp);
    expect(errs.some(e => /arena/i.test(e))).toBe(true);
  });
});

describe('Sim.fromMap', () => {
  it('scripted input is deterministic across two sims', () => {
    const map = compileBlueprint(tinyGunSealBlueprint());
    const run = () => {
      const sim = Sim.fromMap(map, 'normal');
      for (let i = 0; i < 240; i++) {
        sim.step(input({
          moveZ: i % 40 < 30 ? 1 : 0,
          moveX: i % 80 < 40 ? 1 : -1,
          yaw: sim.player.yaw + 0.01,
          fire: i % 20 === 0,
        }));
        if (sim.phase !== 'playing') break;
      }
      return sim.snapshot();
    };
    expect(run()).toBe(run());
  });

  it('easy vs hard: same entity positions, different enemy HP', () => {
    const map = compileBlueprint(crowdedBlueprint());
    const easy = Sim.fromMap(map, 'easy');
    const hard = Sim.fromMap(map, 'hard');
    expect(easy.enemies.length).toBe(hard.enemies.length);
    expect(easy.enemies.length).toBeGreaterThan(60);
    for (let i = 0; i < easy.enemies.length; i++) {
      expect(easy.enemies[i].x).toBe(hard.enemies[i].x);
      expect(easy.enemies[i].z).toBe(hard.enemies[i].z);
      expect(easy.enemies[i].type).toBe(hard.enemies[i].type);
    }
    expect(easy.pickups.map(p => [p.x, p.z, p.kind])).toEqual(hard.pickups.map(p => [p.x, p.z, p.kind]));
    const huskE = easy.enemies.find(e => e.type === 'husk')!;
    const huskH = hard.enemies.find(e => e.type === 'husk')!;
    expect(huskE.maxHp).toBe(Math.round(ENEMIES.husk.hp * DIFFICULTIES.easy.enemyHp));
    expect(huskH.maxHp).toBe(Math.round(ENEMIES.husk.hp * DIFFICULTIES.hard.enemyHp));
    expect(huskE.maxHp).not.toBe(huskH.maxHp);
  });

  it('does not call generateMap: authored seed is the title slug', () => {
    const map = compileBlueprint(tinyGunSealBlueprint());
    expect(map.seed).toBe('tin-hall');
    expect(map.version).not.toBeGreaterThan(1);
    const sim = Sim.fromMap(map, 'normal');
    expect(sim.map.grid).toBe(map.grid);
    expect(sim.enemies.length).toBe(map.enemies.length);
  });

  it('gun-seal pickup breaks the seal; key-seal pickup does the same', () => {
    const gunSim = Sim.fromMap(compileBlueprint(tinyGunSealBlueprint()), 'normal');
    const g = gunSim.pickups.find(p => p.kind === 'gun' && p.gun === 2)!;
    gunSim.player.x = g.x; gunSim.player.z = g.z;
    gunSim.checkPickups();
    expect(gunSim.sealIntact).toBe(false);

    const keySim = Sim.fromMap(compileBlueprint(tinyKeySealBlueprint()), 'normal');
    const key = keySim.pickups.find(p => p.kind === 'key')!;
    keySim.player.x = key.x; keySim.player.z = key.z;
    keySim.checkPickups();
    expect(keySim.sealIntact).toBe(false);
    expect(keySim.hasKey).toBe(true);
  });
});
