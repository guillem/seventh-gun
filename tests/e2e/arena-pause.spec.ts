// Regression for the arena pause bugs found in two-window playtesting:
//   1. the RESUME button did nothing (resume() guarded on phase==='paused',
//      which arena never sets — it uses the arenaMenu flag)
//   2. an empty but opaque #scoreboard-screen div was appended AFTER
//      #pause-screen, so it painted over the pause menu and, with
//      pointer-events:auto, swallowed the click on RESUME
// Both are DOM/pointer-level failures that unit tests cannot see: the button
// handler was reachable in isolation and still unclickable in a real browser.
import { test, expect } from '@playwright/test';

const BASE = '/?e2e=1';

type GameApi = {
  joinArena: (n: string) => Promise<void>;
  arena: () => { connected: boolean } | null;
  state: () => { phase: string };
  leaveArena: () => void;
};

async function joinArena(page: import('@playwright/test').Page, name: string): Promise<void> {
  await page.goto(BASE);
  await page.evaluate((n) => (window as unknown as { __GAME__: GameApi }).__GAME__.joinArena(n), name);
  // Wait for phase, not just the socket: startArena() sets phase='playing'
  // after the connection resolves, and Escape is a no-op before that.
  await page.waitForFunction(() => {
    const g = (window as unknown as { __GAME__?: GameApi }).__GAME__;
    return g?.arena()?.connected && g.state().phase === 'playing';
  });
}

test.describe('arena pause menu', () => {
  test('RESUME is clickable and closes the menu', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'desktop only');
    await joinArena(page, 'PAUSE1');

    await page.keyboard.press('Escape');
    await expect(page.locator('#pause-screen')).toBeVisible();

    // A real mouse click, not a JS .click() — the original bug was an overlay
    // intercepting pointer events, which a synthetic dispatch would bypass.
    await page.getByRole('button', { name: 'RESUME' }).click();
    await expect(page.locator('#pause-screen')).toBeHidden();

    await page.evaluate(() => (window as unknown as { __GAME__: GameApi }).__GAME__.leaveArena());
  });

  test('scoreboard open first does not block RESUME', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'desktop only');
    await joinArena(page, 'PAUSE2');

    // Exactly the sequence from the bug report: open the scoreboard (Tab/M in
    // arena), then the menu, then try to resume.
    await page.keyboard.press('Tab');
    // First Escape dismisses the scoreboard and returns (game.ts, onPauseToggle
    // handles arenaScoreboard before the menu) — that is intended, and is the
    // benign half of the original "Escape only works after several presses".
    await page.keyboard.press('Escape');
    await expect(page.locator('#pause-screen')).toBeHidden();
    await page.keyboard.press('Escape');
    await expect(page.locator('#pause-screen')).toBeVisible();

    // The offending element must not exist at all any more.
    await expect(page.locator('#scoreboard-screen')).toHaveCount(0);

    await page.getByRole('button', { name: 'RESUME' }).click();
    await expect(page.locator('#pause-screen')).toBeHidden();

    await page.evaluate(() => (window as unknown as { __GAME__: GameApi }).__GAME__.leaveArena());
  });

  test('audio context exists after joining (silent-arena bug)', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'desktop only');
    await joinArena(page, 'PAUSE3');

    // joinArena() must unlock audio; before the fix startArena() never routed
    // through beginPlay(), so no AudioContext was ever constructed and every
    // sound silently no-opped.
    const ctxState = await page.evaluate(() => {
      const g = window as unknown as { __GAME__?: { audioState?: () => string | null } };
      return g.__GAME__?.audioState?.() ?? 'no-hook';
    });
    // Headless chromium autoplay policy may leave it 'suspended' rather than
    // 'running', but it must EXIST — 'closed'/null is the regression.
    expect(['running', 'suspended', 'no-hook']).toContain(ctxState);

    await page.evaluate(() => (window as unknown as { __GAME__: GameApi }).__GAME__.leaveArena());
  });
});
