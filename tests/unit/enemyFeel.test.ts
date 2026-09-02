// Player-feel: body blocking, gunshot/death hearing, campaign-only Fiend.
import { describe, it, expect } from 'vitest';
import { Sim, emptyInput } from '../../src/sim/sim';
import type { SimInput, EnemyEnt } from '../../src/sim/sim';
import { ENEMIES, noiseHearRadius } from '../../src/sim/enemyTypes';
import { generateMap } from '../../src/sim/mapgen';
import { GEN_VERSION, NOISE_TTL, PLAYER_RADIUS, type EnemyType } from '../../src/sim/types';
import { WEAPONS } from '../../src/sim/weapons';
import { CAMPAIGN } from '../../src/campaign/index';
import { compileBlueprint, validateBlueprint } from '../../src/sim/blueprint';
import { tinyGunSealBlueprint } from '../helpers/authoredMaps';

function input(partial: Partial<SimInput> = {}): SimInput {
  return { ...emptyInput(), ...partial };
}

function dummyRng() {
  return {
    float: () => 0.5, range: (a: number, b: number) => (a + b) / 2,
    int: () => 0, rangeInt: (a: number) => a, chance: () => false,
    pick: <T>(arr: T[]) => arr[0], state: () => [0, 0, 0, 0] as [number, number, number, number],
    setState: () => {},
  };
}

function placeFrozen(
  sim: Sim, type: EnemyType, x: number, z: number,
  extras?: Partial<EnemyEnt['def']>,
): EnemyEnt {
  const def = {
    ...ENEMIES[type],
    sightRange: 0,
    wakeRadius: 0,
    speed: 0,
    ...extras,
  };
  const e: EnemyEnt = {
    id: 9000 + sim.enemies.length,
    type, def,
    x, z, yaw: 0,
    hp: def.hp, maxHp: def.hp,
    speed: 0, accuracy: 0,
    state: 'idle', timer: 0, attackCd: 99, burstLeft: 0, burstTimer: 0,
    path: null, pathIndex: 0, pathTimer: 0, noLosTime: 0,
    awakened: false, dead: false, deathTime: 0, animPhase: 0,
    rng: dummyRng(),
  };
  sim.enemies.push(e);
  return e;
}

function inArena(sim: Sim): void {
  const arena = sim.map.rooms.find(r => r.kind === 'arena')!;
  sim.sealIntact = false;
  sim.player.x = arena.cx;
  sim.player.z = arena.cz;
  for (const e of sim.enemies) {
    e.dead = true;
    e.hp = 0;
  }
}

describe('player / enemy body collision', () => {
  it('walking into a husk keeps the player outside radius + playerRadius', () => {
    const sim = new Sim('body-col', 'normal');
    inArena(sim);
    const husk = placeFrozen(sim, 'husk', sim.player.x, sim.player.z - 3);
    sim.player.yaw = 0; // forward is -z, toward the husk
    for (let i = 0; i < 180; i++) sim.step(input({ moveZ: 1 }));
    const d = Math.hypot(sim.player.x - husk.x, sim.player.z - husk.z);
    expect(d).toBeGreaterThanOrEqual(ENEMIES.husk.radius + PLAYER_RADIUS - 0.02);
    expect(d).toBeLessThan(3);
  });

  it('spawning inside a husk pushes the player out on the next step', () => {
    const sim = new Sim('body-overlap', 'normal');
    inArena(sim);
    const husk = placeFrozen(sim, 'husk', sim.player.x, sim.player.z);
    sim.step(input({}));
    const d = Math.hypot(sim.player.x - husk.x, sim.player.z - husk.z);
    expect(d).toBeGreaterThanOrEqual(ENEMIES.husk.radius + PLAYER_RADIUS - 0.02);
  });

  it('death ragdolls are non-solid', () => {
    const sim = new Sim('body-ragdoll', 'normal');
    inArena(sim);
    const husk = placeFrozen(sim, 'husk', sim.player.x, sim.player.z - 1.2);
    husk.dead = true;
    husk.hp = 0;
    const startZ = sim.player.z;
    sim.player.yaw = 0;
    for (let i = 0; i < 90; i++) sim.step(input({ moveZ: 1 }));
    expect(sim.player.z, 'must walk through the ragdoll').toBeLessThan(husk.z);
    expect(sim.player.z).toBeLessThan(startZ - 2);
  });
});

describe('sound wake', () => {
  it('shooting near one husk wakes a neighbor within hear range (hitscan)', () => {
    const sim = new Sim('noise-shot', 'normal');
    inArena(sim);
    const a = placeFrozen(sim, 'husk', sim.player.x + 6, sim.player.z);
    const b = placeFrozen(sim, 'husk', sim.player.x + 18, sim.player.z);
    sim.player.yaw = Math.PI; // shoot +z, away from them
    sim.step(input({ fire: true }));
    const hear = noiseHearRadius(WEAPONS[0].loudness, ENEMIES.husk.hearRange);
    expect(Math.hypot(a.x - sim.player.x, a.z - sim.player.z)).toBeLessThan(hear);
    expect(Math.hypot(b.x - sim.player.x, b.z - sim.player.z)).toBeLessThan(hear);
    expect(a.awakened).toBe(true);
    expect(b.awakened).toBe(true);
  });

  it('projectile gunshots also wake, and the noise is not a 0.2s blink', () => {
    const sim = new Sim('noise-proj', 'normal');
    inArena(sim);
    const far = placeFrozen(sim, 'husk', sim.player.x + 80, sim.player.z);
    sim.giveGun(4);
    sim.step(input({ fire: true }));
    expect(far.awakened).toBe(false);
    for (let i = 0; i < 30; i++) sim.step(input({})); // 0.5s — old window was 0.2s
    expect(sim.time - (sim.lastNoise?.time ?? 0)).toBeGreaterThan(0.2);
    expect(sim.time - (sim.lastNoise?.time ?? 0)).toBeLessThan(NOISE_TTL);
    far.x = sim.player.x + 12;
    far.z = sim.player.z;
    sim.step(input({}));
    expect(far.awakened).toBe(true);
  });

  it('killing an enemy wakes a neighbor at the corpse', () => {
    const sim = new Sim('noise-kill', 'normal');
    inArena(sim);
    const a = placeFrozen(sim, 'husk', sim.player.x + 10, sim.player.z);
    const b = placeFrozen(sim, 'husk', sim.player.x + 18, sim.player.z);
    a.hp = 1;
    sim.damageEnemy(a, 10, 0);
    expect(a.dead).toBe(true);
    expect(b.awakened).toBe(false);
    sim.step(input({}));
    expect(b.awakened).toBe(true);
  });

  it('a shot does not wake the far side of an 88×88 map', () => {
    const sim = new Sim('noise-far', 'normal');
    inArena(sim);
    const far = placeFrozen(sim, 'husk', sim.player.x + 80, sim.player.z);
    sim.step(input({ fire: true }));
    expect(far.awakened).toBe(false);
    const hear = noiseHearRadius(WEAPONS[0].loudness, ENEMIES.husk.hearRange);
    expect(hear).toBeLessThan(60);
  });
});

describe('fiend is campaign-only', () => {
  it('generateMap never places a fiend (GEN_VERSION unchanged)', () => {
    expect(GEN_VERSION).toBe(4);
    for (let i = 0; i < 40; i++) {
      const map = generateMap(`nofiend-${i}`, 'normal');
      expect(map.enemies.some(e => e.type === 'fiend'), `seed nofiend-${i}`).toBe(false);
    }
  });

  it('stamps 1–2 fiends on Pit / Ward / Sanctum only — not Foundry', () => {
    const publicCount = (i: number) => {
      const map = CAMPAIGN[i].map;
      const secretIds = new Set(map.rooms.filter(r => r.kind === 'secret').map(r => r.id));
      return map.enemies.filter(e => e.type === 'fiend' && !secretIds.has(e.roomId)).length;
    };
    expect(publicCount(0), 'foundry').toBe(0);
    expect(publicCount(1), 'gullet').toBe(0);
    expect(publicCount(2), 'catacombs').toBe(0);
    expect(publicCount(3), 'pit').toBeGreaterThanOrEqual(1);
    expect(publicCount(3), 'pit').toBeLessThanOrEqual(2);
    expect(publicCount(4), 'spire').toBe(0);
    expect(publicCount(5), 'ward').toBeGreaterThanOrEqual(1);
    expect(publicCount(5), 'ward').toBeLessThanOrEqual(2);
    expect(publicCount(6), 'sanctum').toBeGreaterThanOrEqual(1);
    expect(publicCount(6), 'sanctum').toBeLessThanOrEqual(2);
    const wardSecretFiends = CAMPAIGN[5].map.enemies.filter(e => {
      const room = CAMPAIGN[5].map.rooms.find(r => r.id === e.roomId);
      return e.type === 'fiend' && room?.kind === 'secret';
    }).length;
    expect(wardSecretFiends, 'ward secret fiend').toBe(1);
    expect(ENEMIES.fiend.hp).toBeGreaterThan(ENEMIES.hierophant.hp);
    expect(ENEMIES.fiend.speed).toBeLessThan(ENEMIES.crawler.speed);
  });

  it('validator allowlist accepts fiend and rejects unknown types', () => {
    const bp = tinyGunSealBlueprint();
    bp.enemies = [{ type: 'fiend', x: 52, z: 22, yaw: 0, roomId: 3 }];
    expect(validateBlueprint(bp).filter(e => /unknown enemy/.test(e))).toEqual([]);
    compileBlueprint(bp);
    const bad = tinyGunSealBlueprint();
    bad.enemies = [{ type: 'dragon' as EnemyType, x: 52, z: 22, yaw: 0, roomId: 3 }];
    expect(validateBlueprint(bad).some(e => /unknown enemy/.test(e))).toBe(true);
  });
});
