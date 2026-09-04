import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import WebSocket from 'ws';

const tarball = process.argv[2];
if (!tarball) throw new Error('Usage: node smoke-package.mjs <npm-pack-tarball>');
const dir = mkdtempSync(join(tmpdir(), 'seventh-gun-package-'));
const port = 18080 + Math.floor(Math.random() * 1000);
let child;
try {
  execFileSync('npm', ['install', '--ignore-scripts', '--no-package-lock', resolve(tarball)], { cwd: dir, stdio: 'inherit' });
  const cli = join(dir, 'node_modules', '.bin', 'seventh-gun');
  child = spawn(process.execPath, [cli, '--port', String(port), '--host', '127.0.0.1'], { stdio: 'pipe' });
  await Promise.race([once(child.stdout, 'data'), once(child, 'exit').then(([code]) => { throw new Error(`packed CLI exited early (${code})`); })]);
  if (!(await fetch(`http://127.0.0.1:${port}/health`)).ok) throw new Error('health endpoint failed');
  const html = await (await fetch(`http://127.0.0.1:${port}/`)).text();
  const asset = html.match(/src="([^"]+\.js)"/u)?.[1];
  if (!asset || !(await fetch(`http://127.0.0.1:${port}${asset}`)).ok) throw new Error('packed client asset was not served');
  if ((await fetch(`http://127.0.0.1:${port}/%zz`)).status !== 400) throw new Error('malformed request was not rejected');
  const binary = new WebSocket(`ws://127.0.0.1:${port}/arena`);
  await once(binary, 'open');
  binary.send(Buffer.from([1, 2, 3]));
  const [binaryCode] = await once(binary, 'close');
  if (binaryCode !== 1003) throw new Error(`binary arena frame closed with ${binaryCode}, expected 1003`);
  const connect = () => new Promise((resolveWelcome, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/arena`);
    ws.once('error', reject);
    ws.once('open', () => ws.send(JSON.stringify({ v: 1, t: 'join', name: 'smoke' })));
    ws.on('message', (raw) => {
      const message = JSON.parse(raw.toString());
      if (message.t === 'welcome') resolveWelcome({ ws, message });
    });
  });
  const [one, two] = await Promise.all([connect(), connect()]);
  if (one.message.seed !== two.message.seed || one.message.gridHash !== two.message.gridHash) throw new Error('clients did not join the same arena');
  one.ws.close(); two.ws.close();
  const occupied = spawn(process.execPath, [cli, '--port', String(port), '--host', '127.0.0.1']);
  const [code] = await once(occupied, 'exit');
  if (code === 0) throw new Error('packed CLI accepted an occupied port');
} finally {
  child?.kill();
  rmSync(dir, { recursive: true, force: true });
}
