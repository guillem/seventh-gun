import { makeRng, type Rng } from './rng';
import { CELL, PLAYER_EYE, PLAYER_HEIGHT, PLAYER_RADIUS, type AmmoType, cellToWorld } from './types';
import type { GameMap, PickupDef, ProjectileKind } from './types';
import type { SimInput } from './sim';
import { STEP_DT, emptyInput } from './sim';
import { WEAPONS, type WeaponDef } from './weapons';
import { DIFFICULTIES } from './difficulty';
import { aimDirFromLook } from './aim';
import { circleFits, moveCircle, pushCircleOut, type SolidState } from './physics';
import { spreadDir, damageAtRange, sweepHitscan, integrateProjectile, splashFactors } from './combat';
import { generateArena } from './arenagen';
import type { PowerupState } from './powerups';
import { createPowerupState } from './powerups';
import {
  ARENA_DEATH_LOCKOUT,
  ARENA_GEN_VERSION,
  ARENA_IDLE_S,
  ARENA_LAST_HIT_S,
  ARENA_MAX_PLAYERS,
  ARENA_MIN_SPAWN_DIST,
  ARENA_RESPAWN,
  ARENA_SPAWN_PROTECT,
} from './arenaConstants';

export type ArenaWeaponId = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface ArenaPlayer {
  id: number;
  name: string;
  colorIndex: number;
  x: number;
  z: number;
  yaw: number;
  pitch: number;
  hp: number;
  gun: ArenaWeaponId;
  owned: boolean[];
  ammo: Record<AmmoType, number>;
  fireCd: number;
  dryCd: number;
  bloom: number;
  alive: boolean;
  deathTimer: number;
  protectUntil: number;
  spawnCount: number;
  frags: number;
  deaths: number;
  lastHitBy: { id: number; at: number } | null;
  input: SimInput;
  queued: SimInput[];
  queuedSeqs: number[];
  lastSeq: number;
  lastQueuedSeq: number;
  idleFor: number;
  corpse: { x: number; z: number; yaw: number } | null;
  kicked: boolean;
}

export interface ArenaProjectile {
  id: number;
  kind: ProjectileKind;
  ownerId: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  gravity: number;
  radius: number;
  damage: number;
  splashRadius: number;
  damageSelfPct: number;
  age: number;
}

export type ArenaEvent =
  | { t: 'playerJoin'; id: number; name: string; colorIndex: number }
  | { t: 'playerLeave'; id: number }
  | { t: 'kick'; id: number; reason: 'idle' | 'mismatch' | 'protocol' }
  | { t: 'shot'; id: number; shotId: number; inputSeq: number; gun: number; x: number; z: number; yaw: number; pitch: number }
  | { t: 'dryfire'; id: number; gun: number }
  | { t: 'tracer'; id: number; x0: number; y0: number; z0: number; x1: number; y1: number; z1: number; kind: 'bullets' }
  | { t: 'beam'; id: number; x0: number; y0: number; z0: number; x1: number; y1: number; z1: number }
  | { t: 'spawnProjectile'; id: number; projectileId: number; ownerId: number; kind: ProjectileKind; x: number; y: number; z: number; vx: number; vy: number; vz: number; gravity: number; radius: number; age: number }
  | { t: 'explosion'; id: number; x: number; y: number; z: number; radius: number }
  | { t: 'playerHurt'; id: number; damage: number; fromAngle: number }
  | { t: 'hitPlayer'; id: number; x: number; y: number; z: number; killed: boolean }
  | { t: 'playerDie'; id: number }
  | { t: 'playerSpawn'; id: number }
  | { t: 'frag'; killerId: number; victimId: number; suicide: boolean }
  | { t: 'pickup'; playerId: number; pickupId: number; kind: PickupDef['kind']; label: string }
  | { t: 'padRespawn'; id: number };

export interface ArenaSnapshot {
  tick: number;
  players: {
    id: number;
    name: string;
    colorIndex: number;
    x: number;
    z: number;
    yaw: number;
    pitch: number;
    hp: number;
    gun: number;
    ownedMask: number;
    alive: boolean;
    protect: number;
    frags: number;
    deaths: number;
    lastSeq: number;
    ammo: Record<AmmoType, number>;
  }[];
  projectiles: { id: number; ownerId: number; kind: ProjectileKind; x: number; y: number; z: number; vx: number; vy: number; vz: number; gravity: number; radius: number; age: number }[];
  pickups: { id: number; taken: boolean }[];
}

interface ArenaPickup extends PickupDef {
  taken: boolean;
  respawnAt: number;
}

export class ArenaSim implements SolidState {
  map: GameMap;
  doors: { cells: [number, number][]; offset: number; opening: boolean }[] = [];
  secrets: { cells: [number, number][]; offset: number; opening: boolean }[] = [];
  sealIntact = false;

  time = 0;
  tick = 0;
  players: ArenaPlayer[] = [];
  projectiles: ArenaProjectile[] = [];
  pickups: ArenaPickup[] = [];
  events: ArenaEvent[] = [];
  rng: Rng;
  private seed: string;
  private nextPlayerId = 0;
  private nextColorIndex = 0;
  private nextProjectileId = 1;
  private nextShotId = 1;

  // Spawn candidates are cells inside a room whose circle fits the arena
  // walls at server startup, so every respawn can sample deterministically.
  private spawnCells: { cx: number; cz: number }[] = [];

  // Cosmetic/unused to keep WorldView shape compatible.
  explored: Uint8Array;
  secretCell: Uint8Array;
  powerups: PowerupState;

  constructor(seed: string) {
    this.seed = seed;
    this.map = generateArena(seed);
    this.rng = makeRng(`arena|${seed}|v${ARENA_GEN_VERSION}`);
    this.powerups = createPowerupState();
    this.explored = new Uint8Array(this.map.w * this.map.h).fill(1);
    this.secretCell = new Uint8Array(this.map.w * this.map.h);
    // Initialize pad state.
    this.pickups = this.map.pickups.map((p) => ({ ...p, taken: false, respawnAt: 0 }));

    // Precompute spawn candidate cells.
    for (let cz = 0; cz < this.map.h; cz++) {
      for (let cx = 0; cx < this.map.w; cx++) {
        if (this.map.grid[cz * this.map.w + cx] !== 1) continue;
        if (!this.map.rooms.some((r) => cx >= r.x && cx < r.x + r.w && cz >= r.z && cz < r.z + r.h)) continue;
        // Test a centered circle fit (server uses world coords).
        const x = cellToWorld(cx);
        const z = cellToWorld(cz);
        if (!circleFits(this, x, z, PLAYER_RADIUS)) continue;
        this.spawnCells.push({ cx, cz });
      }
    }
    if (!this.spawnCells.length) {
      // Extremely defensive fallback; should never happen with a correct generator.
      this.spawnCells.push({ cx: this.map.rooms[0]?.x ?? 1, cz: this.map.rooms[0]?.z ?? 1 });
    }
  }

  private sanitizeName(input: string): string {
    const t = input.trim();
    const ok = t.length >= 2 && t.length <= 16 && /^[A-Za-z0-9][A-Za-z0-9 _\\-]*$/.test(t);
    return ok ? t : 'PLAYER';
  }

  join(name: string): ArenaPlayer | 'full' {
    if (this.players.length >= ARENA_MAX_PLAYERS) return 'full';

    const base = this.sanitizeName(name);
    let candidate = base;
    let suffix = 2;
    const liveNames = new Set(this.players.map((p) => p.name));
    while (liveNames.has(candidate)) {
      candidate = `${base} (${suffix++})`;
    }

    const p: ArenaPlayer = {
      id: this.nextPlayerId++,
      name: candidate,
      colorIndex: this.nextColorIndex++ % ARENA_MAX_PLAYERS,
      x: 0,
      z: 0,
      yaw: 0,
      pitch: 0,
      hp: 100,
      gun: 1,
      owned: [false, true, false, false, false, false, false, false],
      ammo: { bullets: WEAPONS[0].spawnAmmo, shells: 0, nails: 0, grenades: 0, cores: 0, void: 0 },
      fireCd: 0,
      dryCd: 0,
      bloom: 0,
      alive: true,
      deathTimer: 0,
      protectUntil: 0,
      spawnCount: 0,
      frags: 0,
      deaths: 0,
      lastHitBy: null,
      input: { ...emptyInput(), yaw: 0, pitch: 0 },
      queued: [],
      queuedSeqs: [],
      lastSeq: 0,
      lastQueuedSeq: 0,
      idleFor: 0,
      corpse: null,
      kicked: false,
    };

    this.respawn(p);
    this.events.push({ t: 'playerJoin', id: p.id, name: p.name, colorIndex: p.colorIndex });
    this.players.push(p);
    return p;
  }

  leave(id: number): void {
    const idx = this.players.findIndex((p) => p.id === id);
    if (idx < 0) return;
    this.players.splice(idx, 1);
    this.events.push({ t: 'playerLeave', id });
  }

  pushInput(id: number, seq: number, inputs: SimInput[]): void {
    const p = this.players.find((pp) => pp.id === id);
    if (!p) return;
    // `seq` is the first input; the rest are consecutive. Ignore anything
    // already queued or consumed so a resend at real RTT is a no-op.
    for (let i = 0; i < inputs.length; i++) {
      const s = seq + i;
      if (s <= p.lastQueuedSeq) continue;
      if (!p.alive) continue;
      const raw = inputs[i]!;
      const frame: SimInput = {
        ...raw,
        moveX: Math.max(-1, Math.min(1, raw.moveX)),
        moveZ: Math.max(-1, Math.min(1, raw.moveZ)),
        pitch: Math.max(-Math.PI / 2, Math.min(Math.PI / 2, raw.pitch)),
      };
      // Do not silently discard an accepted frame. In particular, a one-frame
      // fire or weapon switch must either be simulated or remain unacknowledged
      // so the client can resend it. Keeping the queue bounded also prevents a
      // delayed client from converting a burst into extra movement time.
      if (p.queued.length >= 8) break;
      p.queued.push(frame);
      p.queuedSeqs.push(s);
      p.lastQueuedSeq = s;
      p.input = frame;
    }
  }

  private weaponDamageBase(w: WeaponDef): number {
    // Normal mode only: no difficulty and no powerups.
    return w.damage * DIFFICULTIES.normal.playerDamageOut;
  }

  step(dt: number = STEP_DT): void {
    if (this.players.length === 0) return;
    this.time += dt;
    this.tick++;

    // Player steps (movement + fire + pickups + idle)
    for (const p of this.players) {
      if (!p.alive) {
        p.deathTimer -= dt;
        if (p.deathTimer <= 0) this.respawn(p);
        continue;
      }

      // Exactly one acknowledged input contributes to one fixed simulation
      // tick. Applying two queued controls in one tick acknowledged a short
      // action without simulating it, and could make delayed movement faster.
      for (let n = 0; n < 1 && p.queued.length; n++) {
        p.input = p.queued.shift()!;
        p.lastSeq = p.queuedSeqs.shift() ?? p.lastSeq;
      }

      const prevYaw = p.yaw;
      const prevPitch = p.pitch;

      // Look authority comes from the client; server just reuses yaw/pitch.
      p.yaw = p.input.yaw;
      p.pitch = p.input.pitch;

      // Movement (camera-relative) with wall collision.
      const speed = 6.5;
      const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
      const rx = Math.cos(p.yaw), rz = -Math.sin(p.yaw);
      let dx = fx * p.input.moveZ + rx * p.input.moveX;
      let dz = fz * p.input.moveZ + rz * p.input.moveX;
      const len = Math.hypot(dx, dz);
      if (len > 1) { dx /= len; dz /= len; }
      const moved = moveCircle(this, p.x, p.z, dx * speed * dt, dz * speed * dt, PLAYER_RADIUS);
      p.x = moved.x; p.z = moved.z;

      // Body blocking (deterministic pairwise order).
      for (const other of this.players) {
        if (!other.alive || other.id === p.id) continue;
        const out = pushCircleOut(this, p.x, p.z, PLAYER_RADIUS, other.x, other.z, PLAYER_RADIUS);
        p.x = out.x; p.z = out.z;
      }

      // Cooldowns and bloom decay.
      p.fireCd = Math.max(0, p.fireCd - dt);
      p.dryCd = Math.max(0, p.dryCd - dt);
      if (!p.input.fire) p.bloom = Math.max(0, p.bloom - dt * 0.9);

      // Gun switch (server-side ownership check).
      if (p.input.switchGun !== null && p.input.switchGun >= 1 && p.input.switchGun <= 7) {
        const g = p.input.switchGun as ArenaWeaponId;
        if (p.owned[g]) p.gun = g;
      }

      // Fire.
      if (p.input.fire) {
        this.tryFire(p);
      }

      // Pickups (touch).
      this.checkPickups(p);

      // Idle kick accounting.
      const movedEnough = Math.abs(p.input.moveX) > 1e-6 || Math.abs(p.input.moveZ) > 1e-6;
      const lookChanged = Math.abs(p.yaw - prevYaw) > 1e-8 || Math.abs(p.pitch - prevPitch) > 1e-8;
      if (!movedEnough && !p.input.fire && !lookChanged) p.idleFor += dt;
      else p.idleFor = 0;

      if (!p.kicked && p.idleFor >= ARENA_IDLE_S) {
        p.kicked = true;
        this.events.push({ t: 'kick', id: p.id, reason: 'idle' });
      }
    }

    // Projectile integration (server-authoritative).
    this.stepProjectiles(dt);

    // Pad respawns.
    for (const pk of this.pickups) {
      if (pk.taken && this.time >= pk.respawnAt) {
        pk.taken = false;
        this.events.push({ t: 'padRespawn', id: pk.id });
      }
    }
  }

  private ownedMask(p: ArenaPlayer): number {
    let mask = 0;
    for (let g = 1; g <= 7; g++) if (p.owned[g]) mask |= 1 << (g - 1);
    return mask;
  }

  snapshot(): ArenaSnapshot {
    return {
      tick: this.tick,
      players: this.players.map((p) => ({
        id: p.id,
        name: p.name,
        colorIndex: p.colorIndex,
        x: p.x,
        z: p.z,
        yaw: p.yaw,
        pitch: p.pitch,
        hp: p.alive ? p.hp : 0,
        gun: p.gun,
        ownedMask: this.ownedMask(p),
        alive: p.alive,
        protect: Math.max(0, p.protectUntil - this.time),
        frags: p.frags,
        deaths: p.deaths,
        lastSeq: p.lastSeq,
        ammo: { ...p.ammo },
      })),
      projectiles: this.projectiles.map((pr) => ({
        id: pr.id,
        ownerId: pr.ownerId,
        kind: pr.kind,
        x: pr.x,
        y: pr.y,
        z: pr.z,
        vx: pr.vx,
        vy: pr.vy,
        vz: pr.vz,
        gravity: pr.gravity,
        radius: pr.radius,
        age: pr.age,
      })),
      pickups: this.pickups.map((pk) => ({ id: pk.id, taken: pk.taken })),
    };
  }

  takeEvents(): ArenaEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  private respawn(p: ArenaPlayer): void {
    // Reset combat stats but keep frags/deaths.
    p.alive = true;
    p.deathTimer = 0;
    p.hp = 100;
    p.gun = 1;
    p.owned = [false, true, false, false, false, false, false, false];
    p.ammo = { bullets: WEAPONS[0].spawnAmmo, shells: 0, nails: 0, grenades: 0, cores: 0, void: 0 };
    p.fireCd = 0;
    p.dryCd = 0;
    p.bloom = 0;
    p.lastHitBy = null;
    p.idleFor = 0;
    p.kicked = false;

    const spawnRng = makeRng(`spawn|${this.seed}|${p.id}|${p.spawnCount}`);
    p.spawnCount++;

    // Choose a spawn cell: sample 12 candidates and pick the one farthest
    // from the nearest living player (if any).
    const prev = p.corpse
      ? { cx: Math.floor(p.corpse.x / CELL), cz: Math.floor(p.corpse.z / CELL) }
      : null;

    let best = this.spawnCells[spawnRng.int(this.spawnCells.length)]!;
    let bestDist = -Infinity;
    const living = this.players.filter((q) => q.id !== p.id && q.alive);
    for (let i = 0; i < 12; i++) {
      const c = this.spawnCells[spawnRng.int(this.spawnCells.length)]!;
      // Avoid re-spawning in the exact same cell we just died from (helps
      // deterministically satisfy arena unit tests).
      if (prev && c.cx === prev.cx && c.cz === prev.cz) continue;
      let nearest = Infinity;
      for (const q of living) {
        const d = Math.hypot(cellToWorld(c.cx) - q.x, cellToWorld(c.cz) - q.z);
        nearest = Math.min(nearest, d);
      }
      if (!living.length) nearest = ARENA_MIN_SPAWN_DIST + 1;
      if (nearest > bestDist) { bestDist = nearest; best = c; }
      if (bestDist >= ARENA_MIN_SPAWN_DIST && i >= 3) break;
    }

    if (prev && best.cx === prev.cx && best.cz === prev.cz && this.spawnCells.length > 1) {
      // If sampling got unlucky and only produced the previous cell, force a
      // deterministic different candidate.
      for (let i = 0; i < this.spawnCells.length; i++) {
        const c = this.spawnCells[i]!;
        if (c.cx === prev.cx && c.cz === prev.cz) continue;
        best = c;
        break;
      }
    }

    p.x = cellToWorld(best.cx);
    p.z = cellToWorld(best.cz);
    // Random yaw; pitch resets to 0 for first frame (camera will quickly correct).
    p.yaw = spawnRng.float() * Math.PI * 2;
    p.pitch = 0;
    p.protectUntil = this.time + ARENA_SPAWN_PROTECT;
    p.corpse = { x: p.x, z: p.z, yaw: p.yaw };
    p.input = { ...emptyInput(), yaw: p.yaw, pitch: p.pitch, switchGun: null };
    p.queued = [];
    p.queuedSeqs = [];
    // Keep lastSeq / lastQueuedSeq so in-flight pre-death inputs cannot
    // be replayed from the new spawn cell.

    this.events.push({ t: 'playerSpawn', id: p.id });
  }

  private tryFire(p: ArenaPlayer): void {
    if (p.fireCd > 0) return;
    const w = WEAPONS[p.gun - 1]!;
    const ammoKey = w.ammo as AmmoType;
    if (p.ammo[ammoKey] <= 0) {
      if (p.dryCd <= 0) {
        this.events.push({ t: 'dryfire', id: p.id, gun: p.gun });
        p.dryCd = 0.45;
      }
      p.fireCd = 0.25;
      return;
    }

    // Spawn protection is removed on first successful shot.
    if (p.protectUntil > this.time) p.protectUntil = this.time;

    p.ammo[ammoKey] -= 1;
    p.fireCd = w.fireInterval;
    this.events.push({ t: 'shot', id: p.id, shotId: this.nextShotId++, inputSeq: p.lastSeq, gun: p.gun, x: p.x, z: p.z, yaw: p.yaw, pitch: p.pitch });

    const composed = aimDirFromLook(p.yaw, p.pitch);
    const dirBase = composed;
    const eye = PLAYER_EYE;
    const baseDamage = this.weaponDamageBase(w);

    if (w.hitscan) {
      for (let pellet = 0; pellet < w.pellets; pellet++) {
        let sx = dirBase.dirX;
        let sy = dirBase.dirY;
        let sz = dirBase.dirZ;

        const spread = w.spread + (w.id === 3 ? p.bloom : 0);
        if (spread > 0) {
          const a = this.rng.float() * Math.PI * 2;
          const r = Math.sqrt(this.rng.float()) * spread;
          const spreaded = spreadDir(dirBase.dirX, dirBase.dirY, dirBase.dirZ, a, r);
          sx = spreaded.dirX;
          sy = spreaded.dirY;
          sz = spreaded.dirZ;
        }

        this.hitscanShotPlayer(p, sx, sy, sz, baseDamage, w.pierce, w, pellet === 0);
      }
      if (w.id === 3) {
        p.bloom = Math.min(w.bloomMax, p.bloom + (w.bloomMax / w.bloomTime) * w.fireInterval);
      }
    } else {
      const proj = w.projectile!;
      const spread = w.spread;
      let sx = dirBase.dirX;
      let sy = dirBase.dirY;
      let sz = dirBase.dirZ;
      if (spread > 0) {
        const a = this.rng.float() * Math.PI * 2;
        const r = Math.sqrt(this.rng.float()) * spread;
        const spreaded = spreadDir(dirBase.dirX, dirBase.dirY, dirBase.dirZ, a, r);
        sx = spreaded.dirX; sy = spreaded.dirY; sz = spreaded.dirZ;
      }

      const pr: ArenaProjectile = {
        id: this.nextProjectileId++,
        kind: proj.kind,
        ownerId: p.id,
        x: p.x + sx * 0.6,
        y: eye - 0.25 + sy * 0.6,
        z: p.z + sz * 0.6,
        vx: sx * proj.speed,
        vy: sy * proj.speed,
        vz: sz * proj.speed,
        gravity: proj.gravity,
        radius: proj.radius,
        damage: baseDamage,
        splashRadius: w.splash?.radius ?? 0,
        damageSelfPct: w.splash?.damageSelfPct ?? 0,
        age: 0,
      };
      this.projectiles.push(pr);
      this.events.push({ t: 'spawnProjectile', id: p.id, projectileId: pr.id, ownerId: p.id, kind: pr.kind, x: pr.x, y: pr.y, z: pr.z, vx: pr.vx, vy: pr.vy, vz: pr.vz, gravity: pr.gravity, radius: pr.radius, age: pr.age });
    }
  }

  private hitscanShotPlayer(
    shooter: ArenaPlayer,
    dirX: number, dirY: number, dirZ: number,
    damage: number,
    pierce: boolean,
    w: WeaponDef,
    visual: boolean,
  ): void {
    const bodies: { id: number; x: number; z: number; radius: number; yMin: number; yMax: number }[] = [];
    const living = this.players.filter((p) => p.alive && p.id !== shooter.id);
    for (const v of living) {
      bodies.push({ id: v.id, x: v.x, z: v.z, radius: PLAYER_RADIUS, yMin: 0, yMax: PLAYER_HEIGHT });
    }
    const { hits, tracerEnd } = sweepHitscan(this, shooter.x, PLAYER_EYE, shooter.z, dirX, dirY, dirZ, 120, bodies);

    let hitAny = false;
    for (const h of hits) {
      const victim = this.players.find((p) => p.id === h.id);
      if (!victim || !victim.alive) continue;
      this.damagePlayer(victim, shooter.id, h.t, damageAtRange(w, h.t, damage), shooter.x, shooter.z);
      hitAny = true;
      if (!pierce) break;
    }

    if (visual) {
      const endT = pierce ? tracerEnd : (hitAny && hits.length ? hits[0].t : tracerEnd);
      const x1 = shooter.x + dirX * endT;
      const z1 = shooter.z + dirZ * endT;
      if (w.id === 6) {
        this.events.push({ t: 'beam', id: shooter.id, x0: shooter.x, y0: PLAYER_EYE, z0: shooter.z, x1, y1: PLAYER_EYE + dirY * endT, z1 });
      } else {
        this.events.push({ t: 'tracer', id: shooter.id, x0: shooter.x, y0: PLAYER_EYE, z0: shooter.z, x1, y1: PLAYER_EYE + dirY * endT, z1, kind: 'bullets' });
      }
    }
  }

  private damagePlayer(victim: ArenaPlayer, fromId: number, t: number, damage: number, fromX: number, fromZ: number): void {
    if (!victim.alive) return;
    if (victim.protectUntil > this.time) return;
    const dmg = Math.max(1, damage);
    victim.hp -= dmg;
    const ang = Math.atan2(fromX - victim.x, fromZ - victim.z);
    let rel = ang - (victim.yaw + Math.PI);
    while (rel > Math.PI) rel -= Math.PI * 2;
    while (rel < -Math.PI) rel += Math.PI * 2;
    this.events.push({ t: 'playerHurt', id: victim.id, damage: dmg, fromAngle: rel });
    if (dmg > 0) victim.lastHitBy = { id: fromId, at: this.time };
    const killed = victim.hp <= 0;
    this.events.push({
      t: 'hitPlayer', id: victim.id, x: victim.x, y: PLAYER_HEIGHT * 0.55, z: victim.z, killed,
    });
    if (killed) this.handleDeath(victim);
  }

  private handleDeath(v: ArenaPlayer): void {
    v.alive = false;
    v.deathTimer = ARENA_DEATH_LOCKOUT;
    v.corpse = { x: v.x, z: v.z, yaw: v.yaw };
    this.events.push({ t: 'playerDie', id: v.id });
    v.deaths += 1;

    const credit = v.lastHitBy && this.time - v.lastHitBy.at <= ARENA_LAST_HIT_S
      ? v.lastHitBy
      : null;
    if (credit && credit.id !== v.id) {
      const killer = this.players.find((p) => p.id === credit.id);
      if (killer) {
        killer.frags += 1;
        this.events.push({ t: 'frag', killerId: killer.id, victimId: v.id, suicide: false });
      }
      // Killer already left: no credit, no suicide penalty.
    } else {
      v.frags = Math.max(0, v.frags - 1);
      this.events.push({ t: 'frag', killerId: v.id, victimId: v.id, suicide: true });
    }
  }

  private stepProjectiles(dt: number): void {
    const keep: ArenaProjectile[] = [];
    for (const pr of this.projectiles) {
      pr.age += dt;
      if (pr.age > 8) continue;

      const bodies: { id: number; x: number; z: number; radius: number; yMin: number; yMax: number }[] = [];
      const owner = this.players.find((p) => p.id === pr.ownerId);
      for (const v of this.players) {
        if (!v.alive) continue;
        if (v.id === pr.ownerId) continue;
        bodies.push({
          id: v.id,
          x: v.x,
          z: v.z,
          radius: PLAYER_RADIUS + pr.radius,
          yMin: 0 - pr.radius,
          yMax: PLAYER_HEIGHT + pr.radius,
        });
      }
      const impact = integrateProjectile(this, pr, dt, bodies);
      if (!impact) {
        keep.push(pr);
        continue;
      }

      if (impact.kind === 'body' && pr.splashRadius <= 0 && impact.bodyId !== undefined) {
        const victim = this.players.find((p) => p.id === impact.bodyId);
        if (victim) this.damagePlayer(victim, pr.ownerId, pr.age, pr.damage, pr.x, pr.z);
      }

      if (pr.splashRadius > 0) {
        this.events.push({ t: 'explosion', id: pr.ownerId, x: pr.x, y: pr.y, z: pr.z, radius: pr.splashRadius });

        const victimBodies: { id: number; x: number; z: number; radius: number; yMin: number; yMax: number }[] = [];
        for (const v of this.players) {
          if (!v.alive) continue;
          if (v.id === pr.ownerId) continue;
          victimBodies.push({ id: v.id, x: v.x, z: v.z, radius: PLAYER_RADIUS, yMin: 0, yMax: PLAYER_HEIGHT });
        }
        const factors = splashFactors(pr.x, pr.z, pr.splashRadius, victimBodies);
        for (const f of factors) {
          const victim = this.players.find((p) => p.id === f.id);
          if (!victim) continue;
          this.damagePlayer(victim, pr.ownerId, pr.age, pr.damage * f.factor, pr.x, pr.z);
        }

        // Self splash (0.8 radius rule) if owner is still alive.
        if (owner && owner.alive) {
          const pd = Math.hypot(owner.x - pr.x, owner.z - pr.z);
          if (pd < pr.splashRadius * 0.8) {
            const f = 1 - pd / (pr.splashRadius * 0.8);
            this.damagePlayer(owner, pr.ownerId, pr.age, pr.damage * pr.damageSelfPct * f, pr.x, pr.z);
          }
        }
      }

      // Projectile always removed on impact.
    }
    this.projectiles = keep;
  }

  private checkPickups(p: ArenaPlayer): void {
    for (const pk of this.pickups) {
      if (pk.taken) continue;
      if (Math.hypot(pk.x - p.x, pk.z - p.z) > 1.1) continue;
      switch (pk.kind) {
        case 'medikit': {
          if (p.hp >= 100) continue;
          p.hp = Math.min(100, p.hp + 25);
          pk.taken = true;
          pk.respawnAt = this.time + ARENA_RESPAWN.medikit;
          this.events.push({ t: 'pickup', playerId: p.id, pickupId: pk.id, kind: 'medikit', label: '+25 HEALTH' });
          break;
        }
        case 'ammo': {
          const t = pk.ammoType as AmmoType;
          p.ammo[t] = Math.min(WEAPONS.find((w) => w.ammo === t)!.maxAmmo, p.ammo[t] + (pk.amount ?? 0));
          pk.taken = true;
          pk.respawnAt = this.time + ARENA_RESPAWN.ammo;
          this.events.push({ t: 'pickup', playerId: p.id, pickupId: pk.id, kind: 'ammo', label: `+${pk.amount ?? 0}` });
          break;
        }
        case 'gun': {
          const g = pk.gun as number;
          if (g < 1 || g > 7) continue;
          const w = WEAPONS[g - 1]!;
          const isNew = !p.owned[g]!;
          p.owned[g] = true;
          p.ammo[w.ammo] = Math.min(w.maxAmmo, p.ammo[w.ammo] + w.spawnAmmo);
          if (isNew) p.gun = g as ArenaWeaponId;
          pk.taken = true;
          pk.respawnAt = this.time + (g === 7 ? ARENA_RESPAWN.gun7 : ARENA_RESPAWN.gun);
          this.events.push({ t: 'pickup', playerId: p.id, pickupId: pk.id, kind: 'gun', label: w.short });
          break;
        }
        default:
          break;
      }
    }
  }
}
