// The deterministic, headless simulation. Pure TypeScript: no DOM, no renderer.
import { makeRng, type Rng } from './rng';
import {
  CELL, GEN_VERSION,
} from './types';
import type {
  AmmoType, Difficulty, EnemyType, GameMap, PickupDef, PlayerLoadout, SimEvent,
} from './types';
import { generateMap } from './mapgen';
import { DIFFICULTIES } from './difficulty';
import { WEAPONS, weapon } from './weapons';
import { ENEMIES, type EnemyDef } from './enemyTypes';
import {
  isSolidCell, circleFits, moveCircle, raycastWall, hasLineOfSight, findPath, roomAt,
} from './physics';

export const STEP_DT = 1 / 60;

export interface SimInput {
  moveX: number;      // strafe (-1 left .. 1 right)
  moveZ: number;      // forward (1 .. -1)
  yaw: number;
  pitch: number;
  fire: boolean;
  use: boolean;
  switchGun: number | null;
}

export function emptyInput(): SimInput {
  return { moveX: 0, moveZ: 0, yaw: 0, pitch: 0, fire: false, use: false, switchGun: null };
}

export interface DoorState {
  id: number;
  cx: number; cz: number;
  axis: 'x' | 'z';
  cells: [number, number][];
  locked: boolean;
  x: number; z: number;
  offset: number;     // 0 closed .. 1 open
  opening: boolean;
}

export interface EnemyEnt {
  id: number;
  type: EnemyType;
  def: EnemyDef;
  x: number; z: number;
  yaw: number;
  hp: number; maxHp: number;
  speed: number;
  accuracy: number;
  state: 'idle' | 'alert' | 'chase' | 'attack' | 'pain';
  timer: number;          // state timer (reaction / windup / pain)
  attackCd: number;
  burstLeft: number;
  burstTimer: number;
  path: { x: number; z: number }[] | null;
  pathIndex: number;
  pathTimer: number;
  noLosTime: number;
  awakened: boolean;
  dead: boolean;
  deathTime: number;
  animPhase: number;
  rng: Rng;
}

export interface ProjectileEnt {
  id: number;
  kind: string;
  fromPlayer: boolean;
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  gravity: number;
  radius: number;
  damage: number;
  splashRadius: number;
  damageSelfPct: number;
  age: number;
}

export interface PickupEnt extends PickupDef {
  taken: boolean;
}

export interface PlayerState {
  x: number; z: number;
  yaw: number; pitch: number;
  hp: number; maxHp: number;
  gun: number;
  owned: boolean[];
  ammo: Record<AmmoType, number>;
  fireCd: number;
  dryCd: number;
  bloom: number;
  useCd: number;
}

export type Phase = 'playing' | 'dying' | 'dead' | 'won';

export class Sim {
  map: GameMap;
  difficulty: Difficulty;
  time = 0;
  phase: Phase = 'playing';
  phaseTimer = 0;
  events: SimEvent[] = [];
  player: PlayerState;
  enemies: EnemyEnt[] = [];
  projectiles: ProjectileEnt[] = [];
  pickups: PickupEnt[] = [];
  doors: DoorState[] = [];
  sealIntact = true;
  hasKey = false;
  arenaEntered = false;
  arenaClearTimer = -1;
  killCount = 0;
  explored: Uint8Array;
  lastNoise: { x: number; z: number; radius: number; time: number } | null = null;
  rng: Rng;
  private nextProjId = 1;
  arenaRoomId: number;

  constructor(
    seed: string,
    difficulty: Difficulty,
    prebuilt?: GameMap,
    fromMapOpts?: { loadout?: PlayerLoadout; rngKey?: string },
  ) {
    this.difficulty = difficulty;
    const authored = !!prebuilt;
    this.map = prebuilt ?? generateMap(seed, difficulty);
    this.arenaRoomId = this.map.arenaRoomId;
    const diff = DIFFICULTIES[difficulty];
    const rngKey = fromMapOpts?.rngKey ?? this.map.seed ?? 'authored';
    this.rng = authored
      ? makeRng(`sim|${rngKey}|${difficulty}`)
      : makeRng(`sim|${seed}|${difficulty}|v${GEN_VERSION}`);
    this.explored = new Uint8Array(this.map.w * this.map.h);
    const loadout = fromMapOpts?.loadout;
    this.player = {
      x: this.map.playerStart.x, z: this.map.playerStart.z,
      yaw: this.map.playerStart.yaw, pitch: 0,
      hp: 100, maxHp: 100,
      gun: loadout?.gun ?? 1,
      owned: loadout?.owned?.slice() ?? [false, true, false, false, false, false, false, false],
      ammo: loadout?.ammo
        ? { ...loadout.ammo }
        : {
          bullets: WEAPONS[0].spawnAmmo, shells: 0, nails: 0,
          grenades: 0, cores: 0, void: 0,
        },
      fireCd: 0, dryCd: 0, bloom: 0, useCd: 0,
    };
    for (const d of this.map.doors) {
      this.doors.push({ ...d, offset: 0, opening: false });
    }
    for (const p of this.map.pickups) this.pickups.push({ ...p, taken: false });
    for (const e of this.map.enemies) {
      const def = ENEMIES[e.type];
      const eff: EnemyDef = {
        ...def,
        hp: Math.round(def.hp * diff.enemyHp),
        speed: def.speed * diff.enemySpeed,
        reaction: def.reaction * diff.enemyReaction,
      };
      this.enemies.push({
        id: e.id, type: e.type, def: eff,
        x: e.x, z: e.z, yaw: e.yaw,
        hp: eff.hp, maxHp: eff.hp,
        speed: eff.speed,
        accuracy: def.accuracy * diff.enemyAccuracy,
        state: 'idle', timer: 0, attackCd: 0, burstLeft: 0, burstTimer: 0,
        path: null, pathIndex: 0, pathTimer: 0, noLosTime: 0,
        awakened: false, dead: false, deathTime: 0, animPhase: 0,
        rng: makeRng(authored
          ? `enemy|${rngKey}|${e.id}`
          : `enemy|${seed}|${e.id}|v${GEN_VERSION}`),
      });
    }
  }

  static fromMap(
    map: GameMap,
    difficulty: Difficulty,
    opts?: { loadout?: PlayerLoadout; rngKey?: string },
  ): Sim {
    return new Sim(map.seed || 'authored', difficulty, map, opts);
  }

  takeEvents(): SimEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  message(text: string) {
    this.events.push({ t: 'message', text });
  }

  // ------------------------------------------------------------- stepping
  step(input: SimInput, dt: number = STEP_DT) {
    if (this.phase !== 'playing') {
      this.phaseTimer += dt;
      if (this.phase === 'dying' && this.phaseTimer >= 2.0 - 1e-9) this.phase = 'dead';
      return;
    }
    this.time += dt;
    const p = this.player;

    // gun switch
    if (input.switchGun !== null && input.switchGun >= 1 && input.switchGun <= 7) {
      if (p.owned[input.switchGun] && p.gun !== input.switchGun) p.gun = input.switchGun;
    }
    p.yaw = input.yaw;
    p.pitch = input.pitch;

    // movement, camera-relative
    const speed = 6.5;
    const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
    const rx = Math.cos(p.yaw), rz = -Math.sin(p.yaw);
    let dx = fx * input.moveZ + rx * input.moveX;
    let dz = fz * input.moveZ + rz * input.moveX;
    const len = Math.hypot(dx, dz);
    if (len > 1) { dx /= len; dz /= len; }
    const moved = moveCircle(this, p.x, p.z, dx * speed * dt, dz * speed * dt, 0.55);
    p.x = moved.x; p.z = moved.z;

    // cooldowns
    p.fireCd = Math.max(0, p.fireCd - dt);
    p.dryCd = Math.max(0, p.dryCd - dt);
    p.useCd = Math.max(0, p.useCd - dt);
    const w = weapon(p.gun);
    if (!input.fire) p.bloom = Math.max(0, p.bloom - dt * 0.9);

    // firing
    if (input.fire && p.fireCd <= 0) {
      if (p.ammo[w.ammo] <= 0) {
        if (p.dryCd <= 0) {
          this.events.push({ t: 'dryfire', gun: p.gun });
          p.dryCd = 0.45;
        }
        p.fireCd = 0.25;
      } else {
        this.fireWeapon();
      }
    }

    // use (doors)
    if (input.use && p.useCd <= 0) {
      p.useCd = 0.35;
      this.tryUse();
    }

    this.stepProjectiles(dt);
    this.stepEnemies(dt);
    this.stepDoors(dt);
    this.checkPickups();

    // exploration fog-of-war
    const pcx = Math.floor(p.x / CELL), pcz = Math.floor(p.z / CELL);
    for (let z = pcz - 5; z <= pcz + 5; z++) {
      for (let x = pcx - 5; x <= pcx + 5; x++) {
        if (x < 0 || z < 0 || x >= this.map.w || z >= this.map.h) continue;
        if ((x - pcx) * (x - pcx) + (z - pcz) * (z - pcz) <= 27) this.explored[z * this.map.w + x] = 1;
      }
    }

    // arena tracking
    if (!this.arenaEntered && roomAt(this.map, p.x, p.z) === this.arenaRoomId && !this.sealIntact) {
      this.arenaEntered = true;
      this.arenaClearTimer = -1;
      this.events.push({ t: 'arenaEnter' });
    }
    if (this.arenaEntered) {
      const arenaAlive = this.enemies.some(e => !e.dead && this.enemyRoomId(e) === this.arenaRoomId);
      if (!arenaAlive) {
        if (this.arenaClearTimer < 0) this.arenaClearTimer = 1.2;
        this.arenaClearTimer -= dt;
        if (this.arenaClearTimer <= 0 && this.phase === 'playing') {
          this.phase = 'won';
          this.events.push({ t: 'won' });
        }
      } else {
        this.arenaClearTimer = -1;
      }
    }

    if (p.hp <= 0 && this.phase === 'playing') {
      this.phase = 'dying';
      this.phaseTimer = 0;
      this.events.push({ t: 'playerDie' });
    }
  }

  enemyRoomId(e: EnemyEnt): number {
    return roomAt(this.map, e.x, e.z);
  }

  arenaEnemiesRemaining(): number {
    return this.enemies.filter(e => !e.dead && this.enemyRoomId(e) === this.arenaRoomId).length;
  }

  // ------------------------------------------------------------- weapons
  fireWeapon() {
    const p = this.player;
    const w = weapon(p.gun);
    const diff = DIFFICULTIES[this.difficulty];
    p.ammo[w.ammo] -= 1;
    p.fireCd = w.fireInterval;
    this.lastNoise = { x: p.x, z: p.z, radius: w.loudness, time: this.time };
    this.events.push({ t: 'shot', gun: p.gun, x: p.x, z: p.z, yaw: p.yaw });

    const dirX = -Math.sin(p.yaw) * Math.cos(p.pitch);
    const dirY = Math.sin(p.pitch);
    const dirZ = -Math.cos(p.yaw) * Math.cos(p.pitch);
    const eye = 1.7;

    if (w.hitscan) {
      for (let pellet = 0; pellet < w.pellets; pellet++) {
        let sx = dirX, sy = dirY, sz = dirZ;
        const spread = w.spread + (w.id === 3 ? p.bloom : 0);
        if (spread > 0) {
          const a = this.rng.float() * Math.PI * 2;
          const r = Math.sqrt(this.rng.float()) * spread;
          // perturb in the plane perpendicular to view dir
          const upX = 0, upY = 1, upZ = 0;
          const rightX = dirZ * upY - dirY * upZ;
          const rightZ = dirX * upY - dirY * upX;
          const rl = Math.hypot(rightX, rightZ) || 1;
          const rxn = rightX / rl, rzn = rightZ / rl;
          const ca = Math.cos(a) * r, sa = Math.sin(a) * r;
          sx = dirX + rxn * ca + 0 * sa;
          sy = dirY + sa;
          sz = dirZ + rzn * ca;
          const sl = Math.hypot(sx, sy, sz);
          sx /= sl; sy /= sl; sz /= sl;
        }
        this.hitscanShot(p.x, eye, p.z, sx, sy, sz, w.damage * diff.playerDamageOut, w.pierce, w, pellet === 0);
      }
      if (w.id === 3) p.bloom = Math.min(w.bloomMax, p.bloom + (w.bloomMax / w.bloomTime) * w.fireInterval);
    } else {
      const proj = w.projectile!;
      const spread = w.spread;
      let sx = dirX, sy = dirY, sz = dirZ;
      if (spread > 0) {
        const a = this.rng.float() * Math.PI * 2;
        const r = Math.sqrt(this.rng.float()) * spread;
        const rightX = dirZ, rightZ = -dirX;
        sx = dirX + rightX * Math.cos(a) * r;
        sy = dirY + Math.sin(a) * r;
        sz = dirZ + rightZ * Math.cos(a) * r;
        const sl = Math.hypot(sx, sy, sz);
        sx /= sl; sy /= sl; sz /= sl;
      }
      this.projectiles.push({
        id: this.nextProjId++,
        kind: proj.kind,
        fromPlayer: true,
        x: p.x + sx * 0.6, y: eye - 0.25 + sy * 0.6, z: p.z + sz * 0.6,
        vx: sx * proj.speed, vy: sy * proj.speed, vz: sz * proj.speed,
        gravity: proj.gravity,
        radius: proj.radius,
        damage: w.damage * diff.playerDamageOut,
        splashRadius: w.splash?.radius ?? 0,
        damageSelfPct: w.splash?.damageSelfPct ?? 0,
        age: 0,
      });
      this.events.push({ t: 'spawnProjectile', kind: proj.kind, x: p.x, y: eye, z: p.z });
    }
  }

  hitscanShot(
    ox: number, oy: number, oz: number,
    dirX: number, dirY: number, dirZ: number,
    damage: number, pierce: boolean, w: (typeof WEAPONS)[number], visual: boolean,
  ) {
    const wall = raycastWall(this, ox, oz, dirX, dirZ, 120);
    const maxD = Math.min(wall.dist, 120);
    // gather enemy hits along the ray
    const hits: { e: EnemyEnt; t: number }[] = [];
    for (const e of this.enemies) {
      if (e.dead) continue;
      const relX = e.x - ox, relZ = e.z - oz;
      const t = relX * dirX + relZ * dirZ;
      if (t < 0 || t > maxD + 1) continue;
      const cx = ox + dirX * t, cz = oz + dirZ * t;
      const d2 = (e.x - cx) * (e.x - cx) + (e.z - cz) * (e.z - cz);
      const r = e.def.radius + 0.12;
      if (d2 > r * r) continue;
      const yAt = oy + dirY * t;
      const base = e.def.flying ? e.def.hoverY : 0;
      if (yAt < base + 0.1 || yAt > base + e.def.height + 0.15) continue;
      hits.push({ e, t });
    }
    hits.sort((a, b) => a.t - b.t);
    const dmgAt = (t: number) => {
      if (t <= w.falloffStart) return damage;
      if (t >= w.falloffEnd) return damage * w.falloffMin;
      const f = (t - w.falloffStart) / (w.falloffEnd - w.falloffStart);
      return damage * (1 - f * (1 - w.falloffMin));
    };
    let hitAny = false;
    for (const h of hits) {
      this.damageEnemy(h.e, dmgAt(h.t), h.t);
      hitAny = true;
      if (!pierce) break;
    }
    if (visual) {
      const endT = pierce ? maxD : (hitAny && hits.length ? hits[0].t : maxD);
      if (w.id === 6) {
        this.events.push({ t: 'beam', x0: ox, z0: oz, x1: ox + dirX * endT, z1: oz + dirZ * endT });
      } else {
        this.events.push({ t: 'tracer', x0: ox, z0: oz, x1: ox + dirX * endT, z1: oz + dirZ * endT, kind: 'bullets' });
      }
    }
  }

  damageEnemy(e: EnemyEnt, damage: number, _t: number) {
    if (e.dead) return;
    e.hp -= damage;
    this.events.push({
      t: 'hitEnemy', x: e.x, y: (e.def.flying ? e.def.hoverY : 0) + e.def.height * 0.6, z: e.z,
      killed: e.hp <= 0, type: e.type,
    });
    if (e.hp <= 0) {
      e.dead = true;
      e.deathTime = this.time;
      e.state = 'idle';
      this.killCount++;
      this.events.push({ t: 'enemyDeath', type: e.type, id: e.id, x: e.x, z: e.z });
      return;
    }
    // waking up to pain
    if (!e.awakened) this.wake(e);
    if (e.rng.chance(e.def.painChance)) {
      e.state = 'pain';
      e.timer = e.def.painTime;
      e.burstLeft = 0;
      this.events.push({ t: 'enemyPain', type: e.type, id: e.id, x: e.x, z: e.z });
    }
  }

  // ------------------------------------------------------------- projectiles
  stepProjectiles(dt: number) {
    const keep: ProjectileEnt[] = [];
    for (const p of this.projectiles) {
      p.age += dt;
      if (p.age > 8) continue;
      p.vy -= p.gravity * dt;
      const nx = p.x + p.vx * dt;
      const ny = p.y + p.vy * dt;
      const nz = p.z + p.vz * dt;
      let impacted = false;

      if (isSolidCell(this, Math.floor(nx / CELL), Math.floor(nz / CELL))) impacted = true;
      if (!impacted && ny <= p.radius && p.gravity > 0) impacted = true; // ground

      if (!impacted) {
        if (p.fromPlayer) {
          for (const e of this.enemies) {
            if (e.dead) continue;
            const dx = e.x - nx, dz = e.z - nz;
            const rr = e.def.radius + p.radius;
            const base = e.def.flying ? e.def.hoverY : 0;
            if (dx * dx + dz * dz < rr * rr && ny > base + 0.1 && ny < base + e.def.height + p.radius) {
              impacted = true;
              if (p.splashRadius <= 0) this.damageEnemy(e, p.damage, 0);
              break;
            }
          }
        } else {
          const dx = this.player.x - nx, dz = this.player.z - nz;
          const rr = 0.55 + p.radius;
          if (dx * dx + dz * dz < rr * rr && ny > 0.2 && ny < 1.9) {
            impacted = true;
            if (p.splashRadius <= 0) this.damagePlayer(p.damage, p.x, p.z);
          }
        }
      }

      if (impacted) {
        this.impactProjectile(p);
      } else {
        p.x = nx; p.y = ny; p.z = nz;
        keep.push(p);
      }
    }
    this.projectiles = keep;
  }

  impactProjectile(p: ProjectileEnt) {
    if (p.splashRadius > 0) {
      this.events.push({ t: 'explosion', x: p.x, y: p.y, z: p.z, radius: p.splashRadius });
      if (p.fromPlayer) {
        for (const e of this.enemies) {
          if (e.dead) continue;
          const d = Math.hypot(e.x - p.x, e.z - p.z);
          if (d < p.splashRadius + e.def.radius) {
            const f = 1 - Math.max(0, d - e.def.radius) / p.splashRadius;
            this.damageEnemy(e, p.damage * Math.max(0.25, f), 0);
          }
        }
        const pd = Math.hypot(this.player.x - p.x, this.player.z - p.z);
        if (pd < p.splashRadius * 0.8) {
          const f = 1 - pd / (p.splashRadius * 0.8);
          this.damagePlayer(p.damage * p.damageSelfPct * f, p.x, p.z);
        }
      } else {
        const pd = Math.hypot(this.player.x - p.x, this.player.z - p.z);
        if (pd < p.splashRadius) {
          this.damagePlayer(p.damage * (1 - pd / p.splashRadius / 2), p.x, p.z);
        }
      }
    }
  }

  damagePlayer(damage: number, fromX: number, fromZ: number) {
    if (this.phase !== 'playing') return;
    const p = this.player;
    const dmg = Math.max(1, damage);
    p.hp -= dmg;
    const ang = Math.atan2(fromX - p.x, fromZ - p.z);
    let rel = ang - (p.yaw + Math.PI);
    while (rel > Math.PI) rel -= Math.PI * 2;
    while (rel < -Math.PI) rel += Math.PI * 2;
    this.events.push({ t: 'playerHurt', damage: dmg, fromAngle: rel });
    if (p.hp <= 0) {
      this.phase = 'dying';
      this.phaseTimer = 0;
      this.events.push({ t: 'playerDie' });
    }
  }

  // ------------------------------------------------------------- enemies
  wake(e: EnemyEnt) {
    if (e.awakened || e.dead) return;
    e.awakened = true;
    e.state = 'alert';
    e.timer = e.def.reaction;
    this.events.push({ t: 'enemyAlert', type: e.type, id: e.id, x: e.x, z: e.z });
  }

  canSeePlayer(e: EnemyEnt): boolean {
    const p = this.player;
    const dx = p.x - e.x, dz = p.z - e.z;
    const d = Math.hypot(dx, dz);
    if (d > e.def.sightRange) return false;
    const ang = Math.atan2(dx, dz);
    let diff = ang - e.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    if (Math.abs(diff) > e.def.sightFov) return false;
    return hasLineOfSight(this, e.x, e.z, p.x, p.z);
  }

  stepEnemies(dt: number) {
    const p = this.player;
    const stagger = this.enemies;
    for (const e of stagger) {
      if (e.dead) continue;
      e.attackCd = Math.max(0, e.attackCd - dt);
      e.animPhase += dt;

      const dx = p.x - e.x, dz = p.z - e.z;
      const dist = Math.hypot(dx, dz);

      switch (e.state) {
        case 'idle': {
          if (dist < e.def.wakeRadius) { this.wake(e); break; }
          if (this.canSeePlayer(e)) { this.wake(e); break; }
          if (this.lastNoise && this.time - this.lastNoise.time < 0.2) {
            const nd = Math.hypot(this.lastNoise.x - e.x, this.lastNoise.z - e.z);
            if (nd < this.lastNoise.radius + e.def.hearRange * 0.3) this.wake(e);
          }
          break;
        }
        case 'alert': {
          e.timer -= dt;
          if (dist < e.def.wakeRadius * 0.8) e.timer = Math.min(e.timer, 0.1);
          if (e.timer <= 0) e.state = 'chase';
          break;
        }
        case 'chase': {
          const sees = this.canSeePlayer(e);
          if (sees) e.noLosTime = 0; else e.noLosTime += dt;
          if (e.noLosTime > 12 && dist > e.def.sightRange * 1.2) {
            e.state = 'idle';
            e.awakened = false;
            e.noLosTime = 0;
            break;
          }
          if (sees && dist < e.def.attackRange && e.attackCd <= 0) {
            e.state = 'attack';
            e.timer = e.def.windup;
            e.burstLeft = e.def.burst;
            e.burstTimer = 0;
            break;
          }
          // movement along path
          e.pathTimer -= dt;
          if (e.pathTimer <= 0 || !e.path || e.pathIndex >= e.path.length) {
            e.pathTimer = 0.55 + e.rng.float() * 0.3;
            e.path = findPath(this, e.x, e.z, p.x, p.z);
            e.pathIndex = 0;
          }
          let tx = p.x, tz = p.z;
          if (!sees && e.path && e.path.length) {
            tx = e.path[Math.min(e.pathIndex, e.path.length - 1)].x;
            tz = e.path[Math.min(e.pathIndex, e.path.length - 1)].z;
          }
          const mdx = tx - e.x, mdz = tz - e.z;
          const md = Math.hypot(mdx, mdz);
          if (md > 0.05) {
            const sp = e.speed * dt;
            const mv = moveCircle(this, e.x, e.z, (mdx / md) * sp, (mdz / md) * sp, e.def.radius);
            e.x = mv.x; e.z = mv.z;
            if (sees) e.yaw = Math.atan2(dx, dz);
            else e.yaw = Math.atan2(mdx, mdz);
          }
          if (e.path && e.path.length) {
            const wp = e.path[Math.min(e.pathIndex, e.path.length - 1)];
            if (Math.hypot(wp.x - e.x, wp.z - e.z) < 1.2) e.pathIndex++;
          }
          break;
        }
        case 'attack': {
          const sees = this.canSeePlayer(e) || dist < 3;
          if (sees) e.yaw = Math.atan2(dx, dz);
          e.timer -= dt;
          if (e.timer <= 0) {
        if (e.burstLeft > 0) {
          this.enemyShoot(e);
          e.burstLeft--;
          e.timer = e.def.burstGap;
              if (e.burstLeft === 0) {
                e.state = 'chase';
                e.attackCd = e.def.attackInterval;
              }
            } else {
              e.state = 'chase';
              e.attackCd = e.def.attackInterval;
            }
          }
          break;
        }
        case 'pain': {
          e.timer -= dt;
          if (e.timer <= 0) e.state = 'chase';
          break;
        }
      }
    }
    // separation (alive, non-flying vs non-flying)
    for (let i = 0; i < this.enemies.length; i++) {
      const a = this.enemies[i];
      if (a.dead) continue;
      for (let j = i + 1; j < this.enemies.length; j++) {
        const b = this.enemies[j];
        if (b.dead) continue;
        const dx = b.x - a.x, dz = b.z - a.z;
        const rr = a.def.radius + b.def.radius;
        const d2 = dx * dx + dz * dz;
        if (d2 > 0.0001 && d2 < rr * rr) {
          const d = Math.sqrt(d2);
          const push = (rr - d) * 0.5;
          const ux = dx / d, uz = dz / d;
          const ma = moveCircle(this, a.x, a.z, -ux * push, -uz * push, a.def.radius);
          a.x = ma.x; a.z = ma.z;
          const mb = moveCircle(this, b.x, b.z, ux * push, uz * push, b.def.radius);
          b.x = mb.x; b.z = mb.z;
        }
      }
    }
  }

  enemyShoot(e: EnemyEnt) {
    const p = this.player;
    const def = e.def;
    const shotY = def.flying ? def.hoverY + 0.4 : def.height * 0.72;
    const dx = p.x - e.x, dz = p.z - e.z;
    const dist = Math.hypot(dx, dz);
    // aim at chest with slight lead
    const speed = def.projSpeed;
    const lead = Math.min(0.6, dist / speed) * 0.5;
    const tx = p.x, tz = p.z; // lead skipped: dodgeable straight shots are fairer
    void lead;
    const errScale = Math.max(0.55, Math.min(2.2, dist / 16)) * e.accuracy;
    const errAng = (e.rng.float() * 2 - 1) * errScale;
    const baseAng = Math.atan2(tx - e.x, tz - e.z) + errAng;
    const dy = (1.35 - shotY) / Math.max(1, dist);
    const dirX = Math.sin(baseAng);
    const dirZ = Math.cos(baseAng);
    const hl = Math.hypot(1, dy);
    this.projectiles.push({
      id: this.nextProjId++,
      kind: def.projectile,
      fromPlayer: false,
      x: e.x + dirX * (def.radius + 0.3), y: shotY, z: e.z + dirZ * (def.radius + 0.3),
      vx: dirX * speed / hl, vy: dy * speed / hl, vz: dirZ * speed / hl,
      gravity: def.projGravity,
      radius: def.projRadius,
      damage: def.damage * DIFFICULTIES[this.difficulty].enemyDamage,
      splashRadius: def.splashRadius,
      damageSelfPct: 0,
      age: 0,
    });
    this.events.push({ t: 'enemyShoot', type: e.type, x: e.x, y: shotY, z: e.z });
  }

  // ------------------------------------------------------------- doors & pickups
  stepDoors(dt: number) {
    for (const d of this.doors) {
      if (d.opening && d.offset < 1) d.offset = Math.min(1, d.offset + dt * 1.4);
    }
  }

  tryUse() {
    const p = this.player;
    for (const d of this.doors) {
      const dist = Math.hypot(d.x - p.x, d.z - p.z);
      if (dist < 3.2 && d.offset < 1) {
        if (d.locked && !this.hasKey) {
          this.events.push({ t: 'doorDenied' });
          this.message('LOCKED — the key is somewhere before this door.');
          return;
        }
        d.opening = true;
        this.events.push({ t: 'doorOpen', id: d.id });
        if (d.locked) this.message('The key dissolves in the lock.');
        return;
      }
    }
  }

  checkPickups() {
    const p = this.player;
    const diff = DIFFICULTIES[this.difficulty];
    for (const it of this.pickups) {
      if (it.taken) continue;
      if (Math.hypot(it.x - p.x, it.z - p.z) > 1.1) continue;
      switch (it.kind) {
        case 'medikit': {
          if (p.hp >= p.maxHp) continue;
          p.hp = Math.min(p.maxHp, p.hp + diff.medikitHeal);
          it.taken = true;
          this.events.push({ t: 'pickup', kind: 'medikit', label: `+${diff.medikitHeal} HEALTH` });
          break;
        }
        case 'ammo': {
          const t = it.ammoType!;
          const w = WEAPONS.find(g => g.ammo === t)!;
          const before = p.ammo[t];
          p.ammo[t] = Math.min(w.maxAmmo, p.ammo[t] + (it.amount ?? w.boxAmmo));
          it.taken = true;
          this.events.push({ t: 'pickup', kind: 'ammo', label: `+${p.ammo[t] - before} ${t.toUpperCase()}` });
          break;
        }
        case 'gun': {
          const g = it.gun!;
          const w = weapon(g);
          const isNew = !p.owned[g];
          p.owned[g] = true;
          p.ammo[w.ammo] = Math.min(w.maxAmmo, p.ammo[w.ammo] + w.spawnAmmo);
          it.taken = true;
          if (isNew) {
            p.gun = g;
            this.events.push({ t: 'pickup', kind: 'gun', label: w.name.toUpperCase() });
            const sb = this.map.sealBreak;
            if (this.sealIntact && sb?.type === 'gun' && sb.gun === g) {
              this.breakSeal();
            }
          } else {
            this.events.push({ t: 'pickup', kind: 'ammo', label: `+${w.spawnAmmo} ${w.ammo.toUpperCase()}` });
          }
          break;
        }
        case 'key': {
          this.hasKey = true;
          it.taken = true;
          this.events.push({ t: 'pickup', kind: 'key', label: 'BONE KEY' });
          this.message('You took the Bone Key.');
          if (this.sealIntact && this.map.sealBreak?.type === 'key') {
            this.breakSeal();
          }
          break;
        }
      }
    }
  }

  private breakSeal() {
    this.sealIntact = false;
    this.events.push({ t: 'sealBreak' });
    const custom = this.map.sealBreakMessage;
    if (custom) {
      this.message(custom);
      return;
    }
    const sb = this.map.sealBreak;
    if (sb?.type === 'gun' && sb.gun === 7) {
      this.message('THE SEVENTH SPEAKS — the arena seal shatters.');
    } else if (sb?.type === 'key') {
      this.message('THE WARD BREAKS — the arena seal shatters.');
    } else {
      this.message('The arena seal shatters.');
    }
  }

  // ------------------------------------------------------------- debug/test helpers
  giveGun(g: number) {
    const p = this.player;
    const w = weapon(g);
    p.owned[g] = true;
    p.ammo[w.ammo] = Math.min(w.maxAmmo, p.ammo[w.ammo] + w.spawnAmmo);
    p.gun = g;
  }

  snapshot(): string {
    const p = this.player;
    const data = {
      t: Math.round(this.time * 1000),
      phase: this.phase,
      hp: p.hp, x: Math.round(p.x * 100), z: Math.round(p.z * 100),
      gun: p.gun,
      ammo: p.ammo,
      seal: this.sealIntact,
      key: this.hasKey,
      kills: this.killCount,
      doors: this.doors.map(d => Math.round(d.offset * 100)),
      taken: this.pickups.map(pk => (pk.taken ? 1 : 0)).join(''),
      enemies: this.enemies.map(e => `${e.state}:${Math.round(e.hp)}:${Math.round(e.x * 10)}:${Math.round(e.z * 10)}`).join(','),
      proj: this.projectiles.length,
      rng: this.rng.state(),
    };
    return JSON.stringify(data);
  }
}
