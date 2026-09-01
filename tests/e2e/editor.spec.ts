import { test, expect } from '@playwright/test';
import { tinyGunSealBlueprint } from '../helpers/authoredMaps';

const EDIT = '/?e2e=1&edit=1';
const TINY_BP = tinyGunSealBlueprint();

test.describe('editor', () => {
  test('?edit=1 shows editor chrome', async ({ page }) => {
    await page.goto(EDIT);
    await expect(page.locator('#editor-screen')).toBeVisible();
    await expect(page.locator('#editor-heading')).toHaveText('EDITOR');
    await expect(page.getByRole('button', { name: 'PLAYTEST' })).toBeVisible();
    await expect(page.locator('#editor-canvas')).toBeVisible();
    const state = await page.evaluate(() => (
      window as unknown as { __GAME__: { state: () => { phase: string } } }
    ).__GAME__.state());
    expect(state.phase).toBe('editing');
  });

  test('title EDITOR button opens the editor', async ({ page }) => {
    await page.goto('/?e2e=1');
    await expect(page.getByRole('button', { name: 'MAP LOG' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'CAMPAIGN' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'EDITOR' })).toBeVisible();
    await page.getByRole('button', { name: 'EDITOR' }).click();
    await expect(page.locator('#editor-screen')).toBeVisible();
    await expect(page.locator('#editor-heading')).toHaveText('EDITOR');
  });

  test('loadBlueprint + PLAYTEST reaches playing', async ({ page }) => {
    await page.goto(EDIT);
    await page.waitForFunction(() => {
      const s = (window as unknown as { __GAME__?: { state: () => { phase: string } } }).__GAME__?.state();
      return s?.phase === 'editing';
    });
    await page.evaluate((bp) => {
      (window as unknown as { __GAME__: { loadBlueprint: (m: unknown) => void } }).__GAME__.loadBlueprint(bp);
    }, TINY_BP);
    await expect(page.locator('#editor-title')).toHaveValue('TIN HALL');
    await page.getByRole('button', { name: 'PLAYTEST' }).click();
    await page.waitForFunction(() => {
      const s = (window as unknown as { __GAME__?: { state: () => { phase: string; kind?: string } } }).__GAME__?.state();
      return s?.phase === 'playing' && s.kind === 'map';
    });
    const state = await page.evaluate(() => (
      window as unknown as { __GAME__: { state: () => { phase: string; kind: string; gun: number } } }
    ).__GAME__.state());
    expect(state.phase).toBe('playing');
    expect(state.kind).toBe('map');
    expect(state.gun).toBe(1);
    await page.evaluate(() => (window as unknown as { __GAME__: { pause: () => void } }).__GAME__.pause());
    await expect(page.getByRole('button', { name: 'BACK TO EDITOR' })).toBeVisible();
    await page.getByRole('button', { name: 'BACK TO EDITOR' }).click();
    await page.waitForFunction(() => {
      const s = (window as unknown as { __GAME__?: { state: () => { phase: string } } }).__GAME__?.state();
      return s?.phase === 'editing';
    });
    await expect(page.locator('#editor-heading')).toHaveText('EDITOR');
  });
});
