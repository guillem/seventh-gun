// Actual-client visual QA for the complete experimental roster. Requires the
// e2e debug API for camera placement/freeze; no renderer replacement or faked
// assets. Uses installed Chrome and records its real WebGL renderer string.
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const base = process.argv[2] ?? 'http://127.0.0.1:5175';
const output = resolve(process.argv[3] ?? 'art/modern/roster/review');
await mkdir(output, { recursive: true });
const weapons = ['viper', 'ripjaw', 'hornet', 'spiker', 'bile', 'sunlance', 'seventh'];
// Poses in actual authored rooms; units are world metres, yaw/pitch degrees.
const campaigns = [
  { map: 1, id: 'foundry', room: 'casting hall', x: 41, z: 87, yaw: -90, pitch: -8 },
  { map: 2, id: 'gullet', room: 'maw', x: 39, z: 20, yaw: -65, pitch: -5 },
  { map: 3, id: 'catacombs', room: 'first nave', x: 31, z: 88, yaw: -85, pitch: -6 },
  { map: 4, id: 'pit', room: 'outdoor pit', x: 61, z: 91, yaw: -83, pitch: -3 },
  { map: 5, id: 'spire', room: 'first gallery', x: 63, z: 133, yaw: -80, pitch: -7 },
  { map: 6, id: 'ward', room: 'first ward', x: 39, z: 86, yaw: -67, pitch: -4 },
  { map: 7, id: 'sanctum', room: 'crossing', x: 69, z: 117, yaw: -80, pitch: -5 },
];
const species = [
  { type: 'husk', distance: 4.7, pitch: 4 },
  { type: 'crawler', distance: 3.4, pitch: 16 },
  { type: 'slab', distance: 5.4, pitch: 2 },
  { type: 'wisp', distance: 4.5, pitch: 1 },
  { type: 'hierophant', distance: 5.6, pitch: 0 },
  { type: 'fiend', distance: 5.4, pitch: -1 },
];
const report = {
  base, capturedAt: new Date().toISOString(), browserChannel: 'chrome',
  limitations: [
    'Screenshots are actual gameplay with only camera/weapon/enemy placement and AI freeze via the existing debug API.',
    'The debug API uses DPR1 and disables antialiasing; these captures are not performance measurements.',
    'Portrait touch emulation runs on the desktop GPU and is not a physical-phone test.',
    'Enemy identity is verified from the returned placed.type; fallback species cause failure instead of mislabeled evidence.',
  ], devices: [], campaigns: [], species: [], failure: null,
};
const browser = await chromium.launch({ channel: 'chrome' });

async function settle(page) {
  await page.waitForTimeout(650); // complete the authored 450 ms equip clip
  await page.evaluate(() => new Promise(resolveFrame => requestAnimationFrame(() => requestAnimationFrame(resolveFrame))));
}
async function capture(page, filename, metadata) {
  await settle(page);
  await page.screenshot({ path: `${output}/${filename}.jpg`, type: 'jpeg', quality: 88 });
  return { file: `${filename}.jpg`, ...metadata, ...await page.evaluate(() => ({ state: window.__GAME__.state(), render: window.__GAME__.renderStats() })) };
}
async function startPose(page, scene, gun = 1, enemy) {
  const pose = await page.evaluate(({ scene, gun, enemy }) => {
    const game = window.__GAME__;
    game.startCampaign(scene.map);
    game.teleport(scene.x, scene.z);
    return game.pose({ gun, yaw: scene.yaw, pitch: scene.pitch, enemy: enemy?.type, dist: enemy?.distance });
  }, { scene, gun, enemy });
  // The actual 3.2 s entry toast otherwise obscures a subject's feet. HUD time
  // continues while AI is frozen; let it expire without mutating UI or game data.
  await page.waitForTimeout(3400);
  return pose;
}

try {
  for (const device of [
    { name: 'desktop', width: 1440, height: 900, touch: false },
    { name: 'portrait', width: 390, height: 844, touch: true },
  ]) {
    const context = await browser.newContext({ viewport: { width: device.width, height: device.height }, deviceScaleFactor: 1, isMobile: device.touch, hasTouch: device.touch });
    const page = await context.newPage();
    const record = { ...device, errors: [], previewTelemetryErrors: [], assetMisses: [], captures: [], startupMs: 0, gpu: null, resources: [] };
    report.devices.push(record);
    page.on('pageerror', error => record.errors.push({ type: 'pageerror', message: error.message }));
    page.on('console', message => {
      if (message.type() !== 'error') return;
      const location = message.location().url;
      const entry = { type: 'console', message: message.text(), location };
      // Netlify's injected toolbar telemetry is separate from game failures.
      if (/^https:\/\/(cdn\.segment\.com|sessions\.bugsnag\.com)\//.test(location)
        && message.text().startsWith('Failed to load resource:')) record.previewTelemetryErrors.push(entry);
      else record.errors.push(entry);
    });
    page.on('response', response => { if (response.status() >= 400 && response.url().includes('/modern/')) record.assetMisses.push({ url: response.url(), status: response.status() }); });
    page.on('requestfailed', request => { if (request.url().includes('/modern/')) record.assetMisses.push({ url: request.url(), failure: request.failure()?.errorText }); });
    await page.addInitScript(() => { HTMLCanvasElement.prototype.requestPointerLock = () => Promise.resolve(); });
    const start = Date.now();
    // Hosted preview toolbars can keep telemetry requests alive indefinitely;
    // the real game/debug API and enabled play button establish readiness.
    await page.goto(`${base}/?e2e=1`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForFunction(() => !!window.__GAME__, null, { timeout: 60_000 });
    record.startupMs = Date.now() - start;
    record.gpu = await page.evaluate(() => {
      const gl = document.querySelector('#game-canvas').getContext('webgl2');
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unavailable';
    });
    await page.getByRole('button', { name: 'PLAY THE FOUNDRY' }).click();
    await startPose(page, { ...campaigns[0], pitch: 0 });
    for (let id = 1; id <= 7; id++) {
      const pose = await page.evaluate(id => window.__GAME__.pose({ gun: id }), id);
      const shot = await capture(page, `weapon-${id}-${weapons[id - 1]}-${device.name}`, { gun: id, weapon: weapons[id - 1], pose });
      if (shot.state.gun !== id) throw new Error(`Expected weapon ${id}, got ${shot.state.gun}`);
      record.captures.push(shot);
    }
    if (!device.touch) {
      for (const scene of campaigns) {
        const pose = await startPose(page, scene);
        report.campaigns.push(await capture(page, `campaign-${scene.map}-${scene.id}`, { ...scene, pose }));
      }
      for (const enemy of species) {
        // Sanctum contains every actual species; no debug spawning/fallback is needed.
        const scene = { map: 7, x: 69, z: 117, yaw: -90, pitch: enemy.pitch };
        const pose = await startPose(page, scene, 1, enemy);
        if (pose.placed?.type !== enemy.type) throw new Error(`Requested ${enemy.type}; pose returned ${pose.placed?.type ?? 'none'}`);
        report.species.push(await capture(page, `enemy-${enemy.type}`, { requested: enemy.type, actual: pose.placed.type, scene, pose }));
      }
    }
    record.resources = await page.evaluate(() => performance.getEntriesByType('resource')
      .filter(entry => entry.name.includes('/modern/'))
      .map(entry => ({ url: new URL(entry.name).pathname, bytes: entry.decodedBodySize, durationMs: Math.round(entry.duration) })));
    await context.close();
    if (record.errors.length || record.assetMisses.length) throw new Error(`${device.name} has game errors or missing assets; see report.json`);
  }
} catch (error) {
  report.failure = error.stack ?? error.message;
  throw error;
} finally {
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2) + '\n');
  await browser.close();
  if (!report.failure) {
    const cards = entries => entries.map(entry => `<figure><a href="${entry.file}"><img loading="lazy" src="${entry.file}" alt="${entry.weapon ?? entry.id ?? entry.actual}"></a><figcaption>${entry.weapon ?? entry.id ?? entry.actual}</figcaption></figure>`).join('');
    await writeFile(`${output}/gallery.html`, `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Seventh Gun — roster review</title><style>body{margin:0;padding:32px;background:#10181d;color:#e5e9e9;font:16px system-ui}main{max-width:1440px;margin:auto}h1{font-size:32px}p{max-width:850px;color:#adb9bf;line-height:1.6}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(330px,1fr));gap:18px}.portrait{grid-template-columns:repeat(auto-fit,minmax(175px,1fr))}figure{margin:0;background:#1b282e;border:1px solid #35464f;border-radius:8px;overflow:hidden}img{width:100%;display:block}figcaption{padding:12px;text-transform:capitalize}a{color:#8bdeed}h2{margin-top:36px}</style><main><h1>Complete roster · actual gameplay review</h1><p>Captured ${report.capturedAt}. Installed Chrome; ${report.devices[0]?.gpu ?? 'GPU unavailable'}. Fixed debug camera and frozen AI; no replacement rendering or image compositing. Portrait is desktop touch emulation, not a physical-phone test. These images are visual evidence, not a performance benchmark. <a href="report.json">Full state/resource/error report</a>.</p><h2>Desktop weapons</h2><div class="grid">${cards(report.devices[0].captures)}</div><h2>Portrait weapons</h2><div class="grid portrait">${cards(report.devices[1].captures)}</div><h2>Seven campaign environments</h2><div class="grid">${cards(report.campaigns)}</div><h2>Six verified species</h2><div class="grid">${cards(report.species)}</div></main></html>\n`);
  }
  console.log(JSON.stringify({ output, devices: report.devices.map(d => ({ name: d.name, gpu: d.gpu, captures: d.captures.length, errors: d.errors, assetMisses: d.assetMisses })), campaigns: report.campaigns.length, species: report.species.length, failure: report.failure }, null, 2));
}
