// Real game captures at the entrance, close to its moving door, and after entry.
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const base = process.argv[2] ?? 'http://127.0.0.1:5175';
const out = resolve(process.argv[3] ?? '/private/tmp/seventh-entrance-review');
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || undefined });
const report = { base, capturedAt: new Date().toISOString(), views: [] };
try {
  for (const [name, width, height, touch] of [['desktop', 1440, 900, false], ['mobile', 390, 844, true]]) {
    const context = await browser.newContext({ viewport: { width, height }, isMobile: touch, hasTouch: touch });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(() => { HTMLCanvasElement.prototype.requestPointerLock = () => Promise.resolve(); });
    await page.goto(`${base}/?e2e=1`);
    await page.getByRole('button', { name: 'PLAY THE FOUNDRY' }).click();
    await page.evaluate(() => window.__GAME__.pose({ gun: 1 }));
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${out}/${name}-entry.png` });
    await page.evaluate(() => { window.__GAME__.teleport(30.5, 87); window.__GAME__.look(-90); });
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${out}/${name}-door.png` });
    await page.evaluate(() => { window.__GAME__.unfreeze(); window.__GAME__.teleport(33, 87); });
    await page.keyboard.press('e');
    await page.waitForTimeout(1600);
    await page.evaluate(() => window.__GAME__.pose({ gun: 1 }));
    await page.screenshot({ path: `${out}/${name}-door-open.png` });
    report.views.push({ name, errors, state: await page.evaluate(() => window.__GAME__.state()) });
    await context.close();
    if (errors.length) throw new Error(`${name}: ${errors.join('; ')}`);
  }
  await writeFile(`${out}/report.json`, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
} finally { await browser.close(); }
