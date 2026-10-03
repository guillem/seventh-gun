// Actual gameplay evidence for the mood/coplanarity refinement. The debug API
// freezes AI and positions the camera; it does not replace game rendering.
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const base = process.argv[2] ?? 'http://127.0.0.1:5176';
const output = resolve(process.argv[3] ?? 'art/modern/refinement/lighting');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' });
const report = { base, capturedAt: new Date().toISOString(), captures: [], errors: [],
  limitations: ['Actual client at fixed debug camera positions with frozen AI.',
    'Debug DPR1/antialiasing-off capture, not a frame-rate measurement.',
    'Portrait is touch emulation on a desktop GPU, not a physical phone.'] };
const scenes = [
  { name: 'entrance', x: 19, z: 87, yaw: -90, pitch: -6 },
  { name: 'hall', x: 41, z: 87, yaw: -90, pitch: -8 },
  { name: 'warm-pool', x: 55, z: 87, yaw: -90, pitch: -4 },
  { name: 'side-gallery', x: 71, z: 89, yaw: -40, pitch: -15 },
];
try {
  for (const [device, width, height, touch] of [['desktop', 1440, 900, false], ['portrait', 390, 844, true]]) {
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, isMobile: touch, hasTouch: touch });
    const page = await context.newPage();
    page.on('pageerror', error => report.errors.push({ device, message: error.message }));
    page.on('response', response => { if (response.status() >= 400 && response.url().includes('/modern/')) report.errors.push({ device, message: `${response.status()} ${response.url()}` }); });
    await page.addInitScript(() => { HTMLCanvasElement.prototype.requestPointerLock = () => Promise.resolve(); });
    await page.goto(`${base}/?e2e=1`);
    await page.waitForFunction(() => !!window.__GAME__, null, { timeout: 60000 });
    await page.getByRole('button', { name: 'PLAY THE FOUNDRY' }).click();
    for (const scene of touch ? scenes.slice(0, 2) : scenes) {
      await page.evaluate(scene => {
        const game = window.__GAME__;
        game.startCampaign(1);
        game.teleport(scene.x, scene.z);
        game.pose({ gun: 1, yaw: scene.yaw, pitch: scene.pitch });
      }, scene);
      await page.waitForTimeout(3500);
      const file = `${scene.name}-${device}.png`;
      await page.screenshot({ path: `${output}/${file}` });
      report.captures.push({ device, ...scene, file, ...await page.evaluate(() => ({
        state: window.__GAME__.state(), render: window.__GAME__.renderStats(),
      })) });
    }
    await context.close();
  }
} finally {
  await browser.close();
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2) + '\n');
}
console.log(JSON.stringify({ output, captures: report.captures.length, errors: report.errors }));
if (report.errors.length) process.exitCode = 1;
