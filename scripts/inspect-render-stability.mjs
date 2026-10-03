// Local Vite-only visual diagnosis. The served renderer module is instrumented
// in this isolated browser, without changing the application/debug API.
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const base = process.argv[2] ?? 'http://127.0.0.1:5176';
const output = resolve(process.argv[3] ?? 'art/modern/roster/stability-review');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const report = { base, capturedAt: new Date().toISOString(), errors: [], captures: [], limitation: 'Fixed debug poses with a temporary browser-only renderer probe; not a performance measurement.' };
page.on('pageerror', error => report.errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); });
await page.route(/\/src\/render\/renderer\.ts(?:\?.*)?$/, async route => {
  const response = await route.fetch();
  const source = await response.text();
  if (!source.includes('this.renderFrames++;')) throw new Error('Renderer probe anchor unavailable');
  await route.fulfill({ response, body: source.replace('this.renderFrames++;', 'window.__renderProbe = this; this.renderFrames++;') });
});
await page.addInitScript(() => { HTMLCanvasElement.prototype.requestPointerLock = () => Promise.resolve(); });
try {
  await page.goto(`${base}/?e2e=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__GAME__ && !!window.__renderProbe, null, { timeout: 60_000 });
  await page.getByRole('button', { name: 'PLAY THE FOUNDRY' }).click();
  await page.evaluate(() => { window.__GAME__.teleport(41, 87); window.__GAME__.pose({ gun: 1, yaw: -90, pitch: -5 }); });
  await page.waitForTimeout(3500);
  report.passes = await page.evaluate(() => window.__renderProbe.composer.passes.map(pass => pass.constructor.name));
  for (const mode of ['baseline', 'no-occlusion', 'no-shadows', 'direct-world']) {
    await page.evaluate(mode => {
      const probe = window.__renderProbe;
      for (const pass of probe.composer.passes) {
        if (pass.constructor.name === 'ContactOcclusionPass') pass.enabled = mode !== 'no-occlusion' && mode !== 'direct-world';
        if (pass.constructor.name.endsWith('UnrealBloomPass')) pass.enabled = mode !== 'direct-world';
      }
      probe.renderer.shadowMap.enabled = mode !== 'no-shadows' && mode !== 'direct-world';
    }, mode);
    for (const frame of [0, 4]) {
      await page.evaluate(frame => {
        window.__GAME__.teleport(41 + frame * .14, 87 + frame * .08);
        window.__GAME__.pose({ yaw: -90 + frame * .6, pitch: -5 + frame * .15 });
      }, frame);
      await page.waitForTimeout(150);
      const file = `${mode}-${frame}.png`;
      await page.screenshot({ path: `${output}/${file}` });
      report.captures.push({ mode, frame, file });
    }
  }
  report.geometry = await page.evaluate(() => {
    const rows = [];
    window.__renderProbe.vmScene.traverse(node => {
      if (!node.isMesh) return;
      const material = Array.isArray(node.material) ? node.material : [node.material];
      rows.push({ name: node.name, culled: node.frustumCulled,
        materials: material.map(m => ({ name: m.name, depthWrite: m.depthWrite, depthTest: m.depthTest, transparent: m.transparent })) });
    });
    return rows;
  });
  // Scrub the actual saved viewmodels through complete idle and fire cycles.
  // Observe real mesh draw callbacks: a transient culling/matrix failure must
  // not silently drop any weapon part while its hands remain optional/offscreen.
  report.weaponDraws = [];
  for (let gun = 1; gun <= 7; gun++) {
    await page.evaluate(gun => window.__GAME__.pose({ gun }), gun);
    await page.waitForTimeout(500);
    report.weaponDraws.push(await page.evaluate(async gun => {
      const probe = window.__renderProbe;
      const vm = probe.viewModel;
      const originalUpdate = vm.update;
      const interval = [.3, 1.05, .095, .22, 1.15, 1.05, 1.35][gun - 1];
      let phase = 0;
      vm.update = dt => originalUpdate(dt, { moving: 1, firing: phase < interval,
        fireCooldown: Math.max(0, interval - phase), recoil: 0, time: phase * 4 });
      const meshes = [];
      vm.group.traverse(node => {
        if (!node.isMesh) return;
        for (let parent = node; parent; parent = parent.parent) if (parent.name === 'hands') return;
        const record = { node, before: node.onBeforeRender, calls: 0 };
        node.onBeforeRender = function (...args) { record.calls++; record.before.apply(this, args); };
        meshes.push(record);
      });
      const missing = [];
      for (let frame = 0; frame < 90; frame++) {
        phase = frame / 89 * Math.max(interval, 1.2);
        meshes.forEach(record => { record.calls = 0; });
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        for (const record of meshes) if (record.calls === 0) missing.push({ frame, name: record.node.name });
      }
      vm.update = originalUpdate;
      meshes.forEach(record => { record.node.onBeforeRender = record.before; });
      return { gun, frames: 90, meshes: meshes.length, missing };
    }, gun));
  }
} catch (error) {
  report.ready = await page.evaluate(() => ({ game: !!window.__GAME__, probe: !!window.__renderProbe,
    loading: document.querySelector('#art-loading')?.textContent })).catch(() => null);
  report.failure = error.stack ?? String(error);
  throw error;
} finally {
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2) + '\n');
  await browser.close();
  console.log(JSON.stringify({ output, captures: report.captures.length, errors: report.errors, failure: report.failure }));
}
