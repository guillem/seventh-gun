import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
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
  const connect = () => new Promise((resolveWelcome, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/arena`);
    ws.once('error', reject);
    ws.once('open', () => ws.send(JSON.stringify({ v: 1, t: 'join', name: 'smoke' })));
    ws.on('message', (raw) => {
      const message = JSON.parse(raw.toString());
      if (message.t === 'welcome') resolveWelcome({ ws, message });
    });
  });
  const [one, two] = await deadline(Promise.all([connect(), connect()]), 'arena joins');
  if (one.message.seed !== two.message.seed || one.message.gridHash !== two.message.gridHash) throw new Error('clients did not join the same arena');
  one.ws.close(); two.ws.close();
  const occupied = spawn(process.execPath, [cli, '--port', String(port), '--host', '127.0.0.1']);
  const [code] = await deadline(once(occupied, 'exit'), 'occupied-port failure');
  if (code === 0) throw new Error('packed CLI accepted an occupied port');
} finally {
  child?.kill();
  rmSync(dir, { recursive: true, force: true });
}
