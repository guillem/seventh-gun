// Normal-mode input and rendering probe; no production/debug API changes.
// Start a dev/preview server, then:
// PLAYWRIGHT_CHANNEL=chrome node scripts/profile-modern-art.mjs [url] [output]
// Set PROFILE_CAMPAIGNS=1 for all seven campaign entry views on desktop/portrait.
import { chromium } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const profileCampaigns = process.env.PROFILE_CAMPAIGNS === '1';
const base = new URL(process.argv[2] ?? 'http://127.0.0.1:5175');
base.searchParams.delete('e2e');
base.searchParams.delete('test');
const output = resolve(process.argv[3] ?? '/private/tmp/seventh-gun-art-performance');
await mkdir(output, { recursive: true });
const defaultScenarios = [
  { name: 'desktop', width: 1280, height: 800, scale: 1, touch: false },
  { name: 'desktop-retina', width: 1280, height: 800, scale: 2, touch: false },
  { name: 'mobile', width: 390, height: 844, scale: 3, touch: true },
  { name: 'combat', width: 1280, height: 800, scale: 1, touch: false },
];
let scenarios = defaultScenarios;
if (profileCampaigns) {
  // Read public map identity from authored data, without loading the game or
  // importing its orchestrator. Selection itself still uses the real menu.
  const campaigns = await Promise.all([
    '01-foundry', '02-gullet', '03-catacombs', '04-pit',
    '05-spire', '06-ward', '07-sanctum',
  ].map(async (id, index) => {
    const map = JSON.parse(await readFile(new URL(`../src/campaign/maps/${id}.json`, import.meta.url), 'utf8'));
    return { index: index + 1, id: map.id, title: map.title, seed: `campaign:${map.id}` };
  }));
  scenarios = campaigns.flatMap(campaign => [
    { name: 'desktop', width: 1280, height: 800, scale: 1, touch: false },
    { name: 'portrait', width: 390, height: 844, scale: 3, touch: true },
  ].map(device => ({ ...device, name: `campaign-${campaign.id}-${device.name}`, campaign })));
}
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || undefined });
const report = {
  base: base.href,
  mode: profileCampaigns ? 'campaign-entry-views' : 'default-four-scenarios',
  browserChannel: process.env.PLAYWRIGHT_CHANNEL || 'bundled-chromium',
  capturedAt: new Date().toISOString(),
  limitations: [
    'Mobile uses the desktop GPU with a mobile viewport and touch input; this is not physical-phone performance.',
    'Frame timing is requestAnimationFrame cadence and can be capped by display refresh; it does not measure remaining GPU headroom.',
    'Local startup timing does not represent an uncached public network download.',
    ...(profileCampaigns ? [
      'Campaign results sample the normal entry view only, not traversal, combat, or the most expensive room of each map.',
      'Each scenario unlocks campaign selection in an isolated browser context; it does not modify a real player save.',
      'Map identity is observed from the campaign menu and text drawn on the visible HUD; the debug API is absent.',
    ] : []),
  ],
  scenarios: [],
};

async function sampleFrames(page) {
  return page.evaluate(async () => {
    const deadline = new Promise((_, reject) => setTimeout(() => reject(new Error('Frame sample exceeded 30 seconds')), 30_000));
    return Promise.race([deadline, (async () => {
    await new Promise(resolveWarm => {
      let frames = 0;
      function warm() { if (++frames >= 30) resolveWarm(); else requestAnimationFrame(warm); }
      requestAnimationFrame(warm);
    });
    const gaps = [];
    let previous;
    let start;
    await new Promise(resolveSample => {
      function frame(now) {
        if (previous !== undefined) gaps.push(now - previous);
        else start = { ...window.__profileCounters };
        previous = now;
        if (gaps.length >= 180) resolveSample();
        else requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    });
    const elapsed = gaps.reduce((sum, gap) => sum + gap, 0);
    const sorted = gaps.slice().sort((a, b) => a - b);
    const gl = document.querySelector('#game-canvas').getContext('webgl2');
    const extension = gl.getExtension('WEBGL_debug_renderer_info');
    return {
      frames: gaps.length,
      fps: 1000 * gaps.length / elapsed,
      p50ms: sorted[Math.floor(sorted.length * .5)],
      p95ms: sorted[Math.floor(sorted.length * .95)],
      maxMs: sorted.at(-1),
      drawsPerFrame: (window.__profileCounters.draws - start.draws) / gaps.length,
      trianglesPerFrame: (window.__profileCounters.triangles - start.triangles) / gaps.length,
      gpu: extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : 'unavailable',
      renderSize: [gl.drawingBufferWidth, gl.drawingBufferHeight],
    };
    })()]);
  });
}

try {
  for (const config of scenarios) {
    const context = await browser.newContext({
      viewport: { width: config.width, height: config.height },
      deviceScaleFactor: config.scale, isMobile: config.touch, hasTouch: config.touch,
    });
    // A real lock captures the developer's cursor with installed Chrome on
    // macOS, even headless; entry/exit still run through the game's own UI.
    await context.addInitScript(() => { Element.prototype.requestPointerLock = () => Promise.resolve(); });
    const page = await context.newPage();
    const errors = [];
    const previewTelemetryErrors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
      if (message.type() !== 'error') return;
      const location = message.location().url;
      // Netlify injects its preview toolbar independently of this game. Record
      // its known blocked telemetry endpoints separately; never hide asset,
      // application, or other unexpected console errors.
      const telemetry = /^https:\/\/(cdn\.segment\.com|sessions\.bugsnag\.com)\//.test(location);
      if (telemetry && message.text().startsWith('Failed to load resource:')) {
        previewTelemetryErrors.push({ url: location, message: message.text() });
      } else errors.push(message.text());
    });
    try {
      await page.addInitScript(({ campaign, origin }) => {
        window.__profileCounters = { draws: 0, triangles: 0 };
        const proto = WebGL2RenderingContext.prototype;
        for (const key of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced']) {
          const original = proto[key];
          proto[key] = function (...args) {
            const count = key.startsWith('drawElements') ? args[1] : args[2];
            const instances = key.endsWith('Instanced') ? args[key === 'drawElementsInstanced' ? 4 : 3] : 1;
            window.__profileCounters.draws++;
            if (args[0] === this.TRIANGLES) window.__profileCounters.triangles += count / 3 * instances;
            return original.apply(this, args);
          };
        }
        if (campaign && location.origin === origin && window === window.top) {
          localStorage.setItem('seventh-gun.campaign', JSON.stringify({
            difficulty: 'normal', nextMap: 7, unlocked: 7,
            loadout: {
              owned: [false, true, false, false, false, false, false, false],
              ammo: { bullets: 70, shells: 0, nails: 0, grenades: 0, cores: 0, void: 0 },
              gun: 1,
            },
          }));
          // Read-only observation of text actually drawn by the normal HUD.
          // No Game object, debug API, pose override, or simulation freeze.
          window.__profileHud = { seed: null, title: null };
          const fillText = CanvasRenderingContext2D.prototype.fillText;
          CanvasRenderingContext2D.prototype.fillText = function (text, ...args) {
            if (this.canvas.id === 'hud') {
              if (typeof text === 'string' && text.startsWith('SEED campaign:')) window.__profileHud.seed = text;
              if (text === campaign.title) window.__profileHud.title = text;
            }
            return fillText.call(this, text, ...args);
          };
        }
      }, { campaign: config.campaign ?? null, origin: base.origin });
      const started = Date.now();
      await page.goto(base.href);
      const play = page.getByRole('button', { name: 'PLAY THE FOUNDRY' });
      await play.waitFor({ timeout: 25_000 });
      const startupMs = Date.now() - started;
      if (await page.evaluate(() => '__GAME__' in window)) throw new Error('Profile requires normal mode, without the debug API.');
      let campaignEvidence;
      if (config.campaign) {
        const campaignMenu = page.locator('#campaign-btn');
        if (config.touch) await campaignMenu.tap(); else await campaignMenu.click();
        await page.locator('#campaign-screen').waitFor({ state: 'visible' });
        const mapButton = page.locator(`#campaign-maps button[data-map="${config.campaign.index}"]`);
        const menuLabel = await mapButton.locator('.campaign-map-name').innerText();
        if (menuLabel !== `${config.campaign.index} ${config.campaign.title}` || !(await mapButton.isEnabled())) {
          throw new Error(`Campaign menu selection is unavailable or incorrect: ${menuLabel}`);
        }
        if (config.touch) await mapButton.tap(); else await mapButton.click();
        await page.locator('#campaign-screen').waitFor({ state: 'hidden' });
        await page.waitForFunction(campaign =>
          window.__profileHud?.seed === `SEED ${campaign.seed}` && window.__profileHud?.title === campaign.title,
        config.campaign, { timeout: 10_000 });
        campaignEvidence = {
          ...config.campaign, menuLabel,
          ...await page.evaluate(() => ({ hudSeed: window.__profileHud.seed, hudTitle: window.__profileHud.title })),
          debugApiAbsent: true,
        };
      } else if (config.touch) await play.tap(); else await play.click();
      await page.locator('#title-screen').waitFor({ state: 'hidden' });
      if (config.name === 'combat') {
        // Real movement reaches the first door, opens it, then enters the hall.
        await page.keyboard.down('w'); await page.waitForTimeout(3500); await page.keyboard.up('w');
        await page.keyboard.press('e'); await page.waitForTimeout(800);
        await page.keyboard.down('w'); await page.waitForTimeout(1800); await page.keyboard.up('w');
      }
      const metrics = await sampleFrames(page);
      await page.screenshot({ path: `${output}/${config.name}.png` });
      if (config.touch) {
        await page.locator('#btn-pause').tap();
        await page.getByRole('button', { name: 'RESUME', exact: true }).tap();
        await page.locator('#pause-screen').waitFor({ state: 'hidden' });
        await page.locator('#btn-pause').tap();
        await page.getByRole('button', { name: 'QUIT TO TITLE', exact: true }).tap();
      } else {
        await page.keyboard.press('Escape');
        await page.getByRole('button', { name: 'QUIT TO TITLE', exact: true }).click();
      }
      await play.waitFor();
      const result = {
        name: config.name, ...(campaignEvidence ? { campaign: campaignEvidence } : {}),
        startupMs, ...metrics, menuExitPassed: true, errors, previewTelemetryErrors,
      };
      report.scenarios.push(result);
      console.log(JSON.stringify(result));
      if (errors.length) throw new Error(`${config.name} produced browser errors.`);
    } catch (error) {
      report.failure = { name: config.name, message: String(error), errors };
      throw error;
    } finally {
      await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2) + '\n');
      await context.close();
    }
  }
} finally { await browser.close(); }
