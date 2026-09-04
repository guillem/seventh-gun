import { test, expect } from '@playwright/test';

const BASE = '/?e2e=1';

type GameApi = {
  joinArena: (n: string) => Promise<void>;
  arena: () => { connected: boolean } | null;
  state: () => { phase: string; scoreboard?: boolean };
  leaveArena: () => void;
};

async function joinArena(page: import('@playwright/test').Page, name: string): Promise<void> {
  await page.goto(BASE);
  await page.evaluate((n) => (window as unknown as { __GAME__: GameApi }).__GAME__.joinArena(n), name);
  await page.waitForFunction(() => {
    const g = (window as unknown as { __GAME__?: GameApi }).__GAME__;
    return g?.arena()?.connected && g.state().phase === 'playing';
  });
}

/**
 * Wait for a WebSocket's close handshake, bounded.
 *
 * Waiting for the close event (rather than sleeping) is what proves the server
 * has processed the disconnect. But an unbounded wait turns a missed event into
 * a bare test timeout that names no socket — which is exactly how this test
 * failed on CI. Cap it: if the event never arrives we continue, and the
 * recycling assertion below fails on its own terms with a readable message.
 */
async function closed(ws: import('@playwright/test').WebSocket, ms = 15000): Promise<void> {
  if (ws.isClosed()) return;
  await Promise.race([
    new Promise<void>((resolve) => ws.once('close', () => resolve())),
    new Promise<void>((resolve) => setTimeout(resolve, ms)),
  ]);
}

test.describe('arena', () => {
  // Regression for the playtest bug: InputManager's window keydown handler
  // ran e.preventDefault() on every KeyM (map toggle) and unconditionally
  // added every key to its movement-key set, regardless of focus. Typing
  // "chromium" into the arena NAME field dropped every 'm' → "chroiu".
  // A .fill() would pass whether or not the underlying bug exists — it sets
  // .value directly without dispatching key events — so this must drive
  // real keystrokes.
  test('typing in the arena NAME field is not eaten by the global key handler', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'desktop only');
    await page.goto(BASE);
    await page.getByRole('button', { name: 'MULTIPLAYER ARENA' }).click();
    await expect(page.locator('#arena-join-screen')).toBeVisible();
    const input = page.locator('#arena-name');
    // The field comes prefilled with the persisted/default name ("PLAYER"),
    // so clear it before typing — pressSequentially() appends.
    await input.click();
    await input.fill('');
    await input.pressSequentially('chromium');
    await expect(input).toHaveValue('chromium');

    // The callback path (KeyM → map toggle) must not have fired either:
    // the game hasn't started, so phase must still be the pre-game 'title'
    // phase, not 'map'.
    const phase = await page.evaluate(() => (window as unknown as { __GAME__: GameApi }).__GAME__.state().phase);
    expect(phase).toBe('title');
  });

  // Regression for the arena key-routing change: 'm' now opens the full
  // map (matching campaign/maze), Tab opens the detailed scoreboard — the
  // two used to be merged into a single "Tab/M → scoreboard" handler.
  test('arena: m opens the full map, Tab opens the scoreboard', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'desktop only');
    await joinArena(page, 'MTAB1');

    await page.keyboard.press('KeyM');
    await expect.poll(() => page.evaluate(() => (window as unknown as { __GAME__: GameApi }).__GAME__.state().phase)).toBe('map');
    // The map must actually render something, not just flip the phase flag
    // — arena fills WorldView.explored with all-1s (net/client.ts) so the
    // full-map overlay should paint every walkable cell, not stay blank.
    // this.phase flips synchronously in the keydown handler, but the canvas
    // itself is only painted from tickArena() on the next rendered frame —
    // reading pixels with no wait assumes a frame has already snuck in
    // between the keypress and this evaluate(), which is not guaranteed on
    // a slow/throttled renderer. Poll for the painted-pixel count instead.
    await page.waitForFunction(() => {
      const c = document.getElementById('fullmap-canvas') as HTMLCanvasElement;
      const g = c.getContext('2d')!;
      const d = g.getImageData(0, 0, c.width, c.height).data;
      let n = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i] || d[i + 1] || d[i + 2]) n++;
      return n > 1000;
    }, null, { timeout: 15000 });
    const paintedPixels = await page.evaluate(() => {
      const c = document.getElementById('fullmap-canvas') as HTMLCanvasElement;
      const g = c.getContext('2d')!;
      const d = g.getImageData(0, 0, c.width, c.height).data;
      let n = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i] || d[i + 1] || d[i + 2]) n++;
      return n;
    });
    expect(paintedPixels).toBeGreaterThan(1000);
    await page.keyboard.press('KeyM');
    await expect.poll(() => page.evaluate(() => (window as unknown as { __GAME__: GameApi }).__GAME__.state().phase)).toBe('playing');

    await page.keyboard.press('Tab');
    await expect.poll(() => page.evaluate(() => (window as unknown as { __GAME__: GameApi }).__GAME__.state().scoreboard)).toBe(true);
    // Full map must not have opened — Tab is the scoreboard in arena.
    expect(await page.evaluate(() => (window as unknown as { __GAME__: GameApi }).__GAME__.state().phase)).toBe('playing');
    await page.keyboard.press('Tab');
    await expect.poll(() => page.evaluate(() => (window as unknown as { __GAME__: GameApi }).__GAME__.state().scoreboard)).toBe(false);

    await page.evaluate(() => (window as unknown as { __GAME__: GameApi }).__GAME__.leaveArena());
  });
  test('title shows MULTIPLAYER ARENA and maze still starts', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop' && testInfo.project.name !== 'mobile', 'projects only');
    await page.goto(BASE);
    await expect(page.getByRole('button', { name: 'MULTIPLAYER ARENA' })).toBeVisible();
    if (testInfo.project.name === 'mobile') {
      const panel = page.locator('#title-screen .panel');
      const box = await panel.boundingBox();
      expect(box).toBeTruthy();
      expect(box!.height).toBeLessThan(844);
    }
    if (testInfo.project.name !== 'desktop') return;
    await page.getByRole('button', { name: 'ENTER THE MAZE' }).click();
    await page.waitForFunction(() => {
      const s = (window as unknown as { __GAME__?: { state: () => { phase: string } } }).__GAME__?.state();
      return s?.phase === 'playing';
    });
  });

  test('joinArena connects and two contexts share a room', async ({ browser }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'desktop only');
    // The heaviest test in the suite: three browser contexts, three full WebGL
    // boots and three arena joins. ~18s on a dev machine, well past the 30s
    // default on a runner doing software rasterisation. More patience only —
    // every assertion below is unchanged.
    test.setTimeout(120000);
    const ctx1 = await browser.newContext();
    const ctx2 = await browser.newContext();
    const a = await ctx1.newPage();
    const b = await ctx2.newPage();
    await a.goto(BASE);
    await b.goto(BASE);
    const wsAPromise = a.waitForEvent('websocket', (ws) => ws.url().includes('/arena'));
    await a.evaluate(() => (window as unknown as { __GAME__: { joinArena: (n: string) => Promise<void> } }).__GAME__.joinArena('TEST'));
    const wsA = await wsAPromise;
    await a.waitForFunction(() => {
      const ar = (window as unknown as { __GAME__?: { arena: () => { connected: boolean } | null } }).__GAME__?.arena();
      return ar?.connected;
    });
    const wsBPromise = b.waitForEvent('websocket', (ws) => ws.url().includes('/arena'));
    await b.evaluate(() => (window as unknown as { __GAME__: { joinArena: (n: string) => Promise<void> } }).__GAME__.joinArena('TWO'));
    const wsB = await wsBPromise;
    await b.waitForFunction(() => {
      const ar = (window as unknown as { __GAME__?: { arena: () => { connected: boolean; players: unknown[] } | null } }).__GAME__?.arena();
      return ar?.connected && ar.players.length === 2;
    });
    const aState = await a.evaluate(() => (window as unknown as { __GAME__: { arena: () => { players: unknown[]; seed: string } } }).__GAME__.arena());
    const bState = await b.evaluate(() => (window as unknown as { __GAME__: { arena: () => { players: unknown[]; seed: string } } }).__GAME__.arena());
    expect(aState!.players.length).toBe(2);
    expect(aState!.seed).toBe(bState!.seed);
    // ArenaClient.close() is fire-and-forget on the client (net/client.ts) —
    // it does not wait for the server to process the close, so the room can
    // still show a nonzero player count server-side for a moment after this
    // call returns. If a third client joined before the DO tears the empty
    // room down, it would land in the SAME room/seed instead of a fresh one.
    // Wait for each socket's own close handshake to finish (which requires
    // the server to have already responded) instead of guessing a fixed
    // sleep is enough — this scales with however long the local worker
    // actually takes under load.
    await a.evaluate(() => (window as unknown as { __GAME__: { leaveArena: () => void } }).__GAME__.leaveArena());
    await closed(wsA);
    await expect(a.locator('#title-screen')).toBeVisible();
    await expect(a.locator('#arena-join-screen')).toBeHidden();
    await b.evaluate(() => (window as unknown as { __GAME__: { leaveArena: () => void } }).__GAME__.leaveArena());
    await closed(wsB);
    const cctx = await browser.newContext();
    const c = await cctx.newPage();
    await c.goto(BASE);
    await c.evaluate(() => (window as unknown as { __GAME__: { joinArena: (n: string) => Promise<void> } }).__GAME__.joinArena('THREE'));
    await c.waitForFunction(() => (window as unknown as { __GAME__?: { arena: () => { connected: boolean } | null } }).__GAME__?.arena()?.connected);
    const cState = await c.evaluate(() => (window as unknown as { __GAME__: { arena: () => { seed: string } } }).__GAME__.arena());
    expect(cState!.seed).not.toBe(aState!.seed);
    await ctx1.close();
    await ctx2.close();
    await cctx.close();
  });
});
