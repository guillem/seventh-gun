import { test, expect } from '@playwright/test';

const BASE = '/?e2e=1';

test.describe('arena', () => {
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
    const ctx1 = await browser.newContext();
    const ctx2 = await browser.newContext();
    const a = await ctx1.newPage();
    const b = await ctx2.newPage();
    await a.goto(BASE);
    await b.goto(BASE);
    await a.evaluate(() => (window as unknown as { __GAME__: { joinArena: (n: string) => Promise<void> } }).__GAME__.joinArena('TEST'));
    await a.waitForFunction(() => {
      const ar = (window as unknown as { __GAME__?: { arena: () => { connected: boolean } | null } }).__GAME__?.arena();
      return ar?.connected;
    });
    await b.evaluate(() => (window as unknown as { __GAME__: { joinArena: (n: string) => Promise<void> } }).__GAME__.joinArena('TWO'));
    await b.waitForFunction(() => {
      const ar = (window as unknown as { __GAME__?: { arena: () => { connected: boolean; players: unknown[] } | null } }).__GAME__?.arena();
      return ar?.connected && ar.players.length === 2;
    });
    const aState = await a.evaluate(() => (window as unknown as { __GAME__: { arena: () => { players: unknown[]; seed: string } } }).__GAME__.arena());
    const bState = await b.evaluate(() => (window as unknown as { __GAME__: { arena: () => { players: unknown[]; seed: string } } }).__GAME__.arena());
    expect(aState!.players.length).toBe(2);
    expect(aState!.seed).toBe(bState!.seed);
    await a.evaluate(() => (window as unknown as { __GAME__: { leaveArena: () => void } }).__GAME__.leaveArena());
    await expect(a.locator('#title-screen')).toBeVisible();
    await expect(a.locator('#arena-join-screen')).toBeHidden();
    await b.evaluate(() => (window as unknown as { __GAME__: { leaveArena: () => void } }).__GAME__.leaveArena());
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
