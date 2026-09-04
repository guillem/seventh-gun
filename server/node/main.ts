// Self-host entry: the same arena the Cloudflare Worker runs, on plain Node.
//
// ArenaRoom (server/room.ts) is runtime-agnostic by construction — it takes its
// clock, seed source and scheduler by injection and talks to clients through a
// two-method RoomSocket interface. Nothing here reimplements game logic; this
// file only supplies a Node flavour of what server/index.ts supplies from
// Cloudflare: an HTTP server for the static client, and a WebSocket upgrade on
// /arena. One process, one global room — the same topology as idFromName('global').

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, type WebSocket } from 'ws';
import { ArenaRoom, type RoomSocket } from '../room';
import { intervalScheduler } from '../scheduler';

export interface ServeOptions {
  port?: number;
  host?: string;
  clientDir?: string;
  allowedOrigins?: string;
}

// The arena protocol is JSON and ArenaRoom rejects messages larger than 2 KiB.
// Keep the same bound at the transport edge so a peer cannot make ws allocate a
// 100 MiB buffer before the room gets a chance to reject it.
export const ARENA_MAX_PAYLOAD = 2 * 1024;

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
};

/**
 * Pathname, or null if the request line or Host header is malformed. Both
 * `new URL()` and `decodeURIComponent()` throw on junk input, and a throw
 * inside a Node request listener takes the whole process down — which on a
 * self-hosted box means one bad request ends everyone's game.
 */
export function safePathname(url: string | undefined, host: string | undefined): string | null {
  try {
    return decodeURIComponent(new URL(url ?? '/', `http://${host ?? 'localhost'}`).pathname);
  } catch {
    return null;
  }
}

/** Mirrors server/index.ts: same-host is always fine, extras come from config. */
export function originAllowed(req: IncomingMessage, allowed: string[]): boolean {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    if (new URL(origin).host === req.headers.host) return true;
  } catch {
    /* malformed Origin — fall through to the explicit list */
  }
  return allowed.includes(origin);
}

/** ws WebSocket -> the two methods ArenaRoom actually needs. */
export function toRoomSocket(ws: WebSocket): RoomSocket {
  return {
    send(text) {
      if (ws.readyState === ws.OPEN) ws.send(text);
    },
    close(code, reason) {
      try {
        ws.close(code, reason);
      } catch {
        ws.terminate();
      }
    },
  };
}

function lanUrls(port: number): string[] {
  const out: string[] = [];
  for (const addrs of Object.values(networkInterfaces())) {
    for (const a of addrs ?? []) {
      if (a.family === 'IPv4' && !a.internal) out.push(`http://${a.address}:${port}`);
    }
  }
  return out;
}

function defaultClientDir(): string {
  // dist/node/server.mjs -> dist/client
  return resolve(fileURLToPath(new URL('.', import.meta.url)), '../client');
}

export function serve(opts: ServeOptions = {}) {
  const port = opts.port ?? Number(process.env.PORT ?? 8080);
  const host = opts.host ?? process.env.HOST ?? '0.0.0.0';
  const clientDir = resolve(opts.clientDir ?? process.env.CLIENT_DIR ?? defaultClientDir());
  const allowed = (opts.allowedOrigins ?? process.env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (!existsSync(join(clientDir, 'index.html'))) {
    throw new Error(
      `No client build at ${clientDir}\n` +
        `Run \`npm run build:dist\` first, or point CLIENT_DIR at a built dist/client.`,
    );
  }

  const room = new ArenaRoom(
    () => Date.now(),
    () => crypto.randomUUID().slice(0, 8),
    intervalScheduler(),
  );

  const sendFile = (res: ServerResponse, file: string, immutable: boolean) => {
    res.writeHead(200, {
      'Content-Type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
    });
    const stream = createReadStream(file);
    // Headers are already out by now, so there is nothing to say — just stop.
    stream.on('error', () => res.destroy());
    stream.pipe(res);
  };

  const server = createServer((req, res) => {
    try {
      const pathname = safePathname(req.url, req.headers.host);
      if (pathname === null) {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('bad request');
        return;
      }

      if (pathname === '/health') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('ok');
        return;
      }

      // Resolve inside clientDir only — normalize() collapses any ../ traversal.
      const rel = normalize(pathname).replace(/^(\.\.[/\\])+/, '');
      const file = join(clientDir, rel);
      if (file.startsWith(clientDir) && existsSync(file) && statSync(file).isFile()) {
        sendFile(res, file, pathname.startsWith('/assets/'));
        return;
      }

      // SPA fallback, matching the Worker's not_found_handling.
      sendFile(res, join(clientDir, 'index.html'), false);
    } catch {
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('server error');
      } else {
        res.destroy();
      }
    }
  });

  // Garbage on the socket before a request is even parsed.
  server.on('clientError', (_err, socket) => {
    if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
    socket.destroy();
  });

  const wss = new WebSocketServer({ noServer: true, maxPayload: ARENA_MAX_PAYLOAD });

  server.on('upgrade', (req, socket, head) => {
    if (safePathname(req.url, req.headers.host) !== '/arena') {
      socket.destroy();
      return;
    }
    if (!originAllowed(req, allowed)) {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      const sock = toRoomSocket(ws);
      ws.on('message', (data, isBinary) => {
        // `String(Buffer)` would turn binary data into arbitrary text before
        // protocol validation. There is no binary arena protocol, so reject it
        // explicitly and keep the room's input boundary text-only.
        if (isBinary) {
          sock.close(1003, 'binary arena messages are not supported');
          return;
        }
        room.onMessage(sock, data.toString());
      });
      ws.on('close', () => room.onClose(sock));
      ws.on('error', () => room.onClose(sock));
      room.onOpen(sock);
    });
  });

  server.listen(port, host, () => {
    const lines = [`  local    http://localhost:${port}`, ...lanUrls(port).map((u) => `  network  ${u}`)];
    process.stdout.write(
      `\nSEVENTH GUN is running.\n\n${lines.join('\n')}\n\n` +
        `Anyone on your network can open a network URL and join MULTIPLAYER ARENA.\nCtrl-C to stop.\n\n`,
    );
  });

  return server;
}
