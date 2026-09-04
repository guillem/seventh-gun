// Probe the product, not just the Worker's independent /health route.
// Node 22+ supplies fetch and WebSocket; no build-time dependencies are needed.
import { pathToFileURL } from 'node:url';
export async function smokeDeployment(baseUrl, { timeoutMs = 8000 } = {}) {
  const base = new URL(baseUrl);
  if (!['http:', 'https:'].includes(base.protocol)) throw new Error('Expected an HTTP(S) game URL');
  const get = async (path) => {
    const response = await fetch(new URL(path, base), { signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
    return response;
  };
  if ((await (await get('/health')).text()).trim() !== 'ok') throw new Error('Unexpected health response');
  const html = await (await get('/')).text();
  if (!html.includes('game-canvas')) throw new Error('Game HTML is missing its canvas');
  const source = html.match(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/i)?.[1];
  if (!source) throw new Error('Game HTML has no JavaScript entry');
  const assetUrl = new URL(source, base);
  if (assetUrl.origin !== base.origin) throw new Error('Game entry must be a same-origin asset');
  const asset = await get(assetUrl);
  if (!/javascript/.test(asset.headers.get('content-type') ?? '') || !(await asset.text()).trim()) {
    throw new Error('JavaScript entry is empty or has the wrong content type');
  }

  const wsUrl = new URL('/arena', base);
  wsUrl.protocol = base.protocol === 'https:' ? 'wss:' : 'ws:';
  return await new Promise((resolve, reject) => {
    const socket = new WebSocket(wsUrl);
    let settled = false;
    let welcome = null;
    let firstTick = null;
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.close();
      if (error) reject(error); else resolve(result);
    };
    const timer = setTimeout(() => finish(new Error('Arena welcome/snapshot timeout')), timeoutMs);
    socket.addEventListener('open', () => socket.send(JSON.stringify({ v: 1, t: 'join', name: 'SMOKE' })));
    socket.addEventListener('error', () => finish(new Error('Arena WebSocket failed')));
    socket.addEventListener('close', () => finish(new Error('Arena closed before snapshots advanced')));
    socket.addEventListener('message', ({ data }) => {
      try {
        const message = JSON.parse(String(data));
        if (message.v !== 1) throw new Error('Unexpected arena protocol version');
        if (message.t === 'full') {
          finish(null, { asset: assetUrl.pathname, arena: 'full', snapshots: 'not checked: room at capacity' });
          return;
        }
        if (message.t === 'welcome') {
          if (!Number.isInteger(message.id) || typeof message.seed !== 'string' ||
              !message.snapshot?.players?.some((player) => player.id === message.id)) {
            throw new Error('Invalid arena welcome');
          }
          welcome = message;
        } else if (message.t === 'snap' && welcome) {
          const tick = message.snapshot?.tick;
          if (!Number.isInteger(tick)) throw new Error('Invalid snapshot tick');
          if (firstTick === null) firstTick = tick;
          else if (tick > firstTick) finish(null, { asset: assetUrl.pathname, firstTick, tick });
        }
      } catch (error) { finish(error); }
    });
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (!process.argv[2]) throw new Error('Usage: node scripts/smoke-deployment.mjs <game-url>');
    const result = await smokeDeployment(process.argv[2]);
    console.log(result.arena === 'full'
      ? 'Game assets and arena routing OK; room full, advancing snapshots not checked:'
      : 'Game assets, arena welcome and advancing snapshots OK:', result);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
