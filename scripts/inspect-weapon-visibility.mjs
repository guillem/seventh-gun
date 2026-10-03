// Observe actual fragment visibility with normal AA/DPR and real game frames.
// Browser-only main-module instrumentation exposes the running instance; the
// delivered app/debug API is unchanged. This is not a performance benchmark.
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const base = process.argv[2] ?? 'http://127.0.0.1:5176';
const output = resolve(process.argv[3] ?? 'art/modern/roster/weapon-visibility');
const portrait = process.env.PORTRAIT === '1';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: portrait ? { width: 390, height: 844 } : { width: 1440, height: 900 }, deviceScaleFactor: 2,
  isMobile: portrait, hasTouch: portrait });
const cdp = portrait ? await page.context().newCDPSession(page) : null;
async function fire(down) {
  if (!cdp) return down ? page.mouse.down() : page.mouse.up();
  const button = await page.locator('#btn-fire').boundingBox();
  if (!button) throw new Error('Portrait fire control is unavailable');
  await cdp.send('Input.dispatchTouchEvent', { type: down ? 'touchStart' : 'touchEnd',
    touchPoints: down ? [{ x: button.x + button.width / 2, y: button.y + button.height / 2, id: 1 }] : [] });
}
const report = { base, errors: [], scenarios: [], limitations: ['Occlusion queries measure real fragment depth/stencil visibility, not subjective visibility or performance.', 'Normal antialiasing/DPR, live simulation and normal inputs; browser-only instrumentation exposes camera setup and renderer observations.'] };
page.on('pageerror', error => report.errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); });
await page.route(/\/src\/main\.ts(?:\?.*)?$/, async route => {
  const response = await route.fetch(), source = await response.text();
  if (!source.includes('const game = new Game(canvas, e2e);')) throw new Error('Main probe anchor unavailable');
  await route.fulfill({ response, body: source.replace('const game = new Game(canvas, e2e);', 'const game = new Game(canvas, e2e); window.__normalGame = game;') });
});
try {
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__normalGame, null, { timeout: 60_000 });
  await page.getByRole('button', { name: 'PLAY THE FOUNDRY' }).click();
  report.context = await page.evaluate(() => {
    const game = window.__normalGame, probe = game.renderer;
    const gl = probe.renderer.getContext();
    const original = probe.renderer.render.bind(probe.renderer);
    const pending = [], completed = [];
    window.__visibilityStage = 'idle';
    window.__visibilityResults = completed;
    probe.renderer.render = (scene, camera) => {
      while (pending.length && gl.getQueryParameter(pending[0].query, gl.QUERY_RESULT_AVAILABLE)) {
        const row = pending.shift();
        row.samplesPassed = gl.getQueryParameter(row.query, gl.QUERY_RESULT);
        gl.deleteQuery(row.query); delete row.query;
        completed.push(row);
      }
      if (scene !== probe.vmScene || !probe.viewModel) return original(scene, camera);
      const query = gl.createQuery();
      const row = { query, stage: window.__visibilityStage, time: performance.now(), gun: probe.currentGun,
        phase: game.phase, fireCooldown: game.sim?.player.fireCd, depthMask: gl.getParameter(gl.DEPTH_WRITEMASK),
        depthTest: gl.isEnabled(gl.DEPTH_TEST), stencil: gl.isEnabled(gl.STENCIL_TEST), colorMask: gl.getParameter(gl.COLOR_WRITEMASK),
        screenTarget: probe.renderer.getRenderTarget() === null, holder: probe.vmHolder.position.toArray(),
        equip: probe.viewModel.group.getObjectByName('equip_motion')?.position.toArray(),
        recoil: probe.viewModel.group.getObjectByName('recoil_motion')?.position.toArray() };
      gl.beginQuery(gl.ANY_SAMPLES_PASSED, query);
      original(scene, camera);
      gl.endQuery(gl.ANY_SAMPLES_PASSED);
      pending.push(row);
    };
    return { attributes: gl.getContextAttributes(), debugApiAbsent: !('__GAME__' in window),
      renderSize: [gl.drawingBufferWidth, gl.drawingBufferHeight], pointerLocked: game.input.pointerLocked };
  });
  const stage = async (name, action) => {
    await page.evaluate(name => { window.__visibilityStage = name; }, name);
    await action();
    await page.screenshot({ path: `${output}/${name}.jpg`, type: 'jpeg', quality: 88 });
  };
  await stage('pistol-idle', () => page.waitForTimeout(2000));
  await stage('pistol-moving-firing', async () => {
    await fire(true); await page.keyboard.down('w'); await page.waitForTimeout(2500);
    await page.keyboard.up('w'); await page.keyboard.press('e'); await page.waitForTimeout(700);
    await page.keyboard.down('w'); await page.waitForTimeout(1800); await page.keyboard.up('w'); await fire(false);
  });
  await stage('pistol-near-wall', async () => {
    await page.evaluate(() => { const api = window.__normalGame.getDebugApi(); api.teleport(40, 79); api.pose({ yaw: 0, pitch: 0 }); api.unfreeze(); });
    await fire(true); await page.keyboard.down('w'); await page.waitForTimeout(2500); await page.keyboard.up('w'); await fire(false);
  });
  await stage('pistol-resize', async () => {
    await page.setViewportSize(portrait ? { width: 350, height: 844 } : { width: 900, height: 1100 }); await page.waitForTimeout(1200);
    await page.setViewportSize(portrait ? { width: 390, height: 844 } : { width: 1440, height: 900 }); await page.waitForTimeout(1200);
  });
  for (let gun = 2; gun <= 7; gun++) await stage(`gun-${gun}-equip-fire`, async () => {
    await page.evaluate(gun => {
      const api = window.__normalGame.getDebugApi();
      // Reset only the test location to the safe entrance; avoid monsters
      // ending the run and truncating later weapon observations.
      api.teleport(18, 87); api.pose({ gun, yaw: 0, pitch: 0 }); api.unfreeze();
    }, gun);
    await fire(true); await page.waitForTimeout(1800); await fire(false);
  });
  await page.waitForTimeout(200);
  report.frames = await page.evaluate(() => window.__visibilityResults);
  report.missing = report.frames.filter(row => !row.samplesPassed);
  report.scenarios = [...new Set(report.frames.map(row => row.stage))].map(stage => ({ stage,
    frames: report.frames.filter(row => row.stage === stage).length,
    missing: report.missing.filter(row => row.stage === stage).length }));
  if (report.missing.length) console.log(JSON.stringify({ missing: report.missing.slice(0, 12) }));
  if (report.missing.length) throw new Error(`${report.missing.length} weapon frames submitted no visible fragments.`);
  for (let gun = 2; gun <= 7; gun++) {
    const frames = report.frames.filter(row => row.stage === `gun-${gun}-equip-fire` && row.gun === gun && row.phase === 'playing');
    if (frames.length < 20) throw new Error(`Gun ${gun} did not complete a meaningful live equip/fire observation.`);
  }
} catch (error) { report.failure = error.stack ?? String(error); throw error; }
finally {
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2) + '\n');
  await browser.close();
  console.log(JSON.stringify({ output, frames: report.frames?.length, scenarios: report.scenarios, errors: report.errors, failure: report.failure }));
}
