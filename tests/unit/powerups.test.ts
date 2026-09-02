import { describe, it, expect } from 'vitest';
import { Sim, emptyInput } from '../../src/sim/sim';
import { WEAPONS } from '../../src/sim/weapons';
import { ENEMIES } from '../../src/sim/enemyTypes';
import {
  applyPowerup, createPowerupState, outgoingMul, stepPowerups, wardActive,
  POWERUP_DEFS,
} from '../../src/sim/powerups';
import type { SimInput } from '../../src/sim/sim';
import { compileBlueprint } from '../../src/sim/blueprint';
import { tinyGunSealBlueprint } from '../helpers/authoredMaps';

function input(partial: Partial<SimInput> = {}): SimInput {
  return { ...emptyInput(), ...partial };
}

function dummyAt(sim: Sim, x: number, z: number, hp = 1000) {
  sim.enemies.push({
    id: 9000 + sim.enemies.length,
    type: 'husk',
    def: { ...ENEMIES.husk, sightRange: 0, hearRange: 0, wakeRadius: 0, speed: 0 },
    x, z, yaw: 0,
    hp, maxHp: hp,
    speed: 0, accuracy: 0,
    state: 'idle', timer: 0, attackCd: 99, burstLeft: 0, burstTimer: 0,
    path: null, pathIndex: 0, pathTimer: 0, noLosTime: 0,
    awakened: false, dead: false, deathTime: 0, animPhase: 0,
    rng: {
      float: () => 0.5, range: (a, b) => (a + b) / 2, int: () => 0, rangeInt: (a) => a,
      chance: () => false, pick: (arr) => arr[0], state: () => [0, 0, 0, 0], setState: () => {},
    },
  });
  return sim.enemies[sim.enemies.length - 1];
}

describe('powerup tracks', () => {
  it('same kind refreshes max(t, duration)', () => {
    const s = createPowerupState();
    applyPowerup(s, 'ward');
    expect(s.wardT).toBe(10);
    s.wardT = 2;
    applyPowerup(s, 'ward');
    expect(s.wardT).toBe(10);
    s.wardT = 12;
    applyPowerup(s, 'ward');
    expect(s.wardT).toBe(12);
  });

  it('damage track newest wins; WARD stacks with WRATH', () => {
    const s = createPowerupState();
    applyPowerup(s, 'ward');
    applyPowerup(s, 'wrath');
    expect(wardActive(s)).toBe(true);
    expect(s.damageKind).toBe('wrath');
    expect(outgoingMul(s)).toBe(3);
    const res = applyPowerup(s, 'sevenfold');
    expect(res.ended).toBe('wrath');
    expect(s.damageKind).toBe('sevenfold');
    expect(s.damageT).toBe(7);
    expect(outgoingMul(s)).toBe(7);
    expect(wardActive(s)).toBe(true);
  });

  it('warns in the last 3s and ends', () => {
    const s = createPowerupState();
    applyPowerup(s, 'ward');
    s.wardT = 3.05;
    const warn = stepPowerups(s, 0.1);
    expect(warn.some(e => e.t === 'warn' && e.kind === 'ward')).toBe(true);
    s.wardT = 0.05;
    const end = stepPowerups(s, 0.1);
    expect(end.some(e => e.t === 'end' && e.kind === 'ward')).toBe(true);
    expect(s.wardT).toBe(0);
  });
});

describe('powerup combat', () => {
  it('WARD blocks incoming damage including self-splash', () => {
    const sim = new Sim('powerup-ward', 'normal');
    applyPowerup(sim.powerups, 'ward');
    const hp = sim.player.hp;
    sim.damagePlayer(40, sim.player.x + 1, sim.player.z);
    expect(sim.player.hp).toBe(hp);
    const shielded = sim.takeEvents().filter(e => e.t === 'playerShielded');
    expect(shielded.length).toBeGreaterThan(0);

    sim.giveGun(5);
    sim.projectiles.push({
      id: 1, kind: 'grenade', fromPlayer: true,
      x: sim.player.x, y: 0.4, z: sim.player.z,
      vx: 0, vy: 0, vz: 0, gravity: 0, radius: 0.3,
      damage: 90, splashRadius: 5, damageSelfPct: 0.25, age: 0,
    });
    sim.impactProjectile(sim.projectiles[0]);
    expect(sim.player.hp).toBe(hp);
  });

  it('WRATH ×3 and SEVENFOLD ×7 apply to hitscan, projectile, and splash', () => {
    const pistol = WEAPONS[0].damage;

    const hitscan = new Sim('powerup-hit', 'normal');
    hitscan.player.yaw = 0;
    applyPowerup(hitscan.powerups, 'wrath');
    const e1 = dummyAt(hitscan, hitscan.player.x, hitscan.player.z - 5);
    hitscan.step(input({ fire: true }));
    expect(e1.maxHp - e1.hp).toBe(pistol * 3);

    const seven = new Sim('powerup-seven', 'normal');
    seven.player.yaw = 0;
    applyPowerup(seven.powerups, 'sevenfold');
    const e2 = dummyAt(seven, seven.player.x, seven.player.z - 5);
    seven.step(input({ fire: true }));
    expect(e2.maxHp - e2.hp).toBe(pistol * 7);

    const nails = Sim.fromMap(compileBlueprint(tinyGunSealBlueprint()), 'normal', { rngKey: 'powerup-nail' });
    nails.player.yaw = 0;
    nails.giveGun(4);
    applyPowerup(nails.powerups, 'wrath');
    const e3 = dummyAt(nails, nails.player.x, nails.player.z - 4, 500);
    nails.step(input({ fire: true }));
    for (let i = 0; i < 90; i++) nails.step(emptyInput());
    expect(e3.maxHp - e3.hp).toBe(WEAPONS[3].damage * 3);

    const splash = new Sim('powerup-splash', 'normal');
    applyPowerup(splash.powerups, 'sevenfold');
    const e4 = dummyAt(splash, splash.player.x, splash.player.z - 2, 2000);
    splash.projectiles.push({
      id: 1, kind: 'grenade', fromPlayer: true,
      x: splash.player.x, y: 0.5, z: splash.player.z - 1,
      vx: 0, vy: 0, vz: 0, gravity: 0, radius: 0.3,
      damage: 90 * 7, splashRadius: 5, damageSelfPct: 0.25, age: 0,
    });
    const before = e4.hp;
    splash.impactProjectile(splash.projectiles[0]);
    expect(before - e4.hp).toBeGreaterThan(90 * 7 * 0.25);
  });

  it('powerup colors match the spec', () => {
    expect(POWERUP_DEFS.ward.color).toBe('#38C8FF');
    expect(POWERUP_DEFS.wrath.color).toBe('#A24BFF');
    expect(POWERUP_DEFS.sevenfold.color).toBe('#4DFF9B');
    expect(POWERUP_DEFS.ward.duration).toBe(10);
    expect(POWERUP_DEFS.wrath.duration).toBe(20);
    expect(POWERUP_DEFS.sevenfold.duration).toBe(7);
  });
});
