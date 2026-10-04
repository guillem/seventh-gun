// Closed and open captures of every campaign door (and its frame), using the
// real client in installed Chrome. Pointer lock is stubbed.
//   node tools/modern-art/capture_doors.mjs <baseURL> <label> [outDir]
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const base = process.argv[2] ?? 'http://localhost:4173';
const label = process.argv[3] ?? 'after';
const output = resolve(process.argv[4] ?? 'art/modern/vertical/doors');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=metal', '--enable-gpu'] });
const report = { base, label, capturedAt: new Date().toISOString(), doors: [] };
try {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  await page.addInitScript(() => { Element.prototype.requestPointerLock = () => Promise.resolve(); });
  await page.goto(`${base}/?e2e=1`);
  await page.waitForFunction(() => !!window.__GAME__);
  for (let n = 1; n <= 7; n++) {
    const doors = await page.evaluate(async n => {
      const g = window.__GAME__;
      if (g.loadCampaignAreas) await g.loadCampaignAreas(n);
      g.startCampaign(n);
      return g.warps().doors;
    }, n);
    await page.waitForTimeout(1500);
    for (const door of doors) {
      // Stand 6 m back along the travel axis, on the side with floor.
      const along = door.axis === 'x' ? [1, 0] : [0, 1];
      const side = await page.evaluate(([d, along]) => {
        const g = window.__GAME__;
        for (const s of [-1, 1]) {
          g.teleport(d.x + along[0] * s * 6, d.z + along[1] * s * 6);
          const p = g.state().pos;
          if (Math.hypot(p.x - (d.x + along[0] * s * 6), p.z - (d.z + along[1] * s * 6)) < .01) return s;
        }
        return -1;
      }, [door, along]);
      const x = door.x + along[0] * side * 6, z = door.z + along[1] * side * 6;
      const yaw = Math.atan2(along[0] * side, along[1] * side) * 180 / Math.PI;
      const pose = async () => {
        await page.evaluate(([x, z, yaw]) => { const g = window.__GAME__; g.unfreeze(); g.teleport(x, z); g.pose({ yaw, pitch: -6 }); g.tickNow(); }, [x, z, yaw]);
        await page.waitForTimeout(500);
      };
      await pose();
      const name = `map${n}-door${door.id}${door.locked ? '-locked' : ''}`;
      await page.screenshot({ path: `${output}/${label}-${name}-closed.png` });
      // Open it: give the key if locked, walk up, press E, let it rise.
      await page.evaluate(([d, along, side]) => {
        const g = window.__GAME__;
        g.unfreeze();
        g.teleport(d.x + along[0] * side * 2, d.z + along[1] * side * 2);
      }, [door, along, side]);
      if (door.locked) await page.evaluate(() => { window.__GAME__.giveKey?.(); });
      await page.keyboard.press('e');
      await page.waitForTimeout(1600);
      await pose();
      await page.screenshot({ path: `${output}/${label}-${name}-open.png` });
      report.doors.push({ map: n, id: door.id, locked: door.locked, x, z, yaw });
    }
  }
  await writeFile(`${output}/${label}-report.json`, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report.doors));
} finally { await browser.close(); }
