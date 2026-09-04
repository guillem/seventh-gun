import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { createConnection, createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import WebSocket from 'ws';

const tarball = process.argv[2];
if (!tarball) throw new Error('Usage: node smoke-package.mjs <npm-pack-tarball>');
const dir = mkdtempSync(join(tmpdir(), 'seventh-gun-package-'));
const deadline = (promise, label, ms = 10_000) => Promise.race([
  promise,
  new Promise((_, reject) => { const timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms); timer.unref(); }),
]);
const port = await new Promise((resolvePort, reject) => {
  const probe = createServer();
  probe.once('error', reject);
  probe.listen(0, '127.0.0.1', () => {
    const address = probe.address();
    probe.close(() => typeof address === 'object' && address ? resolvePort(address.port) : reject(new Error('no ephemeral port')));
  });
});
let child;
try {
  execFileSync('npm', ['install', '--ignore-scripts', '--no-package-lock', resolve(tarball)], { cwd: dir, stdio: 'inherit' });
  const cli = join(dir, 'node_modules', '.bin', 'seventh-gun');
  child = spawn(process.execPath, [cli, '--port', String(port), '--host', '127.0.0.1'], { stdio: 'pipe' });
  await deadline(Promise.race([once(child.stdout, 'data'), once(child, 'exit').then(([code]) => { throw new Error(`packed CLI exited early (${code})`); })]), 'packed CLI startup');
  if (!(await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(10_000) })).ok) throw new Error('health endpoint failed');
  const html = await (await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(10_000) })).text();
  const asset = html.match(/src="([^"]+\.js)"/u)?.[1];
  if (!asset || !(await fetch(`http://127.0.0.1:${port}${asset}`, { signal: AbortSignal.timeout(10_000) })).ok) throw new Error('packed client asset was not served');
  if ((await fetch(`http://127.0.0.1:${port}/%zz`, { signal: AbortSignal.timeout(10_000) })).status !== 400) throw new Error('malformed request was not rejected');
  const binary = new WebSocket(`ws://127.0.0.1:${port}/arena`);
  await deadline(once(binary, 'open'), 'binary frame open');
  binary.send(Buffer.from([1, 2, 3]));
  const [binaryCode] = await deadline(once(binary, 'close'), 'binary frame close');
  if (binaryCode !== 1003) throw new Error(`binary arena frame closed with ${binaryCode}, expected 1003`);
  const tooLarge = new WebSocket(`ws://127.0.0.1:${port}/arena`);
  await deadline(once(tooLarge, 'open'), 'oversized frame open');
  tooLarge.send('x'.repeat(2_049));
  const [tooLargeCode] = await deadline(once(tooLarge, 'close'), 'oversized frame close');
  if (tooLargeCode !== 1009) throw new Error(`oversized arena frame closed with ${tooLargeCode}, expected 1009`);
  const connect = (join = true) => new Promise((resolveWelcome, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/arena`);
    ws.once('error', reject);
    ws.once('open', () => {
      if (join) ws.send(JSON.stringify({ v: 1, t: 'join', name: 'smoke' }));
      else resolveWelcome({ ws, message: null });
    });
    ws.on('message', (raw) => {
      const message = JSON.parse(raw.toString());
      if (message.t === 'welcome') resolveWelcome({ ws, message });
    });
  });
  const [one, two] = await deadline(Promise.all([connect(), connect()]), 'arena joins');
  if (one.message.seed !== two.message.seed || one.message.gridHash !== two.message.gridHash) throw new Error('clients did not join the same arena');
  const occupied = spawn(process.execPath, [cli, '--port', String(port), '--host', '127.0.0.1']);
  const [code] = await deadline(once(occupied, 'exit'), 'occupied-port failure');
  if (code === 0) throw new Error('packed CLI accepted an occupied port');

  // Keep a raw upgraded connection open so it cannot acknowledge the close
  // handshake. The CLI must still leave within its one-second force deadline.
  const raw = createConnection({ port, host: '127.0.0.1' });
  await deadline(once(raw, 'connect'), 'raw WebSocket connect');
  raw.write('GET /arena HTTP/1.1\r\nHost: 127.0.0.1\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n');
  await deadline(new Promise((resolveUpgrade, reject) => {
    raw.once('data', (data) => String(data).startsWith('HTTP/1.1 101') ? resolveUpgrade() : reject(new Error('raw WebSocket upgrade failed')));
    raw.once('error', reject);
  }), 'raw WebSocket upgrade');
  const partialHttp = createConnection({ port, host: '127.0.0.1' });
  await deadline(once(partialHttp, 'connect'), 'partial HTTP connect');
  partialHttp.write('GET / HTTP/1.1\r\nHost: 127.0.0.1\r\n');
  const oneClosed = deadline(once(one.ws, 'close'), 'joined arena shutdown close', 3_000);
  const pending = new WebSocket(`ws://127.0.0.1:${port}/arena`);
  const pendingOpened = deadline(once(pending, 'open'), 'pending arena open');
  await pendingOpened;
  const pendingClosed = deadline(once(pending, 'close'), 'pending arena shutdown close', 3_000);
  const stoppedAt = Date.now();
  child.kill('SIGINT');
  const [oneCode] = await oneClosed;
  const [pendingCode] = await pendingClosed;
  const [exitCode] = await deadline(once(child, 'exit'), 'CLI SIGINT shutdown', 3_000);
  if (exitCode !== 0 || oneCode !== 1001 || pendingCode !== 1001) throw new Error('CLI did not close arena clients cooperatively on SIGINT');
  if (Date.now() - stoppedAt < 900 || Date.now() - stoppedAt > 2_500) throw new Error('unresponsive WebSocket force deadline was not enforced');
  raw.destroy();
  partialHttp.destroy();

  const { serve } = await import(join(dir, 'node_modules', 'seventh-gun', 'dist', 'node', 'server.mjs'));
  const apiServer = serve({ port: 0, host: '127.0.0.1', clientDir: join(dir, 'node_modules', 'seventh-gun', 'dist', 'client') });
  await deadline(once(apiServer, 'listening'), 'API shutdown server startup');
  const firstShutdown = apiServer.shutdown();
  if (apiServer.shutdown() !== firstShutdown) throw new Error('shutdown() is not idempotent');
  await deadline(firstShutdown, 'repeated API shutdown');
} finally {
  child?.kill();
  rmSync(dir, { recursive: true, force: true });
}
