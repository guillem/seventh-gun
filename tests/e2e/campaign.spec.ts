import { test, expect } from '@playwright/test';

const BASE = '/?e2e=1';

type GameApi = {
  state: () => {
    phase: string;
    kind?: string;
    seed?: string;
    campaign?: { map: number; nextMap: number; owned: boolean[]; artId?: string } | null;
  };
  startCampaign: (n?: number) => void;
  completeMap: () => void;
  killPlayer: () => void;
  campaign: () => { map: number; nextMap: number; owned: boolean[] };
};

test.describe('campaign desktop', () => {
  test('CAMPAIGN begins map 1', async ({ page }) => {
    await page.goto(BASE);
    await page.evaluate(() => localStorage.removeItem('seventh-gun.campaign'));
    await expect(page.getByRole('button', { name: 'CAMPAIGN' })).toBeVisible();
    await page.getByRole('button', { name: 'CAMPAIGN' }).click();
    await expect(page.getByText('Seven maps. The guns stay with you.')).toBeVisible();
    await page.getByRole('button', { name: 'BEGIN' }).click();
    await page.waitForFunction(() => {
      const s = (window as unknown as { __GAME__?: GameApi }).__GAME__?.state();
      return s?.phase === 'playing' && s.kind === 'campaign';
    });
    const state = await page.evaluate(() => (window as unknown as { __GAME__: GameApi }).__GAME__.state());
    expect(state.kind).toBe('campaign');
    expect(state.campaign?.map).toBe(1);
    expect(state.campaign?.artId).toBe('foundry');
  });

  test('campaign SKILL after a maze run does not start a maze', async ({ page }) => {
    await page.goto(BASE);
    await page.evaluate(() => {
      localStorage.removeItem('seventh-gun.maplog');
      localStorage.removeItem('seventh-gun.campaign');
    });
    await page.evaluate(() => (window as unknown as { __GAME__: GameApi & { startRun: (s: string) => void } }).__GAME__.startRun('skill-maze'));
    await page.waitForFunction(() => {
      return (window as unknown as { __GAME__?: GameApi }).__GAME__?.state()?.phase === 'playing';
    });
    await page.evaluate(() => (window as unknown as { __GAME__: { pause: () => void } }).__GAME__.pause());
    await page.getByRole('button', { name: 'QUIT TO TITLE' }).click();
    await page.getByRole('button', { name: 'CAMPAIGN' }).click();
    await expect(page.getByText('Seven maps. The guns stay with you.')).toBeVisible();
    await page.locator('#c-diff-row button').filter({ hasText: 'Hard' }).click();
    await expect(page.getByText('Seven maps. The guns stay with you.')).toBeVisible();
    const state = await page.evaluate(() => (window as unknown as { __GAME__: GameApi }).__GAME__.state());
    expect(state.phase).not.toBe('playing');
  });

  test('Foundry start does not grow the map log with campaign: seeds', async ({ page }) => {
    await page.goto(BASE);
    await page.evaluate(() => {
      localStorage.removeItem('seventh-gun.maplog');
      localStorage.removeItem('seventh-gun.campaign');
    });
    await page.evaluate(() => (window as unknown as { __GAME__: GameApi & { startRun: (s: string) => void } }).__GAME__.startRun('prior-maze'));
    await page.waitForFunction(() => {
      return (window as unknown as { __GAME__?: GameApi }).__GAME__?.state()?.phase === 'playing';
    });
    await page.evaluate(() => (window as unknown as { __GAME__: { pause: () => void } }).__GAME__.pause());
    await page.getByRole('button', { name: 'QUIT TO TITLE' }).click();
    await page.evaluate(() => (window as unknown as { __GAME__: GameApi }).__GAME__.startCampaign(1));
    await page.waitForFunction(() => {
      const s = (window as unknown as { __GAME__?: GameApi }).__GAME__?.state();
      return s?.phase === 'playing' && s.kind === 'campaign';
    });
    const log = await page.evaluate(() => JSON.parse(localStorage.getItem('seventh-gun.maplog') || '[]') as { seed: string }[]);
    expect(log.some((e) => e.seed.startsWith('campaign:'))).toBe(false);
    expect(log.some((e) => e.seed === 'prior-maze')).toBe(true);
  });

  test('title Easy after quitting campaign does not start a campaign-art maze', async ({ page }) => {
    await page.goto(BASE);
    await page.evaluate(() => localStorage.removeItem('seventh-gun.campaign'));
    await page.evaluate(() => (window as unknown as { __GAME__: GameApi }).__GAME__.startCampaign(1));
    await page.waitForFunction(() => {
      return (window as unknown as { __GAME__?: GameApi }).__GAME__?.state()?.phase === 'playing';
    });
    await page.evaluate(() => (window as unknown as { __GAME__: { pause: () => void } }).__GAME__.pause());
    await page.getByRole('button', { name: 'QUIT TO TITLE' }).click();
    await expect(page.getByRole('button', { name: 'ENTER THE MAZE' })).toBeVisible();
    await page.locator('#diff-row button').filter({ hasText: 'Easy' }).click();
    const state = await page.evaluate(() => (window as unknown as { __GAME__: GameApi }).__GAME__.state());
    const playingCampaignArt = state.phase === 'playing' && !!state.campaign?.artId;
    expect(playingCampaignArt).toBe(false);
    if (state.phase === 'playing') {
      expect(state.kind).toBe('maze');
      expect(state.campaign).toBeNull();
      expect(state.seed?.startsWith('campaign:')).toBe(false);
    }
  });

  test('completing map 7 shows THE SEVENTH IS SILENT', async ({ page }) => {
    await page.goto(BASE);
    await page.evaluate(() => localStorage.removeItem('seventh-gun.campaign'));
    await page.evaluate(() => (window as unknown as { __GAME__: GameApi }).__GAME__.startCampaign(7));
    await page.waitForFunction(() => {
      const s = (window as unknown as { __GAME__?: GameApi }).__GAME__?.state();
      return s?.phase === 'playing' && s.campaign?.map === 7;
    });
    await page.evaluate(() => (window as unknown as { __GAME__: GameApi }).__GAME__.completeMap());
    await expect(page.getByText('THE SEVENTH IS SILENT')).toBeVisible();
    await expect(page.locator('#campaign-win-screen')).not.toHaveClass(/hidden/);
  });

  test('campaign screen lists seven named maps; map 2 unlocks after winning map 1', async ({ page }) => {
    await page.goto(BASE);
    await page.evaluate(() => localStorage.removeItem('seventh-gun.campaign'));
    await page.getByRole('button', { name: 'CAMPAIGN' }).click();
    const names = [
      '1 THE FOUNDRY', '2 THE GULLET', '3 THE CATACOMBS', '4 THE PIT',
      '5 THE SPIRE', '6 THE WARD', '7 THE SANCTUM',
    ];
    for (const name of names) {
      await expect(page.getByRole('button', { name: new RegExp(`^${name}`) })).toBeVisible();
    }
    await expect(page.getByRole('button', { name: /^1 THE FOUNDRY/ })).toBeEnabled();
    await expect(page.getByRole('button', { name: /2 THE GULLET/ })).toBeDisabled();
    await expect(page.getByRole('button', { name: /2 THE GULLET/ })).toContainText('LOCKED');

    await page.evaluate(() => (window as unknown as { __GAME__: GameApi }).__GAME__.startCampaign(1));
    await page.waitForFunction(() => {
      return (window as unknown as { __GAME__?: GameApi }).__GAME__?.state()?.phase === 'playing';
    });
    await page.evaluate(() => (window as unknown as { __GAME__: GameApi }).__GAME__.completeMap());
    await expect(page.getByRole('button', { name: 'CONTINUE' })).toBeVisible();
    const camp = await page.evaluate(() => (window as unknown as { __GAME__: GameApi }).__GAME__.campaign());
    expect(camp.nextMap).toBe(2);

    await page.goto(BASE);
    await page.getByRole('button', { name: 'CAMPAIGN' }).click();
    await expect(page.getByRole('button', { name: /^2 THE GULLET/ })).toBeEnabled();
    await expect(page.getByRole('button', { name: /3 THE CATACOMBS/ })).toBeDisabled();
    await page.getByRole('button', { name: /^2 THE GULLET/ }).click();
    await page.waitForFunction(() => {
      const s = (window as unknown as { __GAME__?: GameApi }).__GAME__?.state();
      return s?.phase === 'playing' && s.campaign?.map === 2;
    });
  });

  test('startCampaign(n) plays the chosen map', async ({ page }) => {
    await page.goto(BASE);
    await page.evaluate(() => {
      (window as unknown as { __GAME__: GameApi }).__GAME__.startCampaign(3);
    });
    await page.waitForFunction(() => {
      const s = (window as unknown as { __GAME__?: GameApi }).__GAME__?.state();
      return s?.phase === 'playing' && s.campaign?.map === 3;
    });
    const state = await page.evaluate(() => (window as unknown as { __GAME__: GameApi }).__GAME__.state());
    expect(state.campaign?.map).toBe(3);
    expect(state.kind).toBe('campaign');
  });

  test('death retry restores the map and entry loadout', async ({ page }) => {
    await page.goto(BASE);
    await page.evaluate(() => (window as unknown as { __GAME__: GameApi }).__GAME__.startCampaign(1));
    await page.waitForFunction(() => {
      return (window as unknown as { __GAME__?: GameApi }).__GAME__?.state()?.phase === 'playing';
    });
    await page.evaluate(() => (window as unknown as { __GAME__: GameApi }).__GAME__.killPlayer());
    await page.waitForTimeout(2400);
    await expect(page.getByRole('button', { name: 'RETRY MAP' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'QUIT TO TITLE' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'NEW MAZE' })).toHaveCount(0);
    await page.getByRole('button', { name: 'RETRY MAP' }).click();
    await page.waitForFunction(() => {
      const s = (window as unknown as { __GAME__?: GameApi }).__GAME__?.state();
      return s?.phase === 'playing' && s.campaign?.map === 1;
    });
    const owned = await page.evaluate(() => (window as unknown as { __GAME__: GameApi }).__GAME__.state().campaign?.owned);
    expect(owned?.[0]).toBe(true);
    expect(owned?.[1]).toBe(false);
  });

  test('completeMap then CONTINUE starts the next map', async ({ page }) => {
    await page.goto(BASE);
    await page.evaluate(() => localStorage.removeItem('seventh-gun.campaign'));
    await page.evaluate(() => (window as unknown as { __GAME__: GameApi }).__GAME__.startCampaign(1));
    await page.waitForFunction(() => {
      return (window as unknown as { __GAME__?: GameApi }).__GAME__?.state()?.phase === 'playing';
    });
    await page.evaluate(() => (window as unknown as { __GAME__: GameApi }).__GAME__.completeMap());
    await expect(page.getByRole('button', { name: 'CONTINUE' })).toBeVisible();
    await expect(page.getByText('THE FOUNDRY')).toBeVisible();
    await page.getByRole('button', { name: 'CONTINUE' }).click();
    await page.waitForFunction(() => {
      const s = (window as unknown as { __GAME__?: GameApi }).__GAME__?.state();
      return s?.phase === 'playing' && s.campaign?.map === 2;
    });
    const camp = await page.evaluate(() => (window as unknown as { __GAME__: GameApi }).__GAME__.campaign());
    expect(camp.map).toBe(2);
    expect(camp.owned[1]).toBe(true);
  });

  test('title CONTINUE resumes after a completed map', async ({ page }) => {
    await page.goto(BASE);
    await page.evaluate(() => localStorage.removeItem('seventh-gun.campaign'));
    await page.evaluate(() => (window as unknown as { __GAME__: GameApi }).__GAME__.startCampaign(1));
    await page.waitForFunction(() => {
      return (window as unknown as { __GAME__?: GameApi }).__GAME__?.state()?.phase === 'playing';
    });
    await page.evaluate(() => (window as unknown as { __GAME__: GameApi }).__GAME__.completeMap());
    await page.getByRole('button', { name: 'CONTINUE' }).click();
    await page.waitForFunction(() => {
      return (window as unknown as { __GAME__?: GameApi }).__GAME__?.state()?.campaign?.map === 2;
    });
    await page.evaluate(() => (window as unknown as { __GAME__: { pause: () => void } }).__GAME__.pause());
    await page.getByRole('button', { name: 'QUIT TO TITLE' }).click();
    await expect(page.getByRole('button', { name: 'CAMPAIGN' })).toBeVisible();
    await page.getByRole('button', { name: 'CAMPAIGN' }).click();
    await expect(page.getByRole('button', { name: /CONTINUE/ })).toBeVisible();
    await page.getByRole('button', { name: /CONTINUE/ }).click();
    await page.waitForFunction(() => {
      const s = (window as unknown as { __GAME__?: GameApi }).__GAME__?.state();
      return s?.phase === 'playing' && s.campaign?.map === 2;
    });
  });
});

test.describe('campaign mobile', () => {
  test('title panel still fits with CAMPAIGN and FIRE is ≥44px', async ({ page }) => {
    test.skip(!test.info().project.name.startsWith('mobile'), 'mobile-only');
    await page.goto(BASE);
    await expect(page.getByRole('button', { name: 'CAMPAIGN' })).toBeVisible();
    const panel = page.locator('#title-screen .panel');
    const panelBox = await panel.boundingBox();
    expect(panelBox).not.toBeNull();
    expect(panelBox!.width).toBeLessThanOrEqual(390);
    expect(panelBox!.x + panelBox!.width).toBeLessThanOrEqual(390 + 1);
    expect(panelBox!.y + panelBox!.height).toBeLessThanOrEqual(844);
    await page.getByRole('button', { name: 'CAMPAIGN' }).click();
    await page.getByRole('button', { name: 'BEGIN' }).click();
    await page.waitForFunction(() => {
      return (window as unknown as { __GAME__?: GameApi }).__GAME__?.state()?.phase === 'playing';
    });
    const fireBox = await page.locator('#btn-fire').boundingBox();
    expect(fireBox).not.toBeNull();
    expect(Math.min(fireBox!.width, fireBox!.height)).toBeGreaterThanOrEqual(44);
  });
});
