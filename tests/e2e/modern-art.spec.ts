import { test, expect } from '@playwright/test';
import { gotoGame, waitForGameReady } from '../helpers/boot';

type GameApi = {
  state: () => { phase: string; kind?: string; campaign?: { map: number } };
  renderStats: () => { frames: number; geometries: number; textures: number };
};

type AudioProbe = { decoded: number; sampledStarts: number; activeLoops: number };

test.describe('modern art bootstrap', () => {
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
    expect([...loaded]).toEqual(expect.arrayContaining([
      '/modern/models/pistol.glb', '/modern/models/husk.glb', '/modern/models/architecture.glb',
      '/modern/textures/concrete.webp', '/modern/textures/steel.webp',
      '/modern/foundry/environment.glb', '/modern/foundry/irradiance.webp',
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
    await page.waitForFunction(() => {
      const probe = (window as unknown as { __audioProbe: AudioProbe }).__audioProbe;
      return probe.decoded === 8 && probe.activeLoops === 1;
    });
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
    expect(await page.evaluate(() => (window as unknown as { __audioProbe: AudioProbe }).__audioProbe.decoded)).toBe(8);
  });

  for (const path of ['models/pistol.glb', 'audio/pistol-a.mp3', 'foundry/irradiance.webp']) {
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
