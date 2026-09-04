import { ArenaSim } from '../src/sim/arena';
import { ARENA_GEN_VERSION, ARENA_SNAPSHOT_HZ, ARENA_TICK_HZ } from '../src/sim/arenaConstants';
import { arenaGridHash } from '../src/sim/arenagen';
import { STEP_DT } from '../src/sim/sim';
import { decodeClient, encode, type ServerMessage } from '../src/net/protocol';

export interface RoomSocket {
  send(text: string): void;
  close(code?: number, reason?: string): void;
}

export interface TickScheduler {
  start(fn: () => void, hz: number): void;
  stop(): void;
  timeout(fn: () => void, ms: number): () => void;
}

const MAX_MSG = 2048;
const MAX_MSG_PER_S = 40;
const SOCKET_IDLE_S = 15;
const SNAP_EVERY = Math.round(ARENA_TICK_HZ / ARENA_SNAPSHOT_HZ);

interface SockState {
  sock: RoomSocket;
  playerId: number | null;
  msgTimes: number[];
  lastMsgAt: number;
  violations: number;
  cancelJoinWatch: (() => void) | null;
}

export class ArenaRoom {
  sim: ArenaSim | null = null;
  private seed = '';
  private socks = new Map<RoomSocket, SockState>();
  private ticking = false;

  constructor(
    private now: () => number,
    private randomSeed: () => string,
    private schedule: TickScheduler,
  ) {}

  get playerCount(): number {
    return this.sim?.players.length ?? 0;
  }

  onOpen(sock: RoomSocket): void {
    const st: SockState = {
      sock,
      playerId: null,
      msgTimes: [],
      lastMsgAt: this.now(),
      violations: 0,
      cancelJoinWatch: null,
    };
    this.socks.set(sock, st);
    // Never-joined sockets must not keep the DO resident — empty or occupied.
    st.cancelJoinWatch = this.schedule.timeout(() => {
      const cur = this.socks.get(sock);
      if (cur && cur.playerId == null) {
        sock.close(4000, 'idle');
        this.onClose(sock);
      }
    }, SOCKET_IDLE_S * 1000);
  }

  onMessage(sock: RoomSocket, text: string): void {
    const st = this.socks.get(sock);
    if (!st) return;
    const t = this.now();
    st.lastMsgAt = t;

    if (text.length > MAX_MSG) {
      this.noteViolation(st);
      return;
    }

    st.msgTimes = st.msgTimes.filter((x) => t - x < 1000);
    st.msgTimes.push(t);
    if (st.msgTimes.length > MAX_MSG_PER_S) {
      this.noteViolation(st);
      return;
    }

    const msg = decodeClient(text);
    if (msg === 'bad-v') {
      sock.close(4000, 'protocol');
      return;
    }
    if (msg === 'unknown') return;
    if (msg === 'invalid') {
      this.noteViolation(st);
      return;
    }

    if (msg.t === 'join') {
      this.handleJoin(st, msg.name);
      return;
    }
    if (msg.t === 'ping') {
      this.send(sock, { v: 1, t: 'pong', at: msg.at, serverTime: t });
      return;
    }
    if (msg.t === 'input') {
      if (st.playerId == null || !this.sim) return;
      this.sim.pushInput(st.playerId, msg.seq, msg.inputs);
    }
  }

  onClose(sock: RoomSocket): void {
    const st = this.socks.get(sock);
    if (!st) return;
    st.cancelJoinWatch?.();
    this.socks.delete(sock);
    if (st.playerId != null && this.sim) this.sim.leave(st.playerId);
    if (this.playerCount === 0) this.shutdown();
  }

  tick(): void {
    if (!this.sim) return;
    this.sim.step(STEP_DT);

    const t = this.now();
    for (const st of [...this.socks.values()]) {
      // A prior cleanup in this copied iteration may have stopped the room.
      if (!this.sim) break;
      if (t - st.lastMsgAt > SOCKET_IDLE_S * 1000) {
        st.sock.close(4000, 'idle');
        this.onClose(st.sock);
        continue;
      }
      // Closing the last player tears the simulation down. A copied socket
      // list can still contain a pending socket after that, so never retain a
      // stale simulation reference across cleanup.
      const sim = this.sim;
      const p = sim.players.find((pp) => pp.id === st.playerId);
      if (p?.kicked) {
        this.send(st.sock, { v: 1, t: 'kicked', reason: 'idle' });
        st.sock.close(4000, 'idle');
        this.onClose(st.sock);
      }
    }

    if (!this.sim) return;
    const events = this.sim.takeEvents();
    if (events.length) {
      this.broadcast({ v: 1, t: 'events', es: events });
    }
    // A failed event send can disconnect the final player and stop the room.
    if (!this.sim) return;
    if (this.sim.tick % SNAP_EVERY === 0) {
      this.broadcast({ v: 1, t: 'snap', snapshot: this.sim.snapshot() });
    }
  }

  private handleJoin(st: SockState, name: string): void {
    // One WebSocket owns at most one player. This also makes an accidental
    // duplicate JOIN harmless if a client retries while a welcome is in flight.
    if (st.playerId != null) return;
    if (!this.sim) {
      this.seed = this.randomSeed();
      this.sim = new ArenaSim(this.seed);
      this.startTicks();
    }
    const joined = this.sim.join(name);
    if (joined === 'full') {
      this.send(st.sock, { v: 1, t: 'full' });
      st.sock.close(4000, 'full');
      this.onClose(st.sock);
      return;
    }
    st.playerId = joined.id;
    st.cancelJoinWatch?.();
    st.cancelJoinWatch = null;
    const map = this.sim.map;
    this.send(st.sock, {
      v: 1,
      t: 'welcome',
      id: joined.id,
      seed: this.seed,
      genVersion: ARENA_GEN_VERSION,
      gridHash: arenaGridHash(map.grid, map.pickups),
      tick: this.sim.tick,
      snapshot: this.sim.snapshot(),
    });
  }

  private startTicks(): void {
    if (this.ticking) return;
    this.ticking = true;
    this.schedule.start(() => this.tick(), ARENA_TICK_HZ);
  }

  private shutdown(): void {
    this.sim = null;
    this.seed = '';
    this.ticking = false;
    this.schedule.stop();
    // Keep pre-join sockets alive until their own short join watchdog fires.
    // A new JOIN may have arrived as the old final player disconnected.
  }

  private noteViolation(st: SockState): void {
    st.violations++;
    if (st.violations >= 3) {
      this.send(st.sock, { v: 1, t: 'kicked', reason: 'protocol' });
      st.sock.close(4000, 'protocol');
      this.onClose(st.sock);
    }
  }

  private send(sock: RoomSocket, msg: ServerMessage): void {
    const st = this.socks.get(sock);
    if (!st) return;
    try {
      sock.send(encode(msg));
    } catch {
      // Some runtime socket adapters throw once a peer has gone away. Treat
      // that exactly like a close, without allowing one bad peer to kill a tick.
      this.onClose(sock);
      try { sock.close(1011, 'send failed'); } catch { /* already closed */ }
    }
  }

  private broadcast(msg: ServerMessage): void {
    for (const st of [...this.socks.values()]) this.send(st.sock, msg);
  }
}
