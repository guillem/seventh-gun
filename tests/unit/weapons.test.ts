// Weapon personalities: the shotgun must scatter, the rail must pierce, the
// ladder must climb. Tests drive the sim directly with crafted geometry.
import { describe, it, expect } from 'vitest';
import { Sim, emptyInput } from '../../src/sim/sim';
import type { EnemyEnt } from '../../src/sim/sim';
import type { SimEvent } from '../../src/sim/types';
import { CELL, PLAYER_EYE, PLAYER_RADIUS } from '../../src/sim/types';
import { WEAPONS, weapon } from '../../src/sim/weapons';
import { ENEMIES, enemyGunRadius, enemyGunVolumeY, enemyVolumeY } from '../../src/sim/enemyTypes';
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

  it('shotgun at yaw 45° has non-zero horizontal pellet spread (8 pellets, ~5.7° cone)', () => {
    const w = weapon(2);
    expect(w.pellets).toBe(8);
    expect(w.spread * 180 / Math.PI).toBeCloseTo(5.7, 1);

    const sim = freshSim();
    sim.player.yaw = Math.PI / 4;
    sim.player.pitch = 0;
    sim.giveGun(2);
    const dirs: { x: number; z: number }[] = [];
    const orig = sim.hitscanShot.bind(sim);
    sim.hitscanShot = (ox, oy, oz, dx, dy, dz, damage, pierce, wpn, visual) => {
      dirs.push({ x: dx, z: dz });
      orig(ox, oy, oz, dx, dy, dz, damage, pierce, wpn, visual);
    };
    sim.fireWeapon();
    expect(dirs).toHaveLength(8);
    const lookX = -Math.sin(Math.PI / 4);
    const lookZ = -Math.cos(Math.PI / 4);
    const lats = dirs.map(d => d.x * lookZ - d.z * lookX);
    expect(Math.max(...lats.map(Math.abs)), 'horizontal spread at 45° yaw').toBeGreaterThan(1e-4);
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

/** Frozen wisp (flying enemy) at x/z — its body hovers at hoverY, not the floor. */
function wispAt(sim: Sim, x: number, z: number, hp = 1000): void {
  sim.enemies.push({
    id: 9000 + sim.enemies.length,
    type: 'wisp',
    def: { ...ENEMIES.wisp, sightRange: 0, hearRange: 0, wakeRadius: 0, speed: 0 },
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

/** Look-down-positive pitch that aims the eye at height h over distance d. */
function aimPitchAt(h: number, d: number): number {
  return Math.atan2(PLAYER_EYE - h, d);
}

function crawlerAt(sim: Sim, x: number, z: number, hp = 1000): void {
  sim.enemies.push({
    id: 9000 + sim.enemies.length,
    type: 'crawler',
    def: { ...ENEMIES.crawler, sightRange: 0, hearRange: 0, wakeRadius: 0, speed: 0 },
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

describe('flying enemy hitboxes track the visible body', () => {
  const D = 5; // wisp placed 5 units ahead (start room clearance, same as other tests)
  // Visible torso is the octahedron centered on hoverY, not a volume stacked above the head.
  const torsoY = ENEMIES.wisp.hoverY;
  const aboveHeadY = ENEMIES.wisp.hoverY + ENEMIES.wisp.height * 0.5 + 0.45;

  function wispSim(): { sim: Sim; wisp: EnemyEnt } {
    const sim = freshSim();
    sim.player.yaw = 0;
    wispAt(sim, sim.player.x, sim.player.z - D);
    return { sim, wisp: sim.enemies[sim.enemies.length - 1] };
  }

  it('hitscan through the visible torso registers', () => {
    const { sim, wisp } = wispSim();
    expect(hasLineOfSight(sim, sim.player.x, sim.player.z, wisp.x, wisp.z)).toBe(true);
    sim.step(input({ fire: true, pitch: aimPitchAt(torsoY, D) }));
    expect(wisp.hp, 'shot through the visible torso must connect').toBe(wisp.maxHp - WEAPONS[0].damage);
    const hit = sim.takeEvents().find((ev): ev is Extract<SimEvent, { t: 'hitEnemy' }> => ev.t === 'hitEnemy');
    expect(hit, 'hit puff must spawn on the body, not near the floor').toBeTruthy();
    expect(hit?.y).toBeCloseTo(torsoY, 5);
  });

  it('a shot clearly above the head misses', () => {
    const { sim, wisp } = wispSim();
    expect(hasLineOfSight(sim, sim.player.x, sim.player.z, wisp.x, wisp.z)).toBe(true);
    sim.step(input({ fire: true, pitch: aimPitchAt(aboveHeadY, D) }));
    expect(wisp.hp, 'shot above the head must miss').toBe(wisp.maxHp);
  });

  it('a shot at the top of the hover bob connects', () => {
    const { sim, wisp } = wispSim();
    // Halo (the visible rounded body) tops out 0.52 above rig.body's y; at
    // the peak of the render's hover bob that reaches hoverY + 0.52 + hoverBob
    // = 3.00, which was above the old static ceiling (2.85) — a miss the
    // player would see as "I was clearly aiming at it." enemyVolumeY must
    // now cover this point.
    const bobTopY = ENEMIES.wisp.hoverY + 0.52 + ENEMIES.wisp.hoverBob;
    expect(bobTopY, 'sanity: this point must exceed the pre-fix volume').toBeGreaterThan(2.85);
    expect(bobTopY).toBeLessThanOrEqual(enemyVolumeY(ENEMIES.wisp).yMax);
    expect(hasLineOfSight(sim, sim.player.x, sim.player.z, wisp.x, wisp.z)).toBe(true);
    sim.step(input({ fire: true, pitch: aimPitchAt(bobTopY, D) }));
    expect(wisp.hp, 'shot at the visibly-highest point of the hover bob must connect').toBeLessThan(wisp.maxHp);
  });

  it('aiming under the body (the old floor band) no longer connects', () => {
    const { sim, wisp } = wispSim();
    expect(hasLineOfSight(sim, sim.player.x, sim.player.z, wisp.x, wisp.z)).toBe(true);
    // old hitbox lived at y in (0.1, height+0.15) — aim through the middle of it
    sim.step(input({ fire: true, pitch: aimPitchAt(0.65, D) }));
    expect(wisp.hp, 'floor-level ghost hitbox must be gone').toBe(wisp.maxHp);
  });

  it('spiker nail aimed at the body connects in flight', () => {
    const { sim, wisp } = wispSim();
    sim.giveGun(4);
    for (let i = 0; i < 40; i++) sim.step(input({ fire: i === 0, pitch: aimPitchAt(torsoY, D) }));
    expect(wisp.hp, 'nail through the hovering body must connect').toBeLessThan(wisp.maxHp);
  });
});

describe('grounded close-range hitscan is a 3D cylinder test', () => {
  const vol = enemyVolumeY(ENEMIES.crawler);
  const gunR = enemyGunRadius(ENEMIES.crawler);
  // Against the body: living collision keeps this gap. Old closest-XZ-then-Y
  // sampled the floor (y < yMin) on a steep look-down and missed.
  const D = PLAYER_RADIUS + ENEMIES.crawler.radius + 0.02;

  function closeCrawler(): { sim: Sim; crawler: EnemyEnt } {
    const sim = freshSim();
    sim.player.yaw = 0;
    crawlerAt(sim, sim.player.x, sim.player.z - D);
    return { sim, crawler: sim.enemies[sim.enemies.length - 1] };
  }

  function crawlerAhead(dist: number): { sim: Sim; crawler: EnemyEnt } {
    const sim = freshSim();
    sim.player.yaw = 0;
    crawlerAt(sim, sim.player.x, sim.player.z - dist);
    return { sim, crawler: sim.enemies[sim.enemies.length - 1] };
  }

  it('point-blank look-down at a crawler against the body hits', () => {
    const { sim, crawler } = closeCrawler();
    expect(hasLineOfSight(sim, sim.player.x, sim.player.z, crawler.x, crawler.z)).toBe(true);
    sim.step(input({ fire: true, pitch: aimPitchAt(vol.yCenter, D) }));
    expect(crawler.hp, 'reticle on the visible body must connect').toBe(crawler.maxHp - WEAPONS[0].damage);
  });

  it('live pose: player z=71, crawler z=67.8, look-down +22° hits y≈0.5', () => {
    const sim = freshSim();
    sim.player.x = 15;
    sim.player.z = 71;
    sim.player.yaw = 0;
    crawlerAt(sim, 15, 67.8, 18);
    const crawler = sim.enemies[sim.enemies.length - 1];
    const pitch = 0.384; // +22° look-down (live dump)
    sim.step(input({ fire: true, pitch }));
    expect(sim.lastAimDir, 'fire must record lastAimDir').toBeTruthy();
    expect(sim.lastAimDir!.dirY, 'look-down must have negative dirY').toBeLessThan(0);
    expect(sim.lastAimDir!.at32y, 'ray at t=3.2 must be ~crawler thorax').toBeCloseTo(0.5, 1);
    expect(crawler.hp, 'live 22° look-down at 3.2u must connect').toBeLessThan(18);
  });

  it('nearly-horizontal close shot hits', () => {
    const dist = 3.2;
    const { sim, crawler } = crawlerAhead(dist);
    expect(hasLineOfSight(sim, sim.player.x, sim.player.z, crawler.x, crawler.z)).toBe(true);
    sim.step(input({ fire: true, pitch: 0.22 }));
    expect(crawler.hp, 'nearly-horizontal close shot must connect').toBe(crawler.maxHp - WEAPONS[0].damage);
  });

  // Live playtest: pose dist 3.2. Positive pitch is look-down.
  for (const pitchDeg of [0, 8, 16, 22] as const) {
    it(`playtest pose: dist 3.2, look-down ${pitchDeg}° hits`, () => {
      const dist = 3.2;
      const { sim, crawler } = crawlerAhead(dist);
      expect(hasLineOfSight(sim, sim.player.x, sim.player.z, crawler.x, crawler.z)).toBe(true);
      const pitch = (pitchDeg * Math.PI) / 180;
      sim.step(input({ fire: true, pitch }));
      expect(crawler.hp, `look-down ${pitchDeg}° at 3.2u must connect`)
        .toBe(crawler.maxHp - WEAPONS[0].damage);
    });
  }

  it('playtest pose: steep look-down at the floor under the crawler hits', () => {
    // Screenshot pose: crosshair on the wall–floor junction beyond the body.
    // Floor-plane clip used to eat this before the cylinder.
    const dist = 3.2;
    const { sim, crawler } = crawlerAhead(dist);
    sim.step(input({ fire: true, pitch: aimPitchAt(0, dist) }));
    expect(crawler.hp, 'look-down at the floor under the body must connect')
      .toBe(crawler.maxHp - WEAPONS[0].damage);
  });

  it('playtest pose: crawler ~3u ahead, look-down through the visible front hits', () => {
    // Mesh head/thorax sit ~0.55–0.7u closer than the body origin. A downward
    // pitch that still intersects that visible volume (filling the lower view)
    // used to miss the def.radius 0.5 cylinder and punch the floor.
    const dist = 3.2;
    const { sim, crawler } = crawlerAhead(dist);
    expect(hasLineOfSight(sim, sim.player.x, sim.player.z, crawler.x, crawler.z)).toBe(true);
    const visFront = dist - 0.65;
    sim.step(input({ fire: true, pitch: aimPitchAt(0.12, visFront) }));
    expect(crawler.hp, 'look-down on the visible front must connect').toBe(crawler.maxHp - WEAPONS[0].damage);
  });

  it('playtest pose: eye-aimed at crawler thorax ~3u ahead hits', () => {
    const dist = 3.0;
    const { sim, crawler } = crawlerAhead(dist);
    expect(hasLineOfSight(sim, sim.player.x, sim.player.z, crawler.x, crawler.z)).toBe(true);
    sim.step(input({ fire: true, pitch: aimPitchAt(0.48, dist - 0.5) }));
    expect(crawler.hp, 'pitch through the visible thorax must connect').toBe(crawler.maxHp - WEAPONS[0].damage);
  });

  it('aiming well above the crawler head misses', () => {
    const dist = 3.2;
    const { sim, crawler } = crawlerAhead(dist);
    const loft = enemyGunVolumeY(ENEMIES.crawler, dist);
    sim.step(input({ fire: true, pitch: aimPitchAt(loft.yMax + 0.8, dist) }));
    expect(crawler.hp, 'shot clearly over the head must miss').toBe(crawler.maxHp);
  });

  it('looking up (−16°) at a floor crawler 3.2u ahead misses', () => {
    const dist = 3.2;
    const { sim, crawler } = crawlerAhead(dist);
    sim.step(input({ fire: true, pitch: (-16 * Math.PI) / 180 }));
    expect(crawler.hp, 'look-up must miss the floor body').toBe(crawler.maxHp);
  });

  it('aiming into the floor in front of a crawler misses', () => {
    const dist = 3.2;
    const { sim, crawler } = crawlerAhead(dist);
    // Floor well in front of even the enlarged gun cylinder (front ≈ dist - gunR).
    expect(dist - gunR).toBeGreaterThan(1.4);
    sim.step(input({ fire: true, pitch: aimPitchAt(0, 1.0) }));
    expect(crawler.hp, 'shot into the floor in front must miss').toBe(crawler.maxHp);
  });

  it('a husk at range still takes a level pistol shot', () => {
    const sim = freshSim();
    sim.player.yaw = 0;
    dummyAt(sim, sim.player.x, sim.player.z - 5);
    const husk = sim.enemies[sim.enemies.length - 1];
    expect(hasLineOfSight(sim, sim.player.x, sim.player.z, husk.x, husk.z)).toBe(true);
    sim.step(input({ fire: true, pitch: 0 }));
    expect(husk.hp).toBe(husk.maxHp - WEAPONS[0].damage);
  });

  it('look-down still hits when the crawler center is slightly behind the camera plane', () => {
    const sim = freshSim();
    const ox = sim.player.x, oz = sim.player.z;
    crawlerAt(sim, ox, oz + 0.28);
    const crawler = sim.enemies[sim.enemies.length - 1];
    // Reticle on the part of the body that still sits in front of the eye.
    const tx = ox, ty = vol.yCenter, tz = oz - 0.25;
    let dx = tx - ox, dy = ty - PLAYER_EYE, dz = tz - oz;
    const len = Math.hypot(dx, dy, dz) || 1;
    dx /= len; dy /= len; dz /= len;
    sim.hitscanShot(ox, PLAYER_EYE, oz, dx, dy, dz, WEAPONS[0].damage, false, WEAPONS[0], true);
    expect(crawler.hp, 'volume in front of the eye must count even if center t is negative')
      .toBe(crawler.maxHp - WEAPONS[0].damage);
  });

  it('a forward shot does not hit a husk standing behind the gun', () => {
    const sim = freshSim();
    sim.player.yaw = 0;
    dummyAt(sim, sim.player.x, sim.player.z + 4);
    const husk = sim.enemies[sim.enemies.length - 1];
    sim.step(input({ fire: true, pitch: 0 }));
    expect(husk.hp, 'must not shoot out the back of the head').toBe(husk.maxHp);
  });

  it('a solid cell between player and crawler still blocks the shot', () => {
    const { sim, crawler } = closeCrawler();
    const far = 6;
    crawler.z = sim.player.z - far;
    const midZ = (sim.player.z + crawler.z) / 2;
    const cx = Math.floor(sim.player.x / CELL);
    const cz = Math.floor(midZ / CELL);
    sim.map.grid[cz * sim.map.w + cx] = 0;
    sim.step(input({ fire: true, pitch: aimPitchAt(vol.yCenter, far) }));
    expect(crawler.hp, 'wall must stop the bullet').toBe(crawler.maxHp);
  });

  it('spiker nail look-down at a close crawler connects in flight', () => {
    const { sim, crawler } = closeCrawler();
    sim.giveGun(4);
    for (let i = 0; i < 40; i++) {
      sim.step(input({ fire: i === 0, pitch: aimPitchAt(vol.yCenter, D) }));
    }
    expect(crawler.hp, 'nail through the close body must connect').toBeLessThan(crawler.maxHp);
  });
});
