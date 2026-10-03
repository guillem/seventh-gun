import { test, expect } from '@playwright/test';
import { gotoGame, waitForGameReady } from '../helpers/boot';
import { MODERN_SAMPLE_IDS } from '../../src/audio/samples';
import { MODERN_ASSET_URLS } from '../../src/render/modernAssets';

type GameApi = {
  state: () => { phase: string; kind?: string; campaign?: { map: number } };
  renderStats: () => { frames: number; geometries: number; textures: number };
};

type AudioProbe = { decoded: number; sampledStarts: number; activeLoops: number };

test.describe('modern art bootstrap', () => {
  for (const seed of ['1984', '1986']) test(`seed ${seed}: pointer-down ends editing before the Start click`, async ({ page }) => {
    await gotoGame(page);
    const input = page.locator('#seed-input');
    await input.fill(seed);
    await expect(input).toBeFocused();
    // Model a browser/button that does not take focus on mouse press. The
    // editor must still be dismissed before click, without cancelling click.
    await page.locator('#start-btn').evaluate(button => {
      button.addEventListener('mousedown', event => event.preventDefault());
    });
    const box = await page.locator('#start-btn').boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.down();
    await expect(input).not.toBeFocused();
    // Pressing must not launch: release outside still cancels a normal button.
    await expect(page.locator('#world-loading')).toHaveCount(0);
    await expect(page.locator('#title-screen')).toBeVisible();
    await page.mouse.move(1, 1);
    await page.mouse.up();
    await expect(page.locator('#title-screen')).toBeVisible();
    await input.fill(seed);
    await expect(input).toBeFocused();
    await page.locator('#start-btn').click();
    await expect(page.locator('#world-loading')).toHaveCount(0, { timeout: 15000 });
    await expect(page.locator('#title-screen')).toBeHidden();
    await expect(input).toHaveValue(seed);
  });

  test('prepares GPU programs behind a painted loading screen before the first shot or room reveal', async ({ page }) => {
    test.setTimeout(60000);
    await page.addInitScript(() => {
      const probe = { programs: 0, loadingPrograms: 0, loadingFrames: 0 };
      (window as unknown as { __gpuPreparation: typeof probe }).__gpuPreparation = probe;
      const createProgram = WebGL2RenderingContext.prototype.createProgram;
      WebGL2RenderingContext.prototype.createProgram = function () {
        probe.programs++;
        if (document.getElementById('world-loading')) probe.loadingPrograms++;
        return createProgram.call(this);
      };
      const frame = () => {
        if (document.getElementById('world-loading')) probe.loadingFrames++;
        requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    });
    await gotoGame(page);
    await page.getByRole('button', { name: 'PLAY THE FOUNDRY' }).click();
    await expect(page.locator('#title-screen')).toBeHidden();
    await expect(page.locator('#world-loading')).toHaveCount(0);
    const result = await page.evaluate(() => {
      const probe = (window as unknown as { __gpuPreparation: { programs: number; loadingPrograms: number; loadingFrames: number } }).__gpuPreparation;
      const G = (window as unknown as { __GAME__: {
        shoot: () => { spent: boolean }; tickNow: () => void;
        teleport: (x: number, z: number) => void; pose: (opts: { yaw: number }) => void;
      } }).__GAME__;
      const before = probe.programs;
      const shot = G.shoot(); G.tickNow();
      G.pose({ yaw: 20 });
      for (const z of [95.7, 96.3, 109, 95.7]) { G.teleport(60, z); G.tickNow(); }
      return { ...probe, newPrograms: probe.programs - before, shotSpent: shot.spent };
    });
    expect(result.loadingFrames).toBeGreaterThan(0);
    expect(result.loadingPrograms).toBeGreaterThan(0);
    expect(result.shotSpent).toBe(true);
    expect(result.newPrograms).toBe(0);
  });

  test('normal touch menus can pause, resume and quit without gameplay controls intercepting taps', async ({ page }) => {
    test.skip(!test.info().project.name.startsWith('mobile'), 'touch-only regression');
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    // Normal startup deliberately has no debug API or forced pointer events.
    await page.goto('/');
    const play = page.getByRole('button', { name: 'PLAY THE FOUNDRY' });
    await expect(play).toBeVisible({ timeout: 25_000 });
    expect(await page.evaluate(() => '__GAME__' in window)).toBe(false);
    await play.tap();
    await expect(page.locator('#title-screen')).toBeHidden();
    await page.locator('#btn-pause').tap();
    await expect(page.locator('#pause-screen')).toBeVisible();
    await page.getByRole('button', { name: 'RESUME', exact: true }).tap();
    await expect(page.locator('#pause-screen')).toBeHidden();
    await page.locator('#btn-pause').tap();
    await page.getByRole('button', { name: 'QUIT TO TITLE', exact: true }).tap();
    await expect(play).toBeVisible();
    await expect(page.locator('#touch-ui')).toBeHidden();
    expect(errors).toEqual([]);
  });

  test('loads saved models, textures and audio before the Foundry entry becomes usable', async ({ page }) => {
    const loaded = new Set<string>();
    const errors: string[] = [];
    page.on('response', response => {
      const path = new URL(response.url()).pathname;
      if (path.startsWith('/modern/') && response.ok()) loaded.add(path);
    });
    page.on('pageerror', error => errors.push(error.message));
    await gotoGame(page);
    await expect(page.getByText('EXPERIMENTAL ART LAB')).toBeVisible();
    await expect(page.getByRole('button', { name: 'PLAY THE FOUNDRY' })).toBeVisible();
    expect([...loaded]).toEqual(expect.arrayContaining(Object.values(MODERN_ASSET_URLS)));
    expect([...loaded]).toEqual(expect.arrayContaining([
      '/modern/models/pistol.glb', '/modern/models/husk.glb', '/modern/models/architecture.glb',
      '/modern/textures/concrete.webp', '/modern/textures/steel.webp',
      '/modern/foundry/environment.glb', '/modern/foundry/irradiance.webp',
      '/modern/foundry/entrance-door.webp', '/modern/foundry/entrance-floor.webp', '/modern/foundry/door-hardware.glb',
      '/modern/foundry/concrete-normal.webp', '/modern/foundry/concrete-roughness.webp',
      '/modern/foundry/steel-normal.webp', '/modern/foundry/steel-roughness.webp',
      '/modern/audio/pistol-a.mp3', '/modern/audio/pistol-b.mp3', '/modern/audio/shotgun.mp3',
      '/modern/audio/door-open.mp3', '/modern/audio/metal-impact.mp3',
      '/modern/audio/husk-alert.mp3', '/modern/audio/husk-pain.mp3', '/modern/audio/industrial-ambient.mp3',
    ]));
    await page.getByRole('button', { name: 'PLAY THE FOUNDRY' }).click();
    await page.waitForFunction(() => {
      const game = (window as unknown as { __GAME__: GameApi }).__GAME__;
      return game.state().phase === 'playing' && game.renderStats().frames > 1;
    });
    const { state, render } = await page.evaluate(() => {
      const game = (window as unknown as { __GAME__: GameApi }).__GAME__;
      return { state: game.state(), render: game.renderStats() };
    });
    expect(state.kind).toBe('campaign');
    expect(state.campaign?.map).toBe(1);
    expect(render.geometries).toBeGreaterThan(0);
    expect(render.textures).toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });

  test('the authored entrance door still blocks, opens and lets the player reach the hall', async ({ page }) => {
    await gotoGame(page);
    await page.evaluate(() => {
      const game = (window as unknown as { __GAME__: { startCampaign: (n: number) => void; teleport: (x: number, z: number) => void; look: (yaw: number) => void } }).__GAME__;
      game.startCampaign(1);
      game.teleport(32, 87);
      game.look(-90);
    });
    await page.keyboard.down('w');
    await page.waitForFunction(() => (window as unknown as { __GAME__: { state: () => { pos: { x: number } } } }).__GAME__.state().pos.x > 33);
    await page.waitForTimeout(200);
    await page.keyboard.up('w');
    const blockedX = await page.evaluate(() => (window as unknown as { __GAME__: { state: () => { pos: { x: number } } } }).__GAME__.state().pos.x);
    expect(blockedX).toBeGreaterThan(32.5);
    expect(blockedX).toBeLessThan(34);
    await page.keyboard.press('e');
    await page.keyboard.down('w');
    await page.waitForFunction(() => (window as unknown as { __GAME__: { state: () => { pos: { x: number } } } }).__GAME__.state().pos.x > 37);
    await page.keyboard.up('w');
  });

  test('keeps gameplay behind the loading screen while a sound file is pending', async ({ page }) => {
    let release!: () => void;
    const pending = new Promise<void>(resolve => { release = resolve; });
    let requested!: () => void;
    const requestStarted = new Promise<void>(resolve => { requested = resolve; });
    await page.route('**/modern/audio/pistol-a.mp3', async route => {
      requested();
      await pending;
      await route.continue();
    });
    await page.goto('/?e2e=1');
    await requestStarted;
    await expect(page.locator('#art-loading')).toBeVisible();
    expect(await page.evaluate(() => '__GAME__' in window)).toBe(false);
    await expect(page.getByRole('button', { name: 'PLAY THE FOUNDRY' })).toHaveCount(0);
    release();
    await waitForGameReady(page);
    await expect(page.getByRole('button', { name: 'PLAY THE FOUNDRY' })).toBeVisible();
  });

  test('decodes recordings on gesture, plays sampled shots and cleans up ambience between runs', async ({ page }) => {
    await page.addInitScript(() => {
      const probe: AudioProbe = { decoded: 0, sampledStarts: 0, activeLoops: 0 };
      (window as unknown as { __audioProbe: AudioProbe }).__audioProbe = probe;
      const recordings = new WeakSet<AudioBuffer>();
      const loops = new WeakSet<AudioBufferSourceNode>();
      const decode = AudioContext.prototype.decodeAudioData;
      AudioContext.prototype.decodeAudioData = function (bytes: ArrayBuffer): Promise<AudioBuffer> {
        return decode.call(this, bytes).then(buffer => {
          recordings.add(buffer);
          probe.decoded++;
          return buffer;
        });
      };
      const start = AudioBufferSourceNode.prototype.start;
      AudioBufferSourceNode.prototype.start = function (...args: Parameters<AudioBufferSourceNode['start']>): void {
        if (this.buffer && recordings.has(this.buffer)) {
          probe.sampledStarts++;
          if (this.loop) { loops.add(this); probe.activeLoops++; }
        }
        start.apply(this, args);
      };
      const stop = AudioBufferSourceNode.prototype.stop;
      AudioBufferSourceNode.prototype.stop = function (...args: Parameters<AudioBufferSourceNode['stop']>): void {
        if (loops.delete(this)) probe.activeLoops--;
        stop.apply(this, args);
      };
    });
    await gotoGame(page);
    await page.getByRole('button', { name: 'PLAY THE FOUNDRY' }).click();
    await page.waitForFunction(expected => {
      const probe = (window as unknown as { __audioProbe: AudioProbe }).__audioProbe;
      return probe.decoded === expected && probe.activeLoops === 1;
    }, MODERN_SAMPLE_IDS.length);
    const before = await page.evaluate(() => (window as unknown as { __audioProbe: AudioProbe }).__audioProbe.sampledStarts);
    await page.evaluate(() => (window as unknown as { __GAME__: { shoot: () => void } }).__GAME__.shoot());
    const after = await page.evaluate(() => (window as unknown as { __audioProbe: AudioProbe }).__audioProbe.sampledStarts);
    expect(after).toBeGreaterThan(before);
    await page.evaluate(() => (window as unknown as { __GAME__: { pause: () => void } }).__GAME__.pause());
    // The existing pause/map menu keeps its ambient bed. Leaving a run is the
    // lifecycle boundary that must stop it before another run starts.
    expect(await page.evaluate(() => (window as unknown as { __audioProbe: AudioProbe }).__audioProbe.activeLoops)).toBe(1);
    await page.getByRole('button', { name: 'QUIT TO TITLE', exact: true }).click();
    expect(await page.evaluate(() => (window as unknown as { __audioProbe: AudioProbe }).__audioProbe.activeLoops)).toBe(0);
    await page.getByRole('button', { name: 'PLAY THE FOUNDRY' }).click();
    await page.waitForFunction(() => (window as unknown as { __audioProbe: AudioProbe }).__audioProbe.activeLoops === 1);
    expect(await page.evaluate(() => (window as unknown as { __audioProbe: AudioProbe }).__audioProbe.decoded)).toBe(MODERN_SAMPLE_IDS.length);
  });

  for (const path of ['models/pistol.glb', 'audio/pistol-a.mp3', 'foundry/irradiance.webp', 'roster/enemies/husk.glb', 'roster/effects/flash.webp']) {
    test(`a failed ${path} exposes retry before gameplay and recovers`, async ({ page }) => {
      const pattern = `**/modern/${path}`;
      await page.route(pattern, route => route.fulfill({ status: 503, body: 'Temporarily unavailable' }));
      await page.goto('/?e2e=1');
      await expect(page.locator('#art-loading')).toBeVisible();
      await expect(page.getByRole('button', { name: 'RETRY', exact: true })).toBeVisible({ timeout: 25_000 });
      await expect(page.locator('.boot-status')).toContainText('could not be loaded');
      expect(await page.evaluate(() => '__GAME__' in window)).toBe(false);
      await expect(page.locator('#title-screen')).toHaveCount(0);
      await page.unroute(pattern);
      await Promise.all([
        page.waitForEvent('load'),
        page.getByRole('button', { name: 'RETRY', exact: true }).click(),
      ]);
      await waitForGameReady(page);
      await expect(page.getByRole('button', { name: 'PLAY THE FOUNDRY' })).toBeVisible();
    });
  }
});
