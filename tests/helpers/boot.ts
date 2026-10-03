import { expect, type Page } from '@playwright/test';

/** Network load alone no longer means ready: the modern pack is decoded before
 * Game and the debug API exist. Keep every caller on the same readiness gate. */
export async function waitForGameReady(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const app = window as unknown as { __GAME__?: { state: () => unknown } };
    return typeof app.__GAME__?.state === 'function';
  }, undefined, { timeout: 25_000 });
  await expect(page.locator('#art-loading')).toHaveCount(0);
}

export async function gotoGame(page: Page, url = '/?e2e=1'): Promise<void> {
  await page.goto(url);
  await waitForGameReady(page);
}
