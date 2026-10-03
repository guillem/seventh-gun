import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const output = 'art/modern/refinement/husk-review';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const report = { errors: [], views: [] };
page.on('pageerror', error => report.errors.push(error.message));
await page.addInitScript(() => { HTMLCanvasElement.prototype.requestPointerLock = () => Promise.resolve(); });
try {
  await page.goto('http://127.0.0.1:5176/?e2e=1', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__GAME__);
  await page.getByRole('button', { name: 'PLAY THE FOUNDRY' }).click();
  for (const [name, map, x, z, distance] of [
    ['foundry-combat', 1, 41, 87, 4.7], ['foundry-close', 1, 41, 87, 2.8],
    ['sanctum-combat', 7, 69, 117, 4.7],
  ]) {
    const pose = await page.evaluate(({ map, x, z, distance }) => {
      window.__GAME__.startCampaign(map); window.__GAME__.teleport(x, z);
      return window.__GAME__.pose({ gun: 1, enemy: 'husk', dist: distance, yaw: -90, pitch: 4 });
    }, { map, x, z, distance });
    if (pose.placed?.type !== 'husk') throw new Error('Husk pose fell back to another species');
    await page.waitForTimeout(3500);
    await page.screenshot({ path: `${output}/${name}.png` });
    report.views.push({ name, pose, ...await page.evaluate(() => window.__GAME__.state()) });
  }
} finally {
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2) + '\n');
  await browser.close();
}
