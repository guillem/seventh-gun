// Game captures of authored areas from their manifests: a corner-to-corner
// view at eye level and an upward view across the room. Installed Chrome,
// pointer lock stubbed.
//   node tools/modern-art/capture_areas.mjs <baseURL> [idRegex]
import { chromium } from '@playwright/test';
import { readdirSync, readFileSync, existsSync, writeFileSync } from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:4173';
const only = process.argv[3] ? new RegExp(process.argv[3]) : null;
const areas = readdirSync('art/modern/areas')
  .filter(id => existsSync(`art/modern/areas/${id}/manifest.json`) && (!only || only.test(id)))
  .map(id => JSON.parse(readFileSync(`art/modern/areas/${id}/manifest.json`, 'utf8')));
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=metal', '--enable-gpu'] });
const results = [];
try {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  await page.addInitScript(() => {
    Element.prototype.requestPointerLock = () => Promise.resolve();
    // Count GPU submissions per frame, including WEBGL_multi_draw.
    const hook = window.__drawHook = { draws: 0, tris: 0 };
    const wrap = (proto, name, count) => {
      const original = proto[name];
      if (!original) return;
      proto[name] = function (...args) { hook.draws++; if (args[0] === 4) hook.tris += count(args) / 3; return original.apply(this, args); };
    };
    const gl = WebGL2RenderingContext.prototype;
    wrap(gl, 'drawElements', a => a[1]);
    wrap(gl, 'drawArrays', a => a[2]);
    wrap(gl, 'drawElementsInstanced', a => a[1] * a[4]);
    wrap(gl, 'drawArraysInstanced', a => a[2] * a[3]);
    const getExtension = gl.getExtension;
    gl.getExtension = function (name) {
      const ext = getExtension.call(this, name);
      if (name === 'WEBGL_multi_draw' && ext && !ext.__hooked) {
        const sum = (counts, offset, n) => { let t = 0; for (let i = 0; i < n; i++) t += counts[offset + i]; return t; };
        const proto = Object.getPrototypeOf(ext);
        wrap(proto, 'multiDrawElementsWEBGL', a => sum(a[1], a[2], a[a.length - 1]));
        ext.__hooked = true;
      }
      return ext;
    };
  });
  await page.goto(`${base}/?e2e=1`);
  await page.waitForFunction(() => !!window.__GAME__);
  for (const area of areas) {
    const n = Number(area.mapSeed.match(/campaign:(\d+)/)[1]);
    const drawn = await page.evaluate(async n => {
      const g = window.__GAME__;
      await g.loadCampaignAreas(n);
      g.startCampaign(n);
      return g.authoredAreas();
    }, n);
    await page.waitForTimeout(1500);
    const [x0, z0, x1, z1] = area.rects[0].map(v => v * 2);
    const views = [
      ['corner', x0 + 2.5, z0 + 2.5, x1 - 2.5, z1 - 2.5, -8],
      ['up', (x0 + x1) / 2, z1 - 2.5, (x0 + x1) / 2, z0, -32],
      ['back', x1 - 2.5, z1 - 2.5, x0 + 2.5, z0 + 2.5, -6],
    ];
    for (const [name, x, z, tx, tz, pitch] of views) {
      const yaw = Math.atan2(-(tx - x), -(tz - z)) * 180 / Math.PI;
      await page.evaluate(([x, z, yaw, pitch]) => {
        const g = window.__GAME__; g.unfreeze(); g.teleport(x, z); g.pose({ yaw, pitch }); g.tickNow();
      }, [x, z, yaw, pitch]);
      await page.waitForTimeout(600);
      const counts = await page.evaluate(async () => {
        const hook = window.__drawHook;
        await new Promise(r => requestAnimationFrame(r));
        hook.draws = 0; hook.tris = 0;
        let frames = 0;
        const until = performance.now() + 800;
        while (performance.now() < until) { await new Promise(r => requestAnimationFrame(r)); frames++; }
        return { drawsPerFrame: Math.round(hook.draws / frames), trianglesPerFrame: Math.round(hook.tris / frames) };
      });
      await page.screenshot({ path: `art/modern/areas/${area.id}/capture-${name}.png` });
      (area.counts ??= {})[name] = counts;
    }
    results.push({ id: area.id, drawn: drawn.includes(area.id), ...area.counts });
  }
} finally { await browser.close(); }
writeFileSync('/dev/stdout', JSON.stringify(results) + '\n');
