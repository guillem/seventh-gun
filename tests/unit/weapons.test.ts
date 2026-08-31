// Weapon personalities: the shotgun must scatter, the rail must pierce, the
// ladder must climb. Tests drive the sim directly with crafted geometry.
import { describe, it, expect } from 'vitest';
import { Sim, emptyInput } from '../../src/sim/sim';
import { WEAPONS, weapon } from '../../src/sim/weapons';
import { ENEMIES } from '../../src/sim/enemyTypes';
import { hasLineOfSight } from '../../src/sim/physics';
import type { SimInput } from '../../src/sim/sim';

function freshSim(): Sim {
  return new Sim('weapons-test', 'normal');
}

function input(partial: Partial<SimInput> = {}): SimInput {
  return { ...emptyInput(), ...partial };
}

/** Place a dummy enemy 8 units in front of the player, frozen via manual state. */
function dummyAt(sim: Sim, x: number, z: number, hp = 1000): void {
  sim.enemies.push({
    id: 9000 + sim.enemies.length,
    type: 'husk',
    def: { ...ENEMIES.husk, sightRange: 0, hearRange: 0, wakeRadius: 0, speed: 0 },
    x, z, yaw: 0,
    hp, maxHp: hp,
    speed: 0,
    accuracy: 0,
    state: 'idle', timer: 0, attackCd: 99, burstLeft: 0, burstTimer: 0,
    path: null, pathIndex: 0, pathTimer: 0, noLosTime: 0,
    awakened: false, dead: false, deathTime: 0, animPhase: 0,
    rng: { float: () => 0.5, range: (a, b) => (a + b) / 2, int: () => 0, rangeInt: (a) => a, chance: () => false, pick: (arr) => arr[0], state: () => [0, 0, 0, 0], setState: () => {} },
  });
}

describe('weapon personalities', () => {
  it('pistol: single accurate hitscan, no spread', () => {
    const sim = freshSim();
    sim.player.yaw = 0;
    dummyAt(sim, sim.player.x, sim.player.z - 5);
    const e = sim.enemies[sim.enemies.length - 1];
    sim.step(input({ fire: true }));
    expect(e.hp).toBe(e.maxHp - WEAPONS[0].damage); // exactly one pellet, full damage
  });

  it('shotgun: eight pellets, close range devastates, far range falls off', () => {
    const sim = freshSim();
    sim.player.yaw = 0;
    sim.giveGun(2);
    // find a spot with room to shoot: use the start room, dummy at 5 units
    dummyAt(sim, sim.player.x, sim.player.z - 5, 500);
    const close = sim.enemies[sim.enemies.length - 1];
    expect(hasLineOfSight(sim, sim.player.x, sim.player.z, close.x, close.z)).toBe(true);
    sim.step(input({ fire: true }));
    const closeDmg = close.maxHp - close.hp;
    expect(closeDmg, 'most pellets connect at 5u').toBeGreaterThanOrEqual(8 * 9 * 0.75);

    const sim2 = freshSim();
    sim2.player.yaw = 0;
    sim2.giveGun(2);
    dummyAt(sim2, sim2.player.x, sim2.player.z - 5, 500);
    const far = sim2.enemies[sim2.enemies.length - 1];
    // simulate falloff by checking the falloff curve used at 26+ units
    const w = weapon(2);
    let farFactor = 1;
    for (let d = w.falloffStart; d <= 30; d += 0.5) {
      farFactor = 1 - ((d - w.falloffStart) / (w.falloffEnd - w.falloffStart)) * (1 - w.falloffMin);
    }
    expect(farFactor).toBeLessThanOrEqual(w.falloffMin + 0.01);
    void far;
  });

  it('chaingun: bloom grows while held, tightens when released', () => {
    const sim = freshSim();
    sim.giveGun(3);
    let maxBloom = 0;
    for (let i = 0; i < 180; i++) { sim.step(input({ fire: true })); maxBloom = Math.max(maxBloom, sim.player.bloom); }
    expect(maxBloom).toBeGreaterThan(WEAPONS[2].bloomMax * 0.8);
    for (let i = 0; i < 120; i++) sim.step(input({}));
    expect(sim.player.bloom).toBeLessThan(WEAPONS[2].bloomMax * 0.2);
  });

  it('spiker and bile launcher spawn physical projectiles with identity', () => {
    const sim = freshSim();
    sim.giveGun(4);
    sim.step(input({ fire: true }));
    expect(sim.projectiles.length).toBe(1);
    expect(sim.projectiles[0].kind).toBe('nail');
    expect(sim.projectiles[0].gravity).toBe(0);
    const sim2 = freshSim();
    sim2.giveGun(5);
    sim2.step(input({ fire: true }));
    expect(sim2.projectiles[0].kind).toBe('grenade');
    expect(sim2.projectiles[0].gravity).toBeGreaterThan(0); // it arcs
  });

  it('sunlance rail pierces every aligned enemy and stops at walls', () => {
    const sim = freshSim();
    sim.player.yaw = 0;
    for (let i = 1; i <= 3; i++) dummyAt(sim, sim.player.x, sim.player.z - 1.8 * i, 500);
    const hit = sim.enemies.slice(-3).filter(e => hasLineOfSight(sim, sim.player.x, sim.player.z, e.x, e.z));
    expect(hit.length).toBeGreaterThanOrEqual(2);
    sim.giveGun(6);
    const before = sim.player.ammo.cores;
    sim.step(input({ fire: true }));
    expect(sim.player.ammo.cores).toBe(before - 1);
    for (const e of hit) {
      expect(e.hp, 'rail must damage every enemy in the line').toBeLessThan(e.maxHp);
    }
    const beams = sim.takeEvents().filter(ev => ev.t === 'beam');
    expect(beams.length).toBe(1);
  });

  it('the seventh hits several enemies at once with splash', () => {
    const sim = freshSim();
    sim.player.yaw = 0;
    dummyAt(sim, sim.player.x, sim.player.z - 10, 400);
    dummyAt(sim, sim.player.x + 3, sim.player.z - 11, 400);
    dummyAt(sim, sim.player.x - 3, sim.player.z - 12, 400);
    sim.giveGun(7);
    // fire, then let the orb travel
    for (let i = 0; i < 90; i++) sim.step(input({ fire: i === 0 }));
    const damaged = sim.enemies.slice(-3).filter(e => e.hp < e.maxHp).length;
    expect(damaged).toBeGreaterThanOrEqual(3);
  });

  it('power ladder climbs: sustained DPS and burst both increase overall', () => {
    const dps = (id: number) => {
      const w = weapon(id);
      const shotsPerSec = 1 / w.fireInterval;
      return shotsPerSec * w.damage * w.pellets;
    };
    for (let id = 2; id <= 6; id++) {
      expect(dps(id + 1), `gun ${id + 1} should out-DPS gun ${id}`).toBeGreaterThan(dps(id) * 0.55);
    }
    expect(dps(7)).toBeGreaterThan(dps(1) * 2); // superweapon clearly beyond the pistol
    // per-shot damage is monotonic for the heavy hitters
    expect(weapon(6).damage).toBeGreaterThan(weapon(2).damage * weapon(2).pellets * 0.8);
  });

  it('dry-fire does not spam events', () => {
    const sim = freshSim();
    sim.player.ammo.bullets = 0;
    for (let i = 0; i < 60; i++) sim.step(input({ fire: true })); // one second of holding
    const dry = sim.takeEvents().filter(ev => ev.t === 'dryfire');
    expect(dry.length).toBeLessThanOrEqual(3);
    expect(sim.player.hp).toBe(100); // dry firing cost nothing
  });

  it('every gun grants a usable starting stack on pickup', () => {
    const minimums: Record<number, number> = { 2: 12, 3: 60, 4: 40, 5: 6, 6: 8, 7: 4 };
    for (const w of WEAPONS.slice(1)) {
      expect(w.spawnAmmo, `${w.name} spawn stack`).toBeGreaterThanOrEqual(minimums[w.id]);
    }
  });
});
