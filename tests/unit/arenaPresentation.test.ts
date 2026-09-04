import { describe, expect, it } from 'vitest';
import { ArenaSim } from '../../src/sim/arena';
import { aimDirFromLook } from '../../src/sim/aim';
import { emptyInput, STEP_DT } from '../../src/sim/sim';
import { WEAPONS } from '../../src/sim/weapons';

describe('arena combat presentation payloads', () => {
  it('keeps every gun aligned with its authoritative yaw and pitch', () => {
    const sim = new ArenaSim('arena-presentation-aim');
    const shooter = sim.join('SHOOTER');
    const observer = sim.join('OBSERVER');
    if (shooter === 'full' || observer === 'full') throw new Error('unexpected full room');
    sim.takeEvents();

    // A diagonal, upward look catches the old horizontal-only tracer/beam
    // bug and makes a reversed local projectile mesh immediately apparent to
    // a remote observer consuming the same payload.
    shooter.yaw = 0.73;
    shooter.pitch = 0.37;
    shooter.protectUntil = 0;
    let seq = 1;
    for (const weapon of WEAPONS) {
      shooter.gun = weapon.id as 1 | 2 | 3 | 4 | 5 | 6 | 7;
      shooter.owned[weapon.id] = true;
      shooter.ammo[weapon.ammo] = Math.max(shooter.ammo[weapon.ammo], 20);
      shooter.fireCd = 0;
      sim.pushInput(shooter.id, seq++, [{ ...emptyInput(), yaw: shooter.yaw, pitch: shooter.pitch, fire: true }]);
      sim.step(STEP_DT);
      const events = sim.takeEvents();
      const shot = events.find((event) => event.t === 'shot');
      expect(shot).toMatchObject({ id: shooter.id, gun: weapon.id, inputSeq: seq - 1, yaw: shooter.yaw, pitch: shooter.pitch });

      const aim = aimDirFromLook(shooter.yaw, shooter.pitch);
      const line = events.find((event) => event.t === 'tracer' || event.t === 'beam');
      const spawned = events.find((event) => event.t === 'spawnProjectile');
      if (weapon.hitscan) {
        expect(line, `gun ${weapon.id} needs a visible hitscan line`).toBeTruthy();
        if (!line || !('y1' in line)) continue;
        const dx = line.x1 - line.x0;
        const dy = line.y1 - line.y0;
        const dz = line.z1 - line.z0;
        const len = Math.hypot(dx, dy, dz);
        // Spread weapons may deviate slightly, but still must travel into the
        // same 3D hemisphere as the shooter view.
        expect((dx * aim.dirX + dy * aim.dirY + dz * aim.dirZ) / len, `gun ${weapon.id} points away from aim`).toBeGreaterThan(0.99);
      } else {
        expect(spawned, `gun ${weapon.id} needs an immediate projectile lifecycle event`).toBeTruthy();
        if (!spawned || !('vx' in spawned)) continue;
        const speed = Math.hypot(spawned.vx, spawned.vy, spawned.vz);
        expect((spawned.vx * aim.dirX + spawned.vy * aim.dirY + spawned.vz * aim.dirZ) / speed, `gun ${weapon.id} projectile points away from aim`).toBeGreaterThan(0.999);
        const snapshot = sim.snapshot().projectiles.find((projectile) => projectile.id === spawned.projectileId);
        expect(snapshot).toMatchObject({ ownerId: shooter.id, vx: spawned.vx, vz: spawned.vz });
        expect(snapshot?.vy).toBeCloseTo(spawned.vy - spawned.gravity * STEP_DT);
      }
    }
  });
});
