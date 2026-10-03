// Local browser-only probes; normal AA/DPR/composer, a fresh context each run.
import { chromium } from '@playwright/test';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
const base = process.argv[2] ?? 'http://127.0.0.1:5177';
const output = resolve(process.argv[3] ?? 'art/modern/continuity/after');
const baseline = process.env.BASELINE === '1';
const baselineRef = process.env.BASELINE_REF ?? '59ade532a5494f9740688638c17efdc94d9aa272';
const portrait = process.env.PORTRAIT === '1';
const baselineFiles = ['renderer', 'fx', 'foundryLighting'];
if (baseline) for (const file of baselineFiles) {
  await writeFile(new URL(`../src/render/__${file}Baseline.ts`, import.meta.url), execFileSync('git', ['show', `${baselineRef}:src/render/${file}.ts`]));
}
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: portrait ? { width: 390, height: 844 } : { width: 1440, height: 900 }, deviceScaleFactor: 2, isMobile: portrait, hasTouch: portrait });
const report = { base, baseline, ...(baseline ? { baselineRef } : {}), portrait, capturedAt: new Date().toISOString(), errors: [], stages: [], limitations: ['One local Apple GPU/browser run, not a universal frame-time guarantee; portrait uses the same desktop GPU.', 'Browser-only instrumentation exposes the normal running game and counts WebGL calls; no GPU synchronization queries.', 'Baseline overrides renderer/FX/lighting TypeScript from baselineRef but uses the current assets; comparison measures rendering behavior, not geometry before/after.'] };
page.on('pageerror', e => report.errors.push(e.message));
await page.route(/\/src\/main\.ts(?:\?.*)?$/, async route => {
  const response = await route.fetch();
  await route.fulfill({ response, body: (await response.text()).replace('const game = new Game(canvas, e2e);', 'const game = new Game(canvas, e2e); window.__normalGame = game;') });
});
// The same probe also checks the deployed/minified build. Instrument only its
// bootstrap assignment; keep all game code and rendering options unchanged.
await page.route(/\/assets\/index-[^/]+\.js(?:\?.*)?$/, async route => {
  const response = await route.fetch(), source = await response.text();
  if (!source.includes('[seventh-gun] e2e debug api enabled')) { await route.fulfill({ response }); return; }
  const anchor = /const ([\w$]+)=new [\w$]+\([^;]+?\);(?=[\w$]+\.remove\(\),[\w$]+&&\(window\.__GAME__=\1\.getDebugApi\(\))/;
  if (!anchor.test(source)) throw new Error('Built game bootstrap probe anchor unavailable');
  await route.fulfill({ response, body: source.replace(anchor, (match, name) => `${match}window.__normalGame=${name};`) });
});
if (baseline) for (const file of baselineFiles) await page.route(new RegExp(`/src/render/${file}\\.ts(?:\\?.*)?$`), async route => {
  const response = await route.fetch({ url: `${base}/src/render/__${file}Baseline.ts` });
  await route.fulfill({ response });
});
await page.addInitScript(() => {
  const probe = window.__cold = { stage: 'boot', events: [], frames: [], last: 0 };
  for (const name of ['createProgram', 'linkProgram', 'texImage2D', 'texSubImage2D', 'bufferData']) {
    const original = WebGL2RenderingContext.prototype[name];
    WebGL2RenderingContext.prototype[name] = function (...args) {
      const time = performance.now(); const value = original.apply(this, args);
      // Animated skeleton matrices legitimately upload every frame. Separate
      // those typed buffers from one-off bitmap/canvas image uploads.
      const imageUpload = name.startsWith('tex') && args.some(v => v instanceof ImageBitmap || v instanceof HTMLImageElement || v instanceof HTMLCanvasElement);
      probe.events.push({ stage: probe.stage, name, imageUpload, ms: performance.now() - time }); return value;
    };
  }
  function frame(time) {
    if (probe.last) probe.frames.push({ stage: probe.stage, ms: time - probe.last });
    probe.last = time; requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
});
async function stage(name, action) {
  await page.evaluate(name => { window.__cold.stage = name; }, name);
  await action(); await page.waitForTimeout(1100);
  // Drain frames after a blocking driver compile; a wall-clock timer can fire
  // before the next rAF records the long gap.
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const state = await page.evaluate(() => {
    const game = window.__normalGame, r = game.renderer, c = window.__cold;
    const frames = c.frames.filter(v => v.stage === c.stage).map(v => v.ms).sort((a,b) => a-b);
    const events = c.events.filter(v => v.stage === c.stage);
    const lights = []; r.scene.traverseVisible(o => { if (o.isLight && o !== r.torch && o.parent?.name !== 'fx-light-pool') lights.push({ type: o.type, p: o.position.toArray(), intensity: o.intensity, color: o.color.getHex(), shadow: o.castShadow }); });
    return { name: c.stage, frameCount: frames.length, maxFrameMs: frames.at(-1), p95FrameMs: frames[Math.floor(frames.length * .95)],
      calls: Object.fromEntries(['createProgram','linkProgram','texImage2D','texSubImage2D','bufferData'].map(n => [n, events.filter(e => e.name === n).length])),
      programs: r.renderer.info.programs.length, lights, environmentIntensity: r.scene.environmentIntensity,
      assetImageUploads: events.filter(e => e.imageUpload).length,
      gun: game.sim?.player.gun,
      player: { x: game.sim?.player.x, z: game.sim?.player.z }, render: r.debugStats };
  });
  report.stages.push(state); console.log(JSON.stringify({ ...state, lights: state.lights.length }));
  if (name.includes('room') || name === 'hall') await page.screenshot({ path: `${output}/${name}.jpg`, quality: 90 });
}
try {
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__normalGame, null, { timeout: 90000 });
  await stage('start', async () => {
    const play = page.getByRole('button', { name: 'PLAY THE FOUNDRY' });
    if (portrait) await play.tap(); else await play.click({ timeout: 90000 });
    await page.waitForFunction(() => window.__normalGame.phase === 'playing' && !window.__normalGame.preparingWorld, null, { timeout: 90000 });
  });
  report.context = await page.evaluate(() => { const r = window.__normalGame.renderer, gl = r.renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info'); return { attributes: gl.getContextAttributes(), gpu: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : '', debugApiAbsent: !window.__GAME__, size: [gl.drawingBufferWidth,gl.drawingBufferHeight] }; });
  const fire = async () => {
    if (portrait) { await page.locator('#btn-fire').tap(); return; }
    await page.mouse.down(); await page.waitForTimeout(80); await page.mouse.up();
  };
  await stage('first-shot', fire);
  await stage('second-shot', fire);
  await stage('hall', () => page.evaluate(() => { const game = window.__normalGame; game.getDebugApi().teleport(60,95.7); game.getDebugApi().pose({ yaw: 20, pitch: 0 }); }));
  await stage('first-room-boundary', () => page.evaluate(() => window.__normalGame.getDebugApi().teleport(60,96.3)));
  await stage('room-interior', () => page.evaluate(() => { const api = window.__normalGame.getDebugApi(); api.teleport(60,109); api.pose({ yaw: 180 }); }));
  await stage('return-room-boundary', () => page.evaluate(() => { const api = window.__normalGame.getDebugApi(); api.teleport(60,95.7); api.pose({ yaw: 20 }); }));
  await stage('room-from-outside', () => page.evaluate(() => { const api = window.__normalGame.getDebugApi(); api.teleport(60,93); api.pose({ yaw: 180 }); }));
  if (!baseline) {
    const transitions = report.stages.filter(s => s.name !== 'start');
    for (const row of transitions) {
      if (row.calls.createProgram) throw new Error(`${row.name}: ${row.calls.createProgram} new GPU programs after preparation`);
      if (row.assetImageUploads || row.calls.bufferData) throw new Error(`${row.name}: unprepared image/vertex resources`);
    }
    const hall = report.stages.find(s => s.name === 'hall');
    for (const row of report.stages.filter(s => s.name.includes('room'))) {
      if (JSON.stringify(row.lights) !== JSON.stringify(hall.lights) || row.environmentIntensity !== hall.environmentIntensity) {
        throw new Error(`${row.name}: stationary room lighting changed with the player position`);
      }
    }
    for (let gun = 1; gun <= 7; gun++) {
      await stage(`first-gun-${gun}-effect`, () => page.evaluate(gun => {
        const game = window.__normalGame, api = game.getDebugApi();
        api.teleport(19,87); api.pose({ gun, yaw: 270, pitch: 0 });
        game.sim.player.fireCd = 0; api.shoot(); api.step(1);
      }, gun));
      const row = report.stages.at(-1);
      if (row.calls.createProgram || row.assetImageUploads || row.calls.bufferData) throw new Error(`${row.name}: GPU resources were not prepared`);
    }
  }
  if (report.errors.length) throw new Error(report.errors.join('\n'));
} catch (error) { report.failure = error.stack ?? String(error); process.exitCode = 1; }
finally {
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2) + '\n'); await browser.close();
  if (baseline) for (const file of baselineFiles) await unlink(new URL(`../src/render/__${file}Baseline.ts`, import.meta.url));
  console.log(JSON.stringify({ output, failure: report.failure }));
}
