import { ArenaRoom } from './room';
import { intervalScheduler } from './scheduler';

export interface Env {
  ARENA: DurableObjectNamespace;
  ASSETS: Fetcher;
  ALLOWED_ORIGINS: string;
}

function originAllowed(req: Request, env: Env): boolean {
  const origin = req.headers.get('Origin');
  if (!origin) return true;
  try {
    const o = new URL(origin);
    const h = new URL(req.url);
    if (o.host === h.host) return true;
  } catch { /* ignore */ }
  const extra = (env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  return extra.includes(origin);
}

export class ArenaRoomDO {
  private room = new ArenaRoom(
    () => Date.now(),
    () => crypto.randomUUID().slice(0, 8),
    intervalScheduler(),
  );

  constructor(_ctx: DurableObjectState, _env: Env) {}

  async fetch(req: Request): Promise<Response> {
    if (req.headers.get('Upgrade') !== 'websocket') {
      return new Response(null, { status: 426 });
    }
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    server.accept();
    server.addEventListener('message', (e) => this.room.onMessage(server, String((e as MessageEvent).data)));
    server.addEventListener('close', () => this.room.onClose(server));
    server.addEventListener('error', () => this.room.onClose(server));
    this.room.onOpen(server);
    return new Response(null, { status: 101, webSocket: client });
  }
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === '/health') return new Response('ok');
    if (url.pathname === '/arena') {
      if (!originAllowed(req, env)) return new Response('forbidden', { status: 403 });
      return env.ARENA.get(env.ARENA.idFromName('global')).fetch(req);
    }
    return env.ASSETS.fetch(req);
  },
};
