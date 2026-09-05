// Projectiles must leave the visible launcher (mortar bell, mouth, etc.),
// not the body's centre axis. This pins the yaw-rotation math in
// Sim.enemyShoot: def.muzzleOffset is expressed in the enemy's LOCAL frame
// (mesh convention +z forward / +x right) and must be rotated by e.yaw —
// the same rotation the render rig applies to yawGroup.rotation.y — to land
// in the right place in world space. A sign error here looks correct
// head-on (yaw 0) and wrong from the side, so this checks multiple yaws,
// including mirrored +x/-x facings.
import { describe, it, expect } from 'vitest';
import { Sim, type EnemyEnt } from '../../src/sim/sim';
import { ENEMIES } from '../../src/sim/enemyTypes';
import type { EnemyType } from '../../src/sim/types';
import { makeRng } from '../../src/sim/rng';

function testEnemy(type: EnemyType, x: number, z: number, yaw: number): EnemyEnt {
  const def = ENEMIES[type];
  return {
    id: 999, type, def, x, z, yaw, hp: def.hp, maxHp: def.hp,
    speed: def.speed, accuracy: 0, state: 'attack', timer: 0, attackCd: 0,
    burstLeft: def.burst, burstTimer: 0, path: null, pathIndex: 0, pathTimer: 0,
    noLosTime: 0, awakened: true, dead: false, deathTime: 0, animPhase: 0,
    rng: makeRng('muzzle-offset-test'),
  };
}

/** Fires one shot for `e` and returns the spawned projectile's origin. */
function fireFrom(sim: Sim, e: EnemyEnt): { x: number; y: number; z: number } {
  sim.projectiles.length = 0;
  sim.enemyShoot(e);
  const p = sim.projectiles[sim.projectiles.length - 1];
  expect(p, 'enemyShoot did not spawn a projectile').toBeTruthy();
  return { x: p.x, y: p.y, z: p.z };
}

describe('enemy projectile muzzle offset', () => {
  it('every species emits from its authored muzzle at its actual height', () => {
    const sim = new Sim('muzzle-offset-all-species', 'normal');
    sim.player.x = 500; sim.player.z = 500;
    const types: EnemyType[] = ['husk', 'crawler', 'slab', 'wisp', 'hierophant', 'fiend'];
    for (const type of types) {
      const def = ENEMIES[type];
      const yaw = 0.73;
      const p = fireFrom(sim, testEnemy(type, 4, -6, yaw));
      const baseline = def.flying ? def.hoverY : def.height * 0.72;
      expect(p.x, `${type} muzzle x`).toBeCloseTo(4 + def.muzzleOffset.forward * Math.sin(yaw) + def.muzzleOffset.right * Math.cos(yaw), 5);
      expect(p.z, `${type} muzzle z`).toBeCloseTo(-6 + def.muzzleOffset.forward * Math.cos(yaw) - def.muzzleOffset.right * Math.sin(yaw), 5);
      expect(p.y, `${type} muzzle height`).toBeCloseTo(baseline + def.muzzleOffset.up, 5);
    }
  });

  it('slab: mortar spawn rotates with yaw, including a +x vs -x facing flip', () => {
    const sim = new Sim('muzzle-offset-1', 'normal');
    sim.player.x = 500; sim.player.z = 500; // far off-axis: aim error is 0 (accuracy 0) so it can't mask the origin math
    const off = ENEMIES.slab.muzzleOffset;
    const shotY = ENEMIES.slab.height * 0.72 + off.up;

    // yaw 0: enemy faces world +z. Local right (+x) maps straight onto world +x.
    const p0 = fireFrom(sim, testEnemy('slab', 0, 0, 0));
    expect(p0.x).toBeCloseTo(off.right, 5);
    expect(p0.z).toBeCloseTo(off.forward, 5);
    expect(p0.y).toBeCloseTo(shotY, 5);

    // yaw +PI/2: enemy faces world +x. Forward maps onto +x, right maps onto -z.
    const p1 = fireFrom(sim, testEnemy('slab', 0, 0, Math.PI / 2));
    expect(p1.x).toBeCloseTo(off.forward, 5);
    expect(p1.z).toBeCloseTo(-off.right, 5);

    // yaw -PI/2: enemy faces world -x — the mirror image of the previous
    // case. A sign error in the rotation (e.g. swapped sin/cos signs) would
    // produce the SAME numbers as yaw +PI/2 here instead of the negation.
    const p2 = fireFrom(sim, testEnemy('slab', 0, 0, -Math.PI / 2));
    expect(p2.x).toBeCloseTo(-off.forward, 5);
    expect(p2.z).toBeCloseTo(off.right, 5);
    expect(p2.x).toBeCloseTo(-p1.x, 5);
    expect(p2.z).toBeCloseTo(-p1.z, 5);

    // offset from an arbitrary world position: rotation composes with translation.
    const e3 = testEnemy('slab', 4, -6, Math.PI / 2);
    const p3 = fireFrom(sim, e3);
    expect(p3.x).toBeCloseTo(4 + off.forward, 5);
    expect(p3.z).toBeCloseTo(-6 - off.right, 5);
  });

  it('husk: mouth spawn rotates with yaw at an arbitrary angle', () => {
    const sim = new Sim('muzzle-offset-2', 'normal');
    sim.player.x = -500; sim.player.z = 500;
    const off = ENEMIES.husk.muzzleOffset;
    const yaw = 0.7; // arbitrary, not axis-aligned
    const cosY = Math.cos(yaw), sinY = Math.sin(yaw);

    const p = fireFrom(sim, testEnemy('husk', 2, 3, yaw));
    expect(p.x).toBeCloseTo(2 + off.forward * sinY + off.right * cosY, 5);
    expect(p.z).toBeCloseTo(3 + off.forward * cosY - off.right * sinY, 5);
    expect(p.y).toBeCloseTo(ENEMIES.husk.height * 0.72 + off.up, 5);
  });

  it('wisp: flying muzzle Y is built from the hover-centre baseline, not ground height', () => {
    const sim = new Sim('muzzle-offset-3', 'normal');
    sim.player.x = 500; sim.player.z = -500;
    const off = ENEMIES.wisp.muzzleOffset;
    const p = fireFrom(sim, testEnemy('wisp', 0, 0, 0));
    expect(p.y).toBeCloseTo(ENEMIES.wisp.hoverY + off.up, 5);
  });
});
