// Fixed-camera before/after captures and per-frame draw counts for the room
// vertical grammar pilot (Gullet + seeded mazes). Uses installed Chrome so
// WebGL runs on the GPU; the counts are for comparison between two builds on
// the same machine, not device benchmarks.
//   node tools/modern-art/capture_vertical_pilot.mjs <baseURL> <label> [outDir] [nameRegex]
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const base = process.argv[2] ?? 'http://localhost:4173';
const label = process.argv[3] ?? 'after';
const output = resolve(process.argv[4] ?? 'art/modern/vertical');
await mkdir(output, { recursive: true });

// [name, run, x, z, yawDeg, pitchDeg] in world metres; negative pitch looks up.
const VIEWS = [
  ['gullet-hall', { campaign: 2 }, 78, 32, -60, -8],
  ['gullet-hall-up', { campaign: 2 }, 80, 16, -50, -30],
  ['gullet-arena', { campaign: 2 }, 120, 72, -135, -5],
  ['gullet-arena-heart', { campaign: 2 }, 133, 90, 0, -14],
  ['gullet-arena-mouth', { campaign: 2 }, 121, 89, -130, -10],
  ['seed-1984-catacombs', { seed: '1984' }, 123, 47, -125, -10],
  ['seed-1984-ward', { seed: '1984' }, 26, 120, -135, -5],
  ['seed-1986-spire', { seed: '1986' }, 30, 58, -135, -10],
];
// Campaign rollout: stand 3 m inside a room corner (world-metre rect) and
// look across to the opposite corner, slightly upward.
const corner = (name, campaign, [x, z, w, h]) => {
  const dx = w - 6, dz = h - 6;
  return [name, { campaign }, x + 3, z + 3, Math.atan2(-dx, -dz) * 180 / Math.PI, -8];
};
VIEWS.push(
  corner('foundry-arena', 1, [108, 20, 30, 26]),
  corner('foundry-spur', 1, [44, 52, 18, 16]),
  corner('catacombs-crossing', 3, [76, 76, 24, 24]),
  corner('catacombs-arena', 3, [150, 44, 26, 26]),
  corner('pit-gallery', 4, [36, 8, 28, 18]),
  corner('pit-arena', 4, [84, 124, 28, 24]),
  corner('pit-courtyard', 4, [56, 68, 68, 52]),
  corner('spire-nave', 5, [96, 96, 28, 18]),
  corner('spire-arena', 5, [48, 8, 28, 24]),
  corner('ward-atrium', 6, [36, 72, 28, 28]),
  corner('ward-arena', 6, [118, 104, 36, 30]),
  corner('sanctum-chamber', 7, [64, 104, 44, 26]),
  corner('sanctum-shaft', 7, [76, 56, 24, 36]),
);
const only = process.argv[5] ? new RegExp(process.argv[5]) : null;

const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=metal', '--enable-gpu'] });
const report = { base, label, capturedAt: new Date().toISOString(), views: [] };
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  await page.addInitScript(() => {
    HTMLCanvasElement.prototype.requestPointerLock = () => Promise.resolve();
    // Count GPU submissions, including WEBGL_multi_draw (BatchedMesh).
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
        wrap(proto, 'multiDrawArraysWEBGL', a => sum(a[3], a[4], a[a.length - 1]));
        ext.__hooked = true;
      }
      return ext;
    };
  });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${base}/?e2e=1`);
  await page.waitForFunction(() => !!window.__GAME__);
  let current = '';
  for (const [name, run, x, z, yaw, pitch] of VIEWS.filter(([name]) => !only || only.test(name))) {
    const key = JSON.stringify(run);
    if (key !== current) {
      await page.evaluate(async r => {
        const g = window.__GAME__;
        if (r.campaign) {
          // Authored areas load per map, as the campaign UI does.
          if (g.loadCampaignAreas) await g.loadCampaignAreas(r.campaign);
          g.startCampaign(r.campaign);
        } else g.startRun(r.seed);
      }, run);
      await page.waitForTimeout(2500);
      current = key;
    }
    await page.evaluate(([x, z, yaw, pitch]) => {
      const g = window.__GAME__; g.unfreeze(); g.teleport(x, z); g.pose({ yaw, pitch }); g.tickNow();
    }, [x, z, yaw, pitch]);
    await page.waitForTimeout(700);
    const counts = await page.evaluate(async () => {
      const hook = window.__drawHook;
      await new Promise(r => requestAnimationFrame(r));
      hook.draws = 0; hook.tris = 0;
      let frames = 0;
      const until = performance.now() + 1000;
      while (performance.now() < until) { await new Promise(r => requestAnimationFrame(r)); frames++; }
      return { frames, drawsPerFrame: Math.round(hook.draws / frames), trianglesPerFrame: Math.round(hook.tris / frames), mapHash: window.__GAME__.mapHash() };
    });
    await page.screenshot({ path: `${output}/${label}-${name}.png` });
    report.views.push({ name, run, x, z, yaw, pitch, ...counts });
  }
  report.errors = errors;
  await writeFile(`${output}/${label}-report.json`, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report.views.map(v => [v.name, v.drawsPerFrame, v.trianglesPerFrame, v.mapHash])));
  if (errors.length) console.error(errors);
} finally { await browser.close(); }
