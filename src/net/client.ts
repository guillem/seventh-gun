import { generateArena, arenaGridHash } from '../sim/arenagen';
import { ARENA_DEATH_LOCKOUT, ARENA_GEN_VERSION, ARENA_INPUT_HZ } from '../sim/arenaConstants';
import type { ArenaEvent, ArenaSnapshot } from '../sim/arena';
import { STEP_DT, type PickupEnt, type PlayerState, type ProjectileEnt, type SimInput } from '../sim/sim';
import { createPowerupState } from '../sim/powerups';
import { moveCircle, type SolidState } from '../sim/physics';
import { PLAYER_RADIUS } from '../sim/types';
import { WEAPONS } from '../sim/weapons';
import type { WorldView } from '../sim/view';
import { decodeServer, encode, type ServerMessage } from './protocol';

export type ArenaConnectError = 'full' | 'offline' | 'mismatch';

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
  rtt = 0;
  closeReason: string | null = null;
  onClose: ((reason: string) => void) | null = null;

  private sock: ArenaNetSocket | null = null;
  private latest: { snap: ArenaSnapshot; at: number } | null = null;
  private previous: { snap: ArenaSnapshot; at: number } | null = null;
  private events: ArenaEvent[] = [];
  private pending: { seq: number; input: SimInput }[] = [];
  private nextSeq = 1;
  private lastSentSeq = 0;
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
  private lastShotSeq = 0;
  private pingSentAt = 0;
  private localFireCd = 0;
  private cosmeticShot: { gun: number; x: number; z: number; yaw: number } | null = null;
  private echoShotUntil = 0;
  private diedAt: number | null = null;
  private cancelPendingConnect: (() => void) | null = null;

  constructor(private socketFactory: SocketFactory = (url) => new WebSocket(url) as unknown as ArenaNetSocket) {}

  async connect(url: string, name: string, timeoutMs = CONNECT_TIMEOUT_MS): Promise<void> {
    this.close();
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
        this.send({ v: 1, t: 'join', name });
      });
      sock.addEventListener('message', (ev) => {
        if (!isCurrent()) return;
        const msg = decodeServer(String(ev.data));
        if (msg === 'bad-v' || msg === 'invalid' || msg === 'unknown') {
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
          this.applySnap(msg.snapshot, performance.now());
          const me = msg.snapshot.players.find((p) => p.id === this.id);
          if (me) { this.localX = me.x; this.localZ = me.z; }
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

  shouldIgnoreEchoShot(actorId: number): boolean {
    return actorId === this.id && performance.now() < this.echoShotUntil;
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
      this.pingSentAt = performance.now();
      this.send({ v: 1, t: 'ping', at: this.pingSentAt });
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

  others(now = performance.now()): {
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
  ingestSnapshot(snap: ArenaSnapshot, at = performance.now()): void {
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
    const gun = me?.gun ?? 1;
    const w = WEAPONS[gun - 1];
    const ammo = w ? (me?.ammo[w.ammo] ?? 0) : 0;
    if (clamped.fire && this.localFireCd <= 0 && me?.alive && ammo > 0 && w) {
      this.cosmeticShot = { gun, x: this.localX, z: this.localZ, yaw: clamped.yaw };
      this.echoShotUntil = performance.now() + 220;
      this.lastShotSeq = seq;
      this.localFireCd = w.fireInterval;
    }
  }

  private flushInputs(): void {
    if (!this.sock || !this.pending.length) return;
    const fresh = this.pending.filter((p) => p.seq > this.lastSentSeq);
    const batch = (fresh.length ? fresh : this.pending).slice(0, 8);
    if (!batch.length) return;
    this.send({ v: 1, t: 'input', seq: batch[0]!.seq, inputs: batch.map((b) => b.input) });
    this.lastSentSeq = batch[batch.length - 1]!.seq;
  }

  private handleMessage(msg: ServerMessage): void {
    if (msg.t === 'snap') {
      this.applySnap(msg.snapshot, performance.now());
      this.reconcile();
      this.rebuildView();
    } else if (msg.t === 'events') {
      this.events.push(...msg.es);
    } else if (msg.t === 'pong') {
      this.rtt = Math.max(0, performance.now() - msg.at);
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

  private applySnap(snap: ArenaSnapshot, at: number): void {
    this.previous = this.latest;
    this.latest = { snap, at };
    this.tick = snap.tick;
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
    for (const p of this.pending) {
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
      this.smoothUntil = performance.now() + 100;
    }
  }

  private interpolatedSnap(now: number): ArenaSnapshot | null {
    if (!this.latest) return null;
    if (!this.previous) return this.latest.snap;
    const target = now - INTERP_MS;
    const t0 = this.previous.at;
    const t1 = this.latest.at;
    const u = t1 === t0 ? 1 : Math.max(0, Math.min(1, (target - t0) / (t1 - t0)));
    const a = this.previous.snap;
    const b = this.latest.snap;
    return {
      tick: b.tick,
      players: b.players.map((p) => {
        const q = a.players.find((x) => x.id === p.id) ?? p;
        return { ...p, x: q.x + (p.x - q.x) * u, z: q.z + (p.z - q.z) * u };
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
    const interp = this.interpolatedSnap(performance.now());
    const now = performance.now();
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
      gun: me.gun,
      owned: maskToOwned(me.ownedMask),
      ammo: { ...me.ammo },
      fireCd: 0,
      dryCd: 0,
      bloom: 0,
      useCd: 0,
    };
    const pickups: PickupEnt[] = this.solid.map.pickups.map((pk) => {
      const live = this.latest!.snap.pickups.find((p) => p.id === pk.id);
      return { ...pk, taken: live?.taken ?? false };
    });
    const projectiles: ProjectileEnt[] = (interp?.projectiles ?? []).map((p) => ({
      id: p.id, kind: p.kind, fromPlayer: true,
      x: p.x, y: p.y, z: p.z, vx: 0, vy: 0, vz: 0,
      gravity: 0, radius: 0.2, damage: 0, splashRadius: 0, damageSelfPct: 0, age: 0,
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
      hasKey: false,
      arenaEnemiesRemaining: () => 0,
    };
  }
}

function maskToOwned(mask: number): boolean[] {
  const owned = [false];
  for (let g = 1; g <= 7; g++) owned[g] = !!(mask & (1 << (g - 1)));
  return owned;
}
