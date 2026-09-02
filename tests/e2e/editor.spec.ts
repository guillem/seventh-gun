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

  test('opens with a visible canvas and a START room', async ({ page }) => {
    await page.goto(EDIT);
    await page.waitForFunction(() => {
      const s = (window as unknown as { __GAME__?: { state: () => { phase: string } } }).__GAME__?.state();
      return s?.phase === 'editing';
    });
    await expect(page.locator('#editor-status')).toContainText('drag to stamp a room');
    const canvas = page.locator('#editor-canvas');
    await expect(canvas).toBeVisible();
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThan(80);
    expect(box!.height).toBeGreaterThan(80);
    const meta = await canvas.evaluate((el) => ({
      cell: Number((el as HTMLCanvasElement).dataset.cell ?? 0),
      backingW: (el as HTMLCanvasElement).width,
      backingH: (el as HTMLCanvasElement).height,
    }));
    expect(meta.cell).toBeGreaterThan(0);
    expect(meta.backingW).toBeGreaterThan(0);
    expect(meta.backingH).toBeGreaterThan(0);
    const state = await page.evaluate(() => (
      window as unknown as { __GAME__: { state: () => { rooms: number; startRoom?: boolean } } }
    ).__GAME__.state());
    expect(state.rooms).toBeGreaterThanOrEqual(1);
    expect(state.startRoom).toBe(true);

    const stamped = await page.evaluate(() => (
      window as unknown as { __GAME__: { stampEditorRoom: (o: { x: number; z: number; w: number; h: number }) => { id: number } | null } }
    ).__GAME__.stampEditorRoom({ x: 8, z: 20, w: 7, h: 7 }));
    expect(stamped?.id).toBeGreaterThanOrEqual(0);
    const after = await page.evaluate(() => (
      window as unknown as { __GAME__: { state: () => { rooms: number; startRoom?: boolean } } }
    ).__GAME__.state());
    expect(after.rooms).toBeGreaterThanOrEqual(2);
    expect(after.startRoom).toBe(true);
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

  test('COPY LINK works on a START-only map that fails VALIDATE', async ({ page }) => {
    await page.goto(EDIT);
    await page.waitForFunction(() => {
      const s = (window as unknown as { __GAME__?: { state: () => { phase: string } } }).__GAME__?.state();
      return s?.phase === 'editing';
    });
    await page.getByRole('button', { name: 'VALIDATE' }).click();
    await expect(page.locator('#editor-status')).toContainText('arena');
    const share = await page.evaluate(async () => {
      const G = window as unknown as { __GAME__: { editorShare: () => Promise<{ code: string; url: string; errors: number } | null> } };
      return G.__GAME__.editorShare();
    });
    expect(share).not.toBeNull();
    expect(share!.errors).toBeGreaterThan(0);
    expect(share!.code.startsWith('SGMAP.v1.')).toBe(true);
    expect(share!.url).toContain('#m=SGMAP');
    await page.getByRole('button', { name: 'COPY LINK' }).click();
    await expect(page.locator('#toast')).toContainText('copied');
    await expect(page.locator('#toast')).not.toHaveText('fix errors first');
  });
});
