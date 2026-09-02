// The deterministic, headless simulation. Pure TypeScript: no DOM, no renderer.
import { makeRng, type Rng } from './rng';
import {
  CELL, GEN_VERSION, NOISE_TTL, PLAYER_EYE, PLAYER_HEIGHT, PLAYER_RADIUS,
  SECRET_PLATE_TIME, cellToWorld,
} from './types';
import type {
  AmmoType, Difficulty, EnemyType, GameMap, PickupDef, PlayerLoadout, SecretKind, SimEvent,
} from './types';
import { generateMap } from './mapgen';
import { DIFFICULTIES } from './difficulty';
import { WEAPONS, weapon } from './weapons';
import {
  DEATH_NOISE_RADIUS, ENEMIES, enemyGunRadius, enemyGunVolumeY, enemyVolumeY,
  noiseHearRadius, type EnemyDef,
} from './enemyTypes';
import {
  isSolidCell, moveCircle, pushCircleOut, raycastCylinder, raycastWall, hasLineOfSight, findPath, roomAt,
} from './physics';
import { aimDirFromLook } from './aim';
import {
  applyPowerup, createPowerupState, outgoingMul, stepPowerups, wardActive,
  POWERUP_DEFS, type PowerupState,
} from './powerups';

export const STEP_DT = 1 / 60;

export interface SimInput {
  moveX: number;      // strafe (-1 left .. 1 right)
  moveZ: number;      // forward (1 .. -1)
  yaw: number;
  pitch: number;
  fire: boolean;
  use: boolean;
  switchGun: number | null;
  /** Optional explicit ray. Default is aimDirFromLook(yaw, pitch). */
  aimDir?: { dirX: number; dirY: number; dirZ: number };
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

export interface SecretState {
  id: number;
  name: string;
  kind: SecretKind;
  cx: number; cz: number;
  axis: 'x' | 'z';
  cells: [number, number][];
  x: number; z: number;
  roomId: number;
  trigger?: { x: number; z: number; wx: number; wz: number };
  hp: number;
  hpLeft: number;
  offset: number;
  opening: boolean;
  found: boolean;
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
  secrets: SecretState[] = [];
  secretCell: Uint8Array;
  private secretOwner: Int16Array;
  powerups: PowerupState;
  sealIntact = true;
  hasKey = false;
  arenaEntered = false;
  arenaClearTimer = -1;
  killCount = 0;
  lastAimDir: {
    dirX: number; dirY: number; dirZ: number;
    yaw: number; pitch: number;
    at32y: number;
    toCrawler: { dx: number; dy: number; dz: number; dist: number } | null;
  } | null = null;
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
    this.secretCell = new Uint8Array(this.map.w * this.map.h);
    this.secretOwner = new Int16Array(this.map.w * this.map.h).fill(-1);
    this.powerups = createPowerupState();
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
    for (const s of this.map.secrets ?? []) {
      this.secrets.push({
        id: s.id,
        name: s.name ?? '',
        kind: s.kind,
        cx: s.cx, cz: s.cz, axis: s.axis, cells: s.cells,
        x: s.x, z: s.z, roomId: s.roomId,
        trigger: s.trigger
          ? { x: s.trigger.x, z: s.trigger.z, wx: cellToWorld(s.trigger.x), wz: cellToWorld(s.trigger.z) }
          : undefined,
        hp: s.hp, hpLeft: s.hp,
        offset: 0, opening: false, found: false,
      });
    }
    this.buildSecretMask();
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
    const moved = moveCircle(this, p.x, p.z, dx * speed * dt, dz * speed * dt, PLAYER_RADIUS);
    p.x = moved.x; p.z = moved.z;
    this.separatePlayerFromEnemies();

    // cooldowns
    p.fireCd = Math.max(0, p.fireCd - dt);
    p.dryCd = Math.max(0, p.dryCd - dt);
    p.useCd = Math.max(0, p.useCd - dt);
    if (!input.fire) p.bloom = Math.max(0, p.bloom - dt * 0.9);

    // firing
    if (input.fire) this.tryFire(input.aimDir);

    // use (doors)
    if (input.use && p.useCd <= 0) {
      p.useCd = 0.35;
      this.tryUse();
    }

    this.stepProjectiles(dt);
    this.stepEnemies(dt);
    this.stepDoors(dt);
    this.stepSecrets(dt);
    this.stepPowerupTracks(dt);
    this.checkPickups();

    // exploration fog-of-war — never mark undiscovered secret cells
    const pcx = Math.floor(p.x / CELL), pcz = Math.floor(p.z / CELL);
    const w = this.map.w, h = this.map.h;
    for (let z = pcz - 5; z <= pcz + 5; z++) {
      for (let x = pcx - 5; x <= pcx + 5; x++) {
        if (x < 0 || z < 0 || x >= w || z >= h) continue;
        if ((x - pcx) * (x - pcx) + (z - pcz) * (z - pcz) > 27) continue;
        const i = z * w + x;
        const owner = this.secretOwner[i];
        if (owner >= 0 && !this.secrets[owner].found) continue;
        this.explored[i] = 1;
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
  /**
   * Fire with the current player yaw/pitch (same basis as the camera).
   * No movement or AI — used by the posed debug click path so a freeze
   * screenshot can still register a hit.
   */
  tryFire(aim?: { dirX: number; dirY: number; dirZ: number }) {
    if (this.phase !== 'playing') return;
    const p = this.player;
    if (p.fireCd > 0) return;
    const w = weapon(p.gun);
    if (p.ammo[w.ammo] <= 0) {
      if (p.dryCd <= 0) {
        this.events.push({ t: 'dryfire', gun: p.gun });
        p.dryCd = 0.45;
      }
      p.fireCd = 0.25;
      return;
    }
    this.fireWeapon(aim);
  }

  fireWeapon(aim?: { dirX: number; dirY: number; dirZ: number }) {
    const p = this.player;
    const w = weapon(p.gun);
    const diff = DIFFICULTIES[this.difficulty];
    p.ammo[w.ammo] -= 1;
    p.fireCd = w.fireInterval;
    this.emitNoise(p.x, p.z, w.loudness);
    this.events.push({ t: 'shot', gun: p.gun, x: p.x, z: p.z, yaw: p.yaw });

    // Compose from yaw/pitch (positive pitch = look-down). Do not use a
    // raw Three.js getWorldDirection — default XYZ vs YXZ and +X=look-up
    // sent live shots over the crawler (pitch +0.384, dirY > 0, y@3.2≈2.9).
    const composed = aimDirFromLook(p.yaw, p.pitch);
    const dirX = aim ? aim.dirX : composed.dirX;
    const dirY = aim ? aim.dirY : composed.dirY;
    const dirZ = aim ? aim.dirZ : composed.dirZ;
    const eye = PLAYER_EYE;
    const crawler = this.enemies.find(e => !e.dead && e.type === 'crawler');
    this.lastAimDir = {
      dirX, dirY, dirZ, yaw: p.yaw, pitch: p.pitch,
      at32y: eye + dirY * 3.2,
      toCrawler: crawler
        ? {
          dx: crawler.x - p.x,
          dy: 0.5 - eye,
          dz: crawler.z - p.z,
          dist: Math.hypot(crawler.x - p.x, crawler.z - p.z),
        }
        : null,
    };

    if (w.hitscan) {
      for (let pellet = 0; pellet < w.pellets; pellet++) {
        let sx = dirX, sy = dirY, sz = dirZ;
        const spread = w.spread + (w.id === 3 ? p.bloom : 0);
        if (spread > 0) {
          const a = this.rng.float() * Math.PI * 2;
          const r = Math.sqrt(this.rng.float()) * spread;
          // same perpendicular basis as projectiles: right = (dirZ, -dirX)
          const rightX = dirZ, rightZ = -dirX;
          const rl = Math.hypot(rightX, rightZ) || 1;
          const rxn = rightX / rl, rzn = rightZ / rl;
          const ca = Math.cos(a) * r, sa = Math.sin(a) * r;
          sx = dirX + rxn * ca;
          sy = dirY + sa;
          sz = dirZ + rzn * ca;
          const sl = Math.hypot(sx, sy, sz);
          sx /= sl; sy /= sl; sz /= sl;
        }
        this.hitscanShot(p.x, eye, p.z, sx, sy, sz, w.damage * diff.playerDamageOut * outgoingMul(this.powerups), w.pierce, w, pellet === 0);
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
        damage: w.damage * diff.playerDamageOut * outgoingMul(this.powerups),
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
    // Floor does not occlude enemy tests. Grounded bodies sit on y=0; a
    // steep look-down at the wall–floor junction (live playtest) intersects
    // the floor plane in front of the disc and used to eat the shot.
    // Tracer / miss visual still stops at the floor so the streak does not
    // continue underground.
    let tracerD = maxD;
    if (dirY < -1e-8) {
      const tFloor = (0 - oy) / dirY;
      if (tFloor > 0) tracerD = Math.min(tracerD, tFloor);
    }
    // gather enemy hits along the ray (3D cylinder vs visible gun volume)
    const hits: { e: EnemyEnt; t: number }[] = [];
    for (const e of this.enemies) {
      if (e.dead) continue;
      const distXZ = Math.hypot(e.x - ox, e.z - oz);
      const vol = enemyGunVolumeY(e.def, distXZ);
      const t = raycastCylinder(
        ox, oy, oz, dirX, dirY, dirZ,
        e.x, e.z, enemyGunRadius(e.def),
        vol.yMin, vol.yMax, maxD + 0.45,
      );
      if (t === null) continue;
      hits.push({ e, t });
    }
    hits.sort((a, b) => a.t - b.t);
    if (wall.cell && (!hits.length || wall.dist <= hits[0].t + 0.05)) {
      this.trySecretShot(wall.cell[0], wall.cell[1], damage);
    }
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
      const endT = pierce ? tracerD : (hitAny && hits.length ? hits[0].t : tracerD);
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
    const vol = enemyVolumeY(e.def);
    this.events.push({
      t: 'hitEnemy', x: e.x, y: vol.yCenter, z: e.z,
      killed: e.hp <= 0, type: e.type,
    });
    if (e.hp <= 0) {
      e.dead = true;
      e.deathTime = this.time;
      e.state = 'idle';
      this.killCount++;
      this.emitNoise(e.x, e.z, DEATH_NOISE_RADIUS);
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
          const span = Math.hypot(nx - p.x, ny - p.y, nz - p.z);
          const inv = span > 1e-12 ? 1 / span : 0;
          const pdx = (nx - p.x) * inv, pdy = (ny - p.y) * inv, pdz = (nz - p.z) * inv;
          let bestT = span;
          let best: EnemyEnt | null = null;
          for (const e of this.enemies) {
            if (e.dead) continue;
            const distXZ = Math.hypot(e.x - p.x, e.z - p.z);
            const vol = enemyGunVolumeY(e.def, distXZ);
            const rr = enemyGunRadius(e.def) + p.radius;
            const y0 = vol.yMin - p.radius, y1 = vol.yMax + p.radius;
            let t: number | null;
            if (span < 1e-12) {
              const dx = e.x - nx, dz = e.z - nz;
              t = (dx * dx + dz * dz < rr * rr && ny >= y0 && ny <= y1) ? 0 : null;
            } else {
              t = raycastCylinder(p.x, p.y, p.z, pdx, pdy, pdz, e.x, e.z, rr, y0, y1, span);
            }
            if (t !== null && t <= bestT) { bestT = t; best = e; }
          }
          if (best) {
            if (span >= 1e-12) {
              p.x += pdx * bestT;
              p.y += pdy * bestT;
              p.z += pdz * bestT;
            }
            impacted = true;
            if (p.splashRadius <= 0) this.damageEnemy(best, p.damage, 0);
          }
        } else {
          const dx = this.player.x - nx, dz = this.player.z - nz;
          const rr = PLAYER_RADIUS + p.radius;
          if (dx * dx + dz * dz < rr * rr && ny > 0.2 && ny < PLAYER_HEIGHT) {
            impacted = true;
            if (p.splashRadius <= 0) this.damagePlayer(p.damage, p.x, p.z);
          }
        }
      }

      if (impacted) {
        if (p.fromPlayer) {
          this.trySecretShot(Math.floor(nx / CELL), Math.floor(nz / CELL), p.damage);
        }
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
    const ang = Math.atan2(fromX - p.x, fromZ - p.z);
    let rel = ang - (p.yaw + Math.PI);
    while (rel > Math.PI) rel -= Math.PI * 2;
    while (rel < -Math.PI) rel += Math.PI * 2;
    if (wardActive(this.powerups)) {
      this.events.push({ t: 'playerShielded', fromAngle: rel });
      return;
    }
    const dmg = Math.max(1, damage);
    p.hp -= dmg;
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

  emitNoise(x: number, z: number, radius: number) {
    this.lastNoise = { x, z, radius, time: this.time };
  }

  hearsNoise(e: EnemyEnt): boolean {
    const n = this.lastNoise;
    if (!n || e.dead) return false;
    if (this.time - n.time > NOISE_TTL) return false;
    const nd = Math.hypot(n.x - e.x, n.z - e.z);
    return nd < noiseHearRadius(n.radius, e.def.hearRange);
  }

  /** Living grounded enemies always block. Flying wisps block in XZ when their volume overlaps the player capsule. Ragdolls do not. */
  enemySolidVsPlayer(e: EnemyEnt): boolean {
    if (e.dead) return false;
    if (!e.def.flying) return true;
    const vol = enemyVolumeY(e.def);
    return vol.yMin < PLAYER_HEIGHT && vol.yMax > 0.05;
  }

  separatePlayerFromEnemies() {
    const p = this.player;
    for (let pass = 0; pass < 2; pass++) {
      for (const e of this.enemies) {
        if (!this.enemySolidVsPlayer(e)) continue;
        const out = pushCircleOut(this, p.x, p.z, PLAYER_RADIUS, e.x, e.z, e.def.radius);
        p.x = out.x; p.z = out.z;
      }
    }
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
          if (this.hearsNoise(e)) this.wake(e);
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
    // living enemies must not stack inside the player
    for (const e of this.enemies) {
      if (!this.enemySolidVsPlayer(e)) continue;
      const dx = e.x - p.x, dz = e.z - p.z;
      const rr = e.def.radius + PLAYER_RADIUS;
      const d2 = dx * dx + dz * dz;
      if (d2 >= rr * rr || d2 < 1e-8) continue;
      const d = Math.sqrt(d2);
      const push = (rr - d) * 0.65;
      const mv = moveCircle(this, e.x, e.z, (dx / d) * push, (dz / d) * push, e.def.radius);
      e.x = mv.x; e.z = mv.z;
    }
    this.separatePlayerFromEnemies();
  }

  enemyShoot(e: EnemyEnt) {
    const p = this.player;
    const def = e.def;
    const shotY = def.flying ? enemyVolumeY(def).yCenter : def.height * 0.72;
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

  stepSecrets(dt: number) {
    const speed = 1 / SECRET_PLATE_TIME;
    for (const s of this.secrets) {
      if (s.opening && s.offset < 1) s.offset = Math.min(1, s.offset + dt * speed);
    }
  }

  stepPowerupTracks(dt: number) {
    for (const ev of stepPowerups(this.powerups, dt)) {
      if (ev.t === 'warn') this.events.push({ t: 'powerupWarn', kind: ev.kind });
      else this.events.push({ t: 'powerupEnd', kind: ev.kind });
    }
  }

  private buildSecretMask() {
    const w = this.map.w;
    const mark = (x: number, z: number, id: number) => {
      if (x < 0 || z < 0 || x >= w || z >= this.map.h) return;
      const i = z * w + x;
      this.secretCell[i] = 1;
      this.secretOwner[i] = id;
    };
    for (const s of this.secrets) {
      const room = this.map.rooms.find(r => r.id === s.roomId);
      if (room) {
        for (let z = room.z; z < room.z + room.h; z++) {
          for (let x = room.x; x < room.x + room.w; x++) mark(x, z, s.id);
        }
      }
      for (const [x, z] of s.cells) mark(x, z, s.id);
    }
  }

  openSecret(s: SecretState) {
    if (s.opening && s.found) return;
    s.opening = true;
    s.found = true;
    this.events.push({ t: 'secretFound', id: s.id, name: s.name || undefined });
    this.message(s.name ? `SECRET — ${s.name}` : 'SECRET FOUND');
  }

  trySecretShot(cx: number, cz: number, damage: number) {
    for (const s of this.secrets) {
      if (s.found && s.opening) continue;
      if (s.kind === 'plate-shoot') {
        if (!s.cells.some(([x, z]) => x === cx && z === cz)) continue;
        s.hpLeft -= damage;
        if (s.hpLeft <= 0) this.openSecret(s);
        return;
      }
      if (s.kind === 'remote-shoot' && s.trigger && s.trigger.x === cx && s.trigger.z === cz) {
        this.openSecret(s);
        return;
      }
    }
  }

  tryUse() {
    const p = this.player;
    for (const s of this.secrets) {
      if (s.offset >= 1) continue;
      if (s.kind === 'plate-use') {
        if (Math.hypot(s.x - p.x, s.z - p.z) < 3.2) {
          this.openSecret(s);
          return;
        }
      } else if (s.kind === 'remote-use' && s.trigger) {
        if (Math.hypot(s.trigger.wx - p.x, s.trigger.wz - p.z) < 3.2) {
          this.openSecret(s);
          return;
        }
      }
    }
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
        case 'powerup': {
          const kind = it.powerup ?? 'ward';
          const res = applyPowerup(this.powerups, kind);
          it.taken = true;
          const def = POWERUP_DEFS[kind];
          this.events.push({ t: 'pickup', kind: 'powerup', label: def.label });
          if (res.ended) this.events.push({ t: 'powerupEnd', kind: res.ended });
          this.events.push({ t: 'powerupStart', kind: res.started });
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
      secrets: this.secrets.map(s => `${s.found ? 1 : 0}:${Math.round(s.offset * 100)}`).join(','),
      power: `${this.powerups.wardT.toFixed(2)}:${this.powerups.damageKind ?? '-'}:${this.powerups.damageT.toFixed(2)}`,
      enemies: this.enemies.map(e => `${e.state}:${Math.round(e.hp)}:${Math.round(e.x * 10)}:${Math.round(e.z * 10)}`).join(','),
      proj: this.projectiles.length,
      rng: this.rng.state(),
    };
    return JSON.stringify(data);
  }
}
