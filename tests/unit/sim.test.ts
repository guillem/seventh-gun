// Difficulty multipliers + determinism + enemy behavior guarantees.
import { describe, it, expect } from 'vitest';
import { Sim, emptyInput } from '../../src/sim/sim';
import { DIFFICULTIES } from '../../src/sim/difficulty';
import { generateMap } from '../../src/sim/mapgen';
import type { SimInput } from '../../src/sim/sim';
import { compileBlueprint } from '../../src/sim/blueprint';
import { hasLineOfSight, hasVisualLineOfSight } from '../../src/sim/physics';
import { tinyGunSealBlueprint } from '../helpers/authoredMaps';

function input(partial: Partial<SimInput> = {}): SimInput {
  return { ...emptyInput(), ...partial };
}

describe('difficulty', () => {
  it('is a whole-economy switch: enemy HP, damage, counts, loot all scale', () => {
    const easy = new Sim('diff-seed', 'easy');
    const normal = new Sim('diff-seed', 'normal');
    const hard = new Sim('diff-seed', 'hard');
    const avg = (s: Sim) => s.enemies.reduce((a, e) => a + e.hp, 0) / s.enemies.length;
    expect(avg(easy)).toBeLessThan(avg(normal));
    expect(avg(hard)).toBeGreaterThan(avg(normal));
    expect(hard.enemies.length).toBeGreaterThan(easy.enemies.length);
    // outgoing damage differs
    const d = DIFFICULTIES;
    expect(d.easy.playerDamageOut).toBeGreaterThan(d.hard.playerDamageOut);
    expect(d.easy.medikitHeal).toBeGreaterThan(d.hard.medikitHeal);
    // enemy projectile damage scale
    expect(d.easy.enemyDamage).toBeLessThan(d.hard.enemyDamage);
    // reaction: hard reacts faster
    expect(d.hard.enemyReaction).toBeLessThan(d.easy.enemyReaction);
  });

  it('same seed across difficulties: identical layout, different economy', () => {
    const a = generateMap('layout-x', 'easy');
    const b = generateMap('layout-x', 'hard');
    expect([...a.grid]).toEqual([...b.grid]);
    expect(a.rooms.length).toBe(b.rooms.length);
  });

  it('enemy stats in-sim match the multiplier table', () => {
    const s = new Sim('stat-seed', 'hard');
    const diff = DIFFICULTIES.hard;
    const husk = s.enemies.find(e => e.type === 'husk')!;
    expect(husk.maxHp).toBe(Math.round(30 * diff.enemyHp));
    expect(husk.speed).toBeCloseTo(3.4 * diff.enemySpeed);
  });
});

describe('determinism', () => {
  it('same seed + same scripted input => identical snapshots', () => {
    const run = () => {
      const sim = new Sim('determinism', 'normal');
      // walk forward while turning and firing
      for (let i = 0; i < 600; i++) {
        const yaw = sim.player.yaw + 0.002 * Math.sin(i * 0.05);
        sim.step(input({
          moveZ: i % 40 < 30 ? 1 : 0,
          moveX: i % 80 < 40 ? 1 : -1,
          yaw,
          pitch: 0.1 * Math.sin(i * 0.01),
          fire: i % 17 === 0,
        }));
        if (sim.phase !== 'playing') break;
      }
      return sim.snapshot();
    };
    const a = run();
    const b = run();
    expect(a).toBe(b);
  });

  it('different seeds => different maps', () => {
    const a = new Sim('seed-a', 'normal');
    const b = new Sim('seed-b', 'normal');
    expect(a.snapshot()).not.toBe(b.snapshot());
  });
});

describe('enemy behavior guarantees', () => {
  it('enemies wake by proximity, sight cone and gunshot noise', () => {
    const sim = new Sim('wake-seed', 'normal');
    // teleport an enemy far away, fire, it should wake via noise
    const e = sim.enemies[0];
    e.x = sim.player.x + 10; e.z = sim.player.z; // within pistol loudness
    sim.step(input({ fire: true }));
    expect(e.awakened).toBe(true);
  });

  it('enemies cannot attack through a closed door (no LOS through solid)', () => {
    const sim = new Sim('door-seed', 'normal');
    const door = sim.doors[0];
    if (!door) return;
    // put player on one side, enemy on the other
    const e = sim.enemies[0];
    e.x = door.x + 4; e.z = door.z;
    e.state = 'chase'; e.awakened = true;
    sim.player.x = door.x - 4; sim.player.z = door.z;
    for (let i = 0; i < 300; i++) sim.step(input({ yaw: sim.player.yaw }));
    const attacking = (e.state as string) === 'attack';
    expect(attacking).toBe(false);
    expect(sim.player.hp).toBe(100); // nothing landed through the door
  });

  it('enemy projectiles are dodgeable: they travel, not teleport', () => {
    const sim = new Sim('proj-seed', 'normal');
    const e = sim.enemies[0];
    e.x = sim.player.x; e.z = sim.player.z - 12;
    e.state = 'attack'; e.awakened = true; e.timer = 0; e.burstLeft = 1; e.attackCd = 0;
    e.def = { ...e.def, windup: 0.01, accuracy: 0, attackInterval: 99 };
    const before = sim.projectiles.length;
    sim.step(input({}));
    expect(sim.projectiles.length).toBe(before + 1);
    const p = sim.projectiles[sim.projectiles.length - 1];
    const speed = Math.hypot(p.vx, p.vz);
    expect(speed).toBeGreaterThan(5);
    expect(speed).toBeLessThan(40);
  });

  it('dying phase locks input for 2 seconds then reports dead', () => {
    const sim = new Sim('die-seed', 'normal');
    sim.player.hp = 1;
    sim.damagePlayer(50, sim.player.x + 1, sim.player.z);
    expect(sim.phase).toBe('dying');
    sim.takeEvents(); // drain the death event
    for (let i = 0; i < 119; i++) sim.step(input({ moveZ: 1 }));
    expect(sim.phase).toBe('dying');
    sim.step(input({}));
    expect(sim.phase).toBe('dead');
    // and a second lethal hit does not double-fire the death event
    const evs = sim.takeEvents().filter(e => e.t === 'playerDie');
    expect(evs.length).toBe(0);
  });

  it('picking up the seventh gun breaks the seal and clearing the arena wins', () => {
    const sim = new Sim('win-seed', 'normal');
    const g7 = sim.pickups.find(p => p.kind === 'gun' && p.gun === 7)!;
    sim.player.x = g7.x; sim.player.z = g7.z;
    sim.checkPickups();
    expect(sim.sealIntact).toBe(false);
    // walk into the arena and kill everything there
    const arena = sim.map.rooms.find(r => r.kind === 'arena')!;
    sim.player.x = arena.cx; sim.player.z = arena.cz;
    for (const e of sim.enemies) {
      if (!e.dead && sim.enemyRoomId(e) === sim.map.arenaRoomId) { e.hp = 1; sim.damageEnemy(e, 10, 0); }
    }
    for (let i = 0; i < 240 && sim.phase === 'playing'; i++) sim.step(input({}));
    expect(sim.phase).toBe('won');
    const evs = sim.events.filter(e => e.t === 'won');
    expect(evs.length).toBe(1);
  });
});

describe('visual LOS through opening doors', () => {
  it('opening a door reveals immediately; collision still waits for the slab', () => {
    const map = compileBlueprint(tinyGunSealBlueprint());
    const sim = Sim.fromMap(map, 'normal', { rngKey: 'visual-door' });
    const door = sim.doors[0];
    expect(door).toBeTruthy();
    const husk = sim.enemies.find(e => e.type === 'husk')!;
    // player in the start room, looking at the husk behind the door
    const start = sim.map.rooms.find(r => r.kind === 'start')!;
    sim.player.x = start.cx;
    sim.player.z = start.cz;
    expect(hasLineOfSight(sim, sim.player.x, sim.player.z, husk.x, husk.z)).toBe(false);
    expect(hasVisualLineOfSight(sim, sim.player.x, sim.player.z, husk.x, husk.z)).toBe(false);

    door.opening = true;
    door.offset = 0;
    expect(hasLineOfSight(sim, sim.player.x, sim.player.z, husk.x, husk.z)).toBe(false);
    expect(hasVisualLineOfSight(sim, sim.player.x, sim.player.z, husk.x, husk.z)).toBe(true);

    door.offset = 0.7;
    expect(hasLineOfSight(sim, sim.player.x, sim.player.z, husk.x, husk.z)).toBe(true);
    expect(hasVisualLineOfSight(sim, sim.player.x, sim.player.z, husk.x, husk.z)).toBe(true);
  });
});
