// Static routing of the self-host server. The Cloudflare Worker and Netlify
// both serve directory indexes and extensionless paths out of the box; the
// Node adapter has to match them or /about/ and /robots.txt fall through to the
// SPA shell on a Docker or npx deployment.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { request } from 'node:http';
import { serve, type RunningServer } from '../../server/node/main';

const SHELL = '<!doctype html><canvas id="game-canvas"></canvas>';

let dir: string;
let server: RunningServer;
let base: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'sg-static-'));
  await writeFile(join(dir, 'index.html'), SHELL);
  await writeFile(join(dir, 'robots.txt'), 'User-agent: *\nAllow: /\n');
  await writeFile(join(dir, 'sitemap.xml'), '<urlset></urlset>');
  await mkdir(join(dir, 'about'));
  await writeFile(join(dir, 'about', 'index.html'), '<h1>ABOUT PAGE</h1>');

  server = serve({ port: 0, host: '127.0.0.1', clientDir: dir });
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await server?.shutdown();
  await rm(dir, { recursive: true, force: true });
});

describe('node static routing', () => {
  it('serves a directory index for /about/ and for the extensionless /about', async () => {
    for (const path of ['/about/', '/about']) {
      const res = await fetch(`${base}${path}`);
      expect(res.status, path).toBe(200);
      expect(await res.text(), path).toContain('ABOUT PAGE');
    }
  });

  it('serves the text files with real content types, not octet-stream', async () => {
    const robots = await fetch(`${base}/robots.txt`);
    expect(robots.headers.get('content-type')).toContain('text/plain');
    expect(await robots.text()).toContain('User-agent:');

    const sitemap = await fetch(`${base}/sitemap.xml`);
    expect(sitemap.headers.get('content-type')).toContain('xml');
  });

  it('keeps the SPA fallback for unknown paths', async () => {
    const res = await fetch(`${base}/no-such-page`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('game-canvas');
  });

  it('does not escape the client directory', async () => {
    // fetch() normalizes the path client-side, so this has to go out on a raw
    // socket or the server is never actually asked for a traversal.
    for (const path of ['/../../etc/passwd', '/about/../../../etc/passwd', '/%2e%2e/%2e%2e/etc/passwd']) {
      const body = await rawGet(path);
      expect(body, path).toContain('game-canvas');
      expect(body, path).not.toContain('root:');
    }
  });
});

function rawGet(path: string): Promise<string> {
  const { hostname, port } = new URL(base);
  return new Promise((resolve, reject) => {
    const req = request({ hostname, port, path, method: 'GET' }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.end();
  });
}
