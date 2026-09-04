import { generateArena, arenaGridHash } from '../sim/arenagen';
import { ARENA_DEATH_LOCKOUT, ARENA_GEN_VERSION, ARENA_INPUT_HZ } from '../sim/arenaConstants';
import type { ArenaEvent, ArenaSnapshot } from '../sim/arena';
import { STEP_DT, type PickupEnt, type PlayerState, type ProjectileEnt, type SimInput } from '../sim/sim';
import { createPowerupState } from '../sim/powerups';
import { moveCircle, type SolidState } from '../sim/physics';
import { PLAYER_RADIUS } from '../sim/types';
import { WEAPONS } from '../sim/weapons';
import type { WorldView } from '../sim/view';
import { decodeServer, encode, PROTOCOL_V, type ServerMessage } from './protocol';

export type ArenaConnectError = 'full' | 'offline' | 'mismatch' | 'protocol';

export interface ArenaNetSocket {
  send(data: string): void;
  close(): void;
  addEventListener(type: 'message', fn: (ev: { data: string }) => void): void;
  addEventListener(type: 'close', fn: (ev: { code: number; reason: string }) => void): void;
  addEventListener(type: 'error', fn: () => void): void;
  addEventListener(type: 'open', fn: () => void): void;
}

export type SocketFactory = (url: string) => ArenaNetSocket;

const INTERP_MS = 100;
const CONNECT_TIMEOUT_MS = 10_000;

export class ArenaClient {
  connected = false;
  id = -1;
  seed = '';
  tick = 0;
  private spawnCount = -1;
  rtt = 0;
  closeReason: string | null = null;
  onClose: ((reason: string) => void) | null = null;

  private sock: ArenaNetSocket | null = null;
  private latest: { snap: ArenaSnapshot; at: number } | null = null;
  // Keep enough arrival-time history to bracket the 100 ms render delay at
  // the normal 20 Hz snapshot cadence. Arrival times are intentional here:
  // v3 snapshots have no server clock suitable for interpolation.
  private snapshots: { snap: ArenaSnapshot; at: number }[] = [];
  private events: ArenaEvent[] = [];
  private pending: { seq: number; input: SimInput }[] = [];
  private nextSeq = 1;
  private sendAcc = 0;
  private pingAcc = 0;
  private localX = 0;
  private localZ = 0;
  private localYaw = 0;
  private localPitch = 0;
  private smoothDx = 0;
  private smoothDz = 0;
  private smoothUntil = 0;
  private solid: SolidState | null = null;
  private view: WorldView | null = null;
  private localGun = 1;
  private predictedShots = new Set<string>();
  private pingSentAt = 0;
  private localFireCd = 0;
  private cosmeticShot: { gun: number; x: number; z: number; yaw: number } | null = null;
  private earlyProjectiles = new Map<number, { projectile: ArenaSnapshot['projectiles'][number]; expiresAt: number }>();
  private diedAt: number | null = null;
  private cancelPendingConnect: (() => void) | null = null;

  constructor(
    private socketFactory: SocketFactory = (url) => new WebSocket(url) as unknown as ArenaNetSocket,
    private now: () => number = () => performance.now(),
  ) {}

  async connect(url: string, name: string, timeoutMs = CONNECT_TIMEOUT_MS): Promise<void> {
    this.close();
    this.resetConnectionState();
    return new Promise((resolve, reject) => {
      let settled = false;
      const sock = this.socketFactory(url);
      this.sock = sock;
      let timeout: ReturnType<typeof setTimeout> | null = null;
      const isCurrent = () => this.sock === sock;
      const fail = (err: ArenaConnectError) => {
        if (settled) return;
        settled = true;
        if (timeout !== null) clearTimeout(timeout);
        this.cancelPendingConnect = null;
        if (isCurrent()) this.sock = null;
        try { sock.close(); } catch { /* socket already gone */ }
        reject(err);
      };
      this.cancelPendingConnect = () => fail('offline');
      timeout = setTimeout(() => fail('offline'), timeoutMs);
      sock.addEventListener('error', () => {
        if (!isCurrent()) return;
        if (settled) this.transportFailed('disconnected');
        else fail('offline');
      });
      sock.addEventListener('close', (ev) => {
        if (!isCurrent()) return;
        if (!settled) { fail('offline'); return; }
        this.transportFailed(ev.reason || 'disconnected');
      });
      sock.addEventListener('open', () => {
        if (!isCurrent() || settled) return;
        this.send({ v: PROTOCOL_V, t: 'join', name });
      });
      sock.addEventListener('message', (ev) => {
        if (!isCurrent()) return;
        const msg = decodeServer(String(ev.data));
        if (msg === 'bad-v') {
          if (settled) this.transportFailed('protocol');
          else fail('protocol');
          return;
        }
        if (msg === 'invalid' || msg === 'unknown') {
          if (settled) this.transportFailed('protocol');
          else fail('offline');
          return;
        }
        if (!settled && msg.t === 'full') { fail('full'); return; }
        if (msg.t === 'welcome') {
          if (settled) return;
          const map = generateArena(msg.seed);
          if (msg.genVersion !== ARENA_GEN_VERSION || arenaGridHash(map.grid, map.pickups) !== msg.gridHash) {
            fail('mismatch');
            sock.close();
            return;
          }
          this.id = msg.id;
          this.seed = msg.seed;
          this.tick = msg.tick;
          this.solid = { map, doors: [], secrets: [], sealIntact: false };
          this.applySnap(msg.snapshot, this.now());
          const me = msg.snapshot.players.find((p) => p.id === this.id);
          if (me) { this.localX = me.x; this.localZ = me.z; this.localGun = me.gun; }
          this.connected = true;
          this.rebuildView();
          if (!settled) {
            settled = true;
            if (timeout !== null) clearTimeout(timeout);
            this.cancelPendingConnect = null;
            resolve();
          }
          return;
        }
        if (settled) this.handleMessage(msg);
      });
    });
  }

  close(): void {
    this.onClose = null;
    this.cancelPendingConnect?.();
    this.cancelPendingConnect = null;
    const sock = this.sock;
    this.sock = null;
    this.connected = false;
    try { sock?.close(); } catch { /* socket already gone */ }
  }

  takeCosmeticShot(): { gun: number; x: number; z: number; yaw: number } | null {
    const s = this.cosmeticShot;
    this.cosmeticShot = null;
    return s;
  }

  shouldIgnoreEchoShot(actorId: number, spawnCount: number, inputSeq: number): boolean {
    const key = `${actorId}:${spawnCount}:${inputSeq}`;
    if (actorId !== this.id || spawnCount !== this.spawnCount || !this.predictedShots.has(key)) return false;
    this.predictedShots.delete(key);
    return true;
  }

  /** Test helper: un-acked input count after reconcile. */
  pendingCount(): number {
    return this.pending.length;
  }

  takeEvents(): ArenaEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  stepLocal(dt: number, input: SimInput): void {
    if (!this.solid || !this.connected) return;
    this.localYaw = input.yaw;
    this.localPitch = input.pitch;
    this.pingAcc += dt;
    if (this.pingAcc >= 5) {
      this.pingAcc = 0;
      this.pingSentAt = this.now();
      this.send({ v: PROTOCOL_V, t: 'ping', at: this.pingSentAt });
    }
    const me = this.latest?.snap.players.find((p) => p.id === this.id);
    if (!me?.alive) {
      this.pending = [];
      this.sendAcc = 0;
      this.rebuildView();
      return;
    }
    this.accumulator(dt, input);
    this.sendAcc += dt;
    if (this.sendAcc >= 1 / ARENA_INPUT_HZ) {
      this.flushInputs();
      this.sendAcc = 0;
    }
    this.rebuildView();
  }

  worldView(): WorldView | null {
    return this.view;
  }

  others(now = this.now()): {
    id: number; name: string; colorIndex: number; x: number; z: number;
    yaw: number; pitch: number; hp: number; alive: boolean; gun: number;
  }[] {
    const pose = this.interpolatedSnap(now);
    if (!pose) return [];
    return pose.players.filter((p) => p.id !== this.id).map((p) => ({
      id: p.id, name: p.name, colorIndex: p.colorIndex,
      x: p.x, z: p.z, yaw: p.yaw, pitch: p.pitch, hp: p.hp, alive: p.alive, gun: p.gun,
    }));
  }

  roster(): { id: number; name: string; colorIndex: number; frags: number; deaths: number; alive: boolean }[] {
    const snap = this.latest?.snap;
    if (!snap) return [];
    return snap.players.map((p) => ({
      id: p.id, name: p.name, colorIndex: p.colorIndex,
      frags: p.frags, deaths: p.deaths, alive: p.alive,
    }));
  }

  debugState() {
    if (!this.connected) return null;
    return {
      connected: this.connected,
      id: this.id,
      seed: this.seed,
      tick: this.tick,
      rtt: this.rtt,
      players: this.roster(),
    };
  }

  /** Test helper: inject a snapshot as if it arrived from the server. */
  ingestSnapshot(snap: ArenaSnapshot, at = this.now()): void {
    this.applySnap(snap, at);
    this.reconcile();
    this.rebuildView();
  }

  interpolateAt(now: number): ArenaSnapshot | null {
    return this.interpolatedSnap(now);
  }

  private acc = 0;
  private accumulator(dt: number, input: SimInput): void {
    this.acc += dt;
    let steps = 0;
    while (this.acc >= STEP_DT && steps < 5) {
      this.predictStep(input);
      this.acc -= STEP_DT;
      steps++;
    }
    if (steps === 5) this.acc = 0;
  }

  private predictStep(input: SimInput): void {
    if (!this.solid) return;
    const seq = this.nextSeq++;
    const clamped: SimInput = {
      ...input,
      moveX: Math.max(-1, Math.min(1, input.moveX)),
      moveZ: Math.max(-1, Math.min(1, input.moveZ)),
    };
    this.pending.push({ seq, input: clamped });
    const speed = 6.5;
    const fx = -Math.sin(clamped.yaw), fz = -Math.cos(clamped.yaw);
    const rx = Math.cos(clamped.yaw), rz = -Math.sin(clamped.yaw);
    let dx = fx * clamped.moveZ + rx * clamped.moveX;
    let dz = fz * clamped.moveZ + rz * clamped.moveX;
    const len = Math.hypot(dx, dz);
    if (len > 1) { dx /= len; dz /= len; }
    const moved = moveCircle(this.solid, this.localX, this.localZ, dx * speed * STEP_DT, dz * speed * STEP_DT, PLAYER_RADIUS);
    this.localX = moved.x;
    this.localZ = moved.z;
    this.localFireCd = Math.max(0, this.localFireCd - STEP_DT);
    const me = this.latest?.snap.players.find((p) => p.id === this.id);
    let gun = this.localGun || me?.gun || 1;
    if (clamped.switchGun !== null && clamped.switchGun >= 1 && clamped.switchGun <= 7
      && !!(me?.ownedMask && (me.ownedMask & (1 << (clamped.switchGun - 1))))) {
      gun = clamped.switchGun;
      this.localGun = gun;
    }
    const w = WEAPONS[gun - 1];
    const ammo = w ? (me?.ammo[w.ammo] ?? 0) : 0;
    if (clamped.fire && this.localFireCd <= 0 && me?.alive && ammo > 0 && w) {
      this.cosmeticShot = { gun, x: this.localX, z: this.localZ, yaw: clamped.yaw };
      this.predictedShots.add(`${this.id}:${this.spawnCount}:${seq}`);
      this.localFireCd = w.fireInterval;
    }
  }

  private flushInputs(): void {
    if (!this.sock || !this.pending.length) return;
    // Always begin at the oldest unacknowledged sequence. A server can reject
    // a full queue, so sending only newer controls would create a sequence
    // hole that it must not acknowledge past. Repeating an already accepted
    // prefix is harmless: the server de-duplicates it before taking the next
    // contiguous frame.
    const batch = this.pending.slice(0, 8);
    if (!batch.length) return;
    this.send({ v: PROTOCOL_V, t: 'input', spawnCount: this.spawnCount, seq: batch[0]!.seq, inputs: batch.map((b) => b.input) });
  }

  private handleMessage(msg: ServerMessage): void {
    if (msg.t === 'snap') {
      this.applySnap(msg.snapshot, this.now());
      this.reconcile();
      this.rebuildView();
    } else if (msg.t === 'events') {
      for (const event of msg.es) this.noteEvent(event);
      this.events.push(...msg.es);
      this.rebuildView();
    } else if (msg.t === 'pong') {
      this.rtt = Math.max(0, this.now() - msg.at);
    } else if (msg.t === 'kicked') {
      this.closeReason = msg.reason;
      this.sock?.close();
    }
  }

  private send(msg: Parameters<typeof encode>[0]): void {
    try {
      this.sock?.send(encode(msg));
    } catch {
      this.transportFailed('disconnected');
    }
  }

  /** Close a live transport and notify the game once; close() is intentional. */
  private transportFailed(reason: string): void {
    const sock = this.sock;
    if (!sock) return;
    this.sock = null;
    this.connected = false;
    this.closeReason = reason;
    this.cancelPendingConnect = null;
    try { sock.close(); } catch { /* socket already gone */ }
    const onClose = this.onClose;
    this.onClose = null;
    onClose?.(reason);
  }

  private applySnap(snap: ArenaSnapshot, at: number): boolean {
    // A packet which predates the current authority cannot resurrect a player
    // or undo a death/removal. Equal ticks are harmless and keep test/debug
    // injection usable; the later arrival replaces the render sample.
    if (this.latest && snap.tick < this.latest.snap.tick) return false;
    const me = snap.players.find((player) => player.id === this.id);
    if (me && me.spawnCount !== this.spawnCount) this.resetLife(me.spawnCount, me.x, me.z, me.yaw, me.pitch);
    this.latest = { snap, at };
    this.snapshots.push({ snap, at });
    this.snapshots.sort((a, b) => a.at - b.at);
    const oldest = Math.max(...this.snapshots.map((sample) => sample.at)) - 1000;
    this.snapshots = this.snapshots.filter((sample) => sample.at >= oldest);
    this.tick = snap.tick;
    return true;
  }

  private noteEvent(event: ArenaEvent): void {
    if (event.t === 'despawnProjectile') {
      this.earlyProjectiles.delete(event.projectileId);
      return;
    }
    if (event.t !== 'spawnProjectile') return;
    this.earlyProjectiles.set(event.projectileId, {
      projectile: {
        id: event.projectileId, ownerId: event.ownerId, kind: event.kind,
        x: event.x, y: event.y, z: event.z, vx: event.vx, vy: event.vy, vz: event.vz,
        gravity: event.gravity, radius: event.radius, age: event.age,
      },
      // Do not remove this just because the latest snapshot has it: the
      // delayed render history can still be sampling the pre-spawn frame.
      expiresAt: this.now() + 600,
    });
  }

  private resetLife(spawnCount: number, x: number, z: number, yaw: number, pitch: number): void {
    this.spawnCount = spawnCount;
    this.pending = [];
    this.nextSeq = 1;
    this.acc = 0;
    this.sendAcc = 0;
    this.smoothDx = 0;
    this.smoothDz = 0;
    this.smoothUntil = 0;
    this.localFireCd = 0;
    this.cosmeticShot = null;
    this.predictedShots.clear();
    this.localGun = 1;
    this.localX = x;
    this.localZ = z;
    this.localYaw = yaw;
    this.localPitch = pitch;
  }

  private resetConnectionState(): void {
    this.connected = false;
    this.id = -1;
    this.seed = '';
    this.tick = 0;
    this.rtt = 0;
    this.closeReason = null;
    this.latest = null;
    this.snapshots = [];
    this.events = [];
    this.solid = null;
    this.view = null;
    this.spawnCount = -1;
    this.pending = [];
    this.nextSeq = 1;
    this.sendAcc = 0;
    this.pingAcc = 0;
    this.pingSentAt = 0;
    this.localX = 0;
    this.localZ = 0;
    this.localYaw = 0;
    this.localPitch = 0;
    this.acc = 0;
    this.smoothDx = 0;
    this.smoothDz = 0;
    this.smoothUntil = 0;
    this.localFireCd = 0;
    this.cosmeticShot = null;
    this.predictedShots.clear();
    this.earlyProjectiles.clear();
    this.localGun = 1;
    this.diedAt = null;
  }

  private reconcile(): void {
    const me = this.latest?.snap.players.find((p) => p.id === this.id);
    if (!me || !this.solid) return;
    if (!me.alive) {
      this.pending = [];
      this.localX = me.x;
      this.localZ = me.z;
      this.smoothDx = 0;
      this.smoothDz = 0;
      this.smoothUntil = 0;
      return;
    }
    const prevX = this.localX;
    const prevZ = this.localZ;
    this.pending = this.pending.filter((p) => p.seq > me.lastSeq);
    this.localX = me.x;
    this.localZ = me.z;
    this.localGun = me.gun;
    for (const p of this.pending) {
      if (p.input.switchGun !== null && !!(me.ownedMask & (1 << (p.input.switchGun - 1)))) this.localGun = p.input.switchGun;
      const speed = 6.5;
      const fx = -Math.sin(p.input.yaw), fz = -Math.cos(p.input.yaw);
      const rx = Math.cos(p.input.yaw), rz = -Math.sin(p.input.yaw);
      let dx = fx * p.input.moveZ + rx * p.input.moveX;
      let dz = fz * p.input.moveZ + rz * p.input.moveX;
      const len = Math.hypot(dx, dz);
      if (len > 1) { dx /= len; dz /= len; }
      const moved = moveCircle(this.solid, this.localX, this.localZ, dx * speed * STEP_DT, dz * speed * STEP_DT, PLAYER_RADIUS);
      this.localX = moved.x;
      this.localZ = moved.z;
    }
    const errX = prevX - this.localX;
    const errZ = prevZ - this.localZ;
    const err = Math.hypot(errX, errZ);
    if (err > 0.35) {
      this.smoothDx = 0;
      this.smoothDz = 0;
      this.smoothUntil = 0;
    } else {
      this.smoothDx = errX;
      this.smoothDz = errZ;
      this.smoothUntil = this.now() + 100;
    }
  }

  private interpolatedSnap(now: number): ArenaSnapshot | null {
    if (!this.latest || !this.snapshots.length) return null;
    const target = now - INTERP_MS;
    let after = this.snapshots.find((sample) => sample.at >= target) ?? this.snapshots[this.snapshots.length - 1]!;
    let before = this.snapshots[0]!;
    for (const sample of this.snapshots) {
      if (sample.at > target) break;
      before = sample;
    }
    if (after.at < before.at) after = before;
    const u = after.at === before.at ? 1 : Math.max(0, Math.min(1, (target - before.at) / (after.at - before.at)));
    const a = before.snap;
    const b = after.snap;
    return {
      tick: b.tick,
      players: b.players.map((p) => {
        const q = a.players.find((x) => x.id === p.id) ?? p;
        return {
          ...p,
          x: q.x + (p.x - q.x) * u,
          z: q.z + (p.z - q.z) * u,
          yaw: lerpAngle(q.yaw, p.yaw, u),
          pitch: lerpAngle(q.pitch, p.pitch, u),
        };
      }),
      projectiles: b.projectiles.map((p) => {
        const q = a.projectiles.find((x) => x.id === p.id) ?? p;
        return {
          ...p,
          x: q.x + (p.x - q.x) * u,
          y: q.y + (p.y - q.y) * u,
          z: q.z + (p.z - q.z) * u,
        };
      }),
      pickups: b.pickups,
    };
  }

  private rebuildView(): void {
    if (!this.solid || !this.latest) { this.view = null; return; }
    const me = this.latest.snap.players.find((p) => p.id === this.id);
    if (!me) { this.view = null; return; }
    const interp = this.interpolatedSnap(this.now());
    const now = this.now();
    const k = this.smoothUntil > now ? (this.smoothUntil - now) / 100 : 0;
    let sx = this.smoothDx * k;
    let sz = this.smoothDz * k;
    const slen = Math.hypot(sx, sz);
    if (slen > 0.35) {
      sx *= 0.35 / slen;
      sz *= 0.35 / slen;
    }
    if (!me.alive) {
      if (this.diedAt == null) this.diedAt = now;
    } else {
      this.diedAt = null;
    }
    const deathElapsed = this.diedAt == null ? 0 : (now - this.diedAt) / 1000;
    const player: PlayerState = {
      x: this.localX + sx,
      z: this.localZ + sz,
      yaw: this.localYaw,
      pitch: this.localPitch,
      hp: me.hp,
      maxHp: 100,
      gun: this.localGun,
      owned: maskToOwned(me.ownedMask),
      ammo: { ...me.ammo },
      fireCd: this.localFireCd,
      dryCd: 0,
      bloom: 0,
      useCd: 0,
    };
    const pickups: PickupEnt[] = this.solid.map.pickups.map((pk) => {
      const live = this.latest!.snap.pickups.find((p) => p.id === pk.id);
      return { ...pk, taken: live?.taken ?? false };
    });
    for (const [id, early] of this.earlyProjectiles) if (early.expiresAt <= now) this.earlyProjectiles.delete(id);
    const snapshotProjectiles = interp?.projectiles ?? [];
    const snapshotIds = new Set(snapshotProjectiles.map((p) => p.id));
    const projectiles: ProjectileEnt[] = [...snapshotProjectiles, ...[...this.earlyProjectiles.values()].map((entry) => entry.projectile).filter((p) => !snapshotIds.has(p.id))].map((p) => ({
      id: p.id, kind: p.kind, fromPlayer: true,
      x: p.x, y: p.y, z: p.z, vx: p.vx, vy: p.vy, vz: p.vz,
      gravity: p.gravity, radius: p.radius, damage: 0, splashRadius: 0, damageSelfPct: 0, age: p.age,
    }));
    const map = this.solid.map;
    const explored = new Uint8Array(map.w * map.h).fill(1);
    this.view = {
      map,
      player,
      phase: me.alive ? 'playing' : 'dying',
      phaseTimer: me.alive ? 0 : Math.max(0, ARENA_DEATH_LOCKOUT - deathElapsed),
      time: this.tick / 60,
      doors: [],
      secrets: [],
      sealIntact: false,
      enemies: [],
      pickups,
      projectiles,
      explored,
      secretCell: new Uint8Array(map.w * map.h),
      powerups: createPowerupState(),
      killCount: me.frags,
      arenaEntered: true,
      networkArena: true,
      hasKey: false,
      arenaEnemiesRemaining: () => 0,
    };
  }
}

function lerpAngle(a: number, b: number, u: number): number {
  const delta = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + delta * u;
}

function maskToOwned(mask: number): boolean[] {
  const owned = [false];
  for (let g = 1; g <= 7; g++) owned[g] = !!(mask & (1 << (g - 1)));
  return owned;
}
