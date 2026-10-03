// Repeatable visual evidence for the experimental branch, using its real client.
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const base = process.argv[2] ?? 'http://127.0.0.1:5175';
const output = resolve(process.argv[3] ?? '/private/tmp/seventh-gun-art-review');
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
const report = { base, capturedAt: new Date().toISOString(), devices: [] };
try {
  for (const [name, width, height, touch] of [['desktop', 1440, 900, false], ['mobile', 390, 844, true]]) {
    const context = await browser.newContext({ viewport: { width, height }, isMobile: touch, hasTouch: touch });
    const page = await context.newPage();
    // Fixed-camera evidence uses the debug API; pointer lock is exercised by
    // normal-mode UI checks and would race the immediate debug pose here.
    await page.addInitScript(() => {
      HTMLCanvasElement.prototype.requestPointerLock = () => Promise.resolve();
    });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const started = Date.now();
    await page.goto(`${base}/?e2e=1`);
    await page.waitForFunction(() => !!window.__GAME__);
    const startupMs = Date.now() - started;
    const seed = await page.locator('#seed-input').inputValue();
    await page.screenshot({ path: `${output}/${name}-title.png` });
    await page.getByRole('button', { name: 'PLAY THE FOUNDRY' }).click();
    await page.evaluate(() => { window.__GAME__.pose({ gun: 1 }); });
    await page.screenshot({ path: `${output}/${name}-foundry.png` });
    if (!touch) {
      await page.evaluate(() => { window.__GAME__.teleport(41, 87); window.__GAME__.look(-90, 0); });
      await page.waitForFunction(() => window.__GAME__.state().pos.x === 41);
      await page.screenshot({ path: `${output}/${name}-hall.png` });
      await page.evaluate(() => { window.__GAME__.pose({ gun: 1, enemy: 'husk', dist: 5 }); });
      await page.screenshot({ path: `${output}/${name}-enemy.png` });
    }
    const state = await page.evaluate(() => ({ state: window.__GAME__.state(), render: window.__GAME__.renderStats(), resources: performance.getEntriesByType('resource').filter(entry => entry.name.includes('/modern/')).map(entry => ({ name: new URL(entry.name).pathname, bytes: entry.decodedBodySize, ms: Math.round(entry.duration) })) }));
    report.devices.push({ name, startupMs, seed, errors, ...state });
    await context.close();
  }
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} finally { await browser.close(); }
