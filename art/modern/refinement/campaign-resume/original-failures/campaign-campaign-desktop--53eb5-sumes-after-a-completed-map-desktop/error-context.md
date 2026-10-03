# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: campaign.spec.ts >> campaign desktop >> title CONTINUE resumes after a completed map
- Location: tests/e2e/campaign.spec.ts:221:3

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: page.waitForFunction: Test timeout of 30000ms exceeded.
```

# Test source

```ts
  139 |     expect(camp.nextMap).toBe(2);
  140 |
  141 |     await gotoGame(page, BASE);
  142 |     await page.getByRole('button', { name: 'CAMPAIGN' }).click();
  143 |     await expect(page.getByRole('button', { name: /^2 THE GULLET/ })).toBeEnabled();
  144 |     await expect(page.getByRole('button', { name: /3 THE CATACOMBS/ })).toBeDisabled();
  145 |     await page.getByRole('button', { name: /^2 THE GULLET/ }).click();
  146 |     await page.waitForFunction(() => {
  147 |       const s = (window as unknown as { __GAME__?: GameApi }).__GAME__?.state();
  148 |       return s?.phase === 'playing' && s.campaign?.map === 2;
  149 |     });
  150 |   });
  151 |
  152 |   test('startCampaign(n) plays the chosen map', async ({ page }) => {
  153 |     await gotoGame(page, BASE);
  154 |     await page.evaluate(() => {
  155 |       (window as unknown as { __GAME__: GameApi }).__GAME__.startCampaign(3);
  156 |     });
  157 |     await page.waitForFunction(() => {
  158 |       const s = (window as unknown as { __GAME__?: GameApi }).__GAME__?.state();
  159 |       return s?.phase === 'playing' && s.campaign?.map === 3;
  160 |     });
  161 |     const state = await page.evaluate(() => (window as unknown as { __GAME__: GameApi }).__GAME__.state());
  162 |     expect(state.campaign?.map).toBe(3);
  163 |     expect(state.kind).toBe('campaign');
  164 |   });
  165 |
  166 |   test('death retry restores the map and entry loadout', async ({ page }) => {
  167 |     // The sim-time-gated lockout below can legitimately need many real ticks
  168 |     // on a slow/throttled renderer (verified under 6x CPU throttling), so
  169 |     // give the whole test more room than the default budget.
  170 |     test.setTimeout(90000);
  171 |     await gotoGame(page, BASE);
  172 |     await page.evaluate(() => (window as unknown as { __GAME__: GameApi }).__GAME__.startCampaign(1));
  173 |     await page.waitForFunction(() => {
  174 |       return (window as unknown as { __GAME__?: GameApi }).__GAME__?.state()?.phase === 'playing';
  175 |     });
  176 |     await page.evaluate(() => (window as unknown as { __GAME__: GameApi }).__GAME__.killPlayer());
  177 |     // The death lockout is gated by sim.phaseTimer, which accumulates
  178 |     // simulated seconds per rendered tick (capped by dtReal in app/game.ts),
  179 |     // not wall-clock seconds — a slow/software-rendered runner can take much
  180 |     // longer than 2.4s of real time to accumulate 2.0s of sim time. Wait for
  181 |     // the sim to actually finish instead of assuming a fixed sleep suffices.
  182 |     await page.waitForFunction(
  183 |       () => (window as unknown as { __GAME__?: GameApi }).__GAME__?.state()?.phase === 'dead',
  184 |       null,
  185 |       { timeout: 75000 },
  186 |     );
  187 |     await expect(page.getByRole('button', { name: 'RETRY MAP' })).toBeVisible();
  188 |     await expect(page.getByRole('button', { name: 'QUIT TO TITLE' })).toBeVisible();
  189 |     await expect(page.getByRole('button', { name: 'NEW MAZE' })).toHaveCount(0);
  190 |     await page.getByRole('button', { name: 'RETRY MAP' }).click();
  191 |     await page.waitForFunction(() => {
  192 |       const s = (window as unknown as { __GAME__?: GameApi }).__GAME__?.state();
  193 |       return s?.phase === 'playing' && s.campaign?.map === 1;
  194 |     });
  195 |     const owned = await page.evaluate(() => (window as unknown as { __GAME__: GameApi }).__GAME__.state().campaign?.owned);
  196 |     expect(owned?.[0]).toBe(true);
  197 |     expect(owned?.[1]).toBe(false);
  198 |   });
  199 |
  200 |   test('completeMap then CONTINUE starts the next map', async ({ page }) => {
  201 |     await gotoGame(page, BASE);
  202 |     await page.evaluate(() => localStorage.removeItem('seventh-gun.campaign'));
  203 |     await page.evaluate(() => (window as unknown as { __GAME__: GameApi }).__GAME__.startCampaign(1));
  204 |     await page.waitForFunction(() => {
  205 |       return (window as unknown as { __GAME__?: GameApi }).__GAME__?.state()?.phase === 'playing';
  206 |     });
  207 |     await page.evaluate(() => (window as unknown as { __GAME__: GameApi }).__GAME__.completeMap());
  208 |     await expect(page.getByRole('button', { name: 'CONTINUE' })).toBeVisible();
  209 |     await expect(page.locator('#intermission-title')).toHaveText('THE FOUNDRY');
  210 |     await expect(page.locator('#intermission-title')).toBeVisible();
  211 |     await page.getByRole('button', { name: 'CONTINUE' }).click();
  212 |     await page.waitForFunction(() => {
  213 |       const s = (window as unknown as { __GAME__?: GameApi }).__GAME__?.state();
  214 |       return s?.phase === 'playing' && s.campaign?.map === 2;
  215 |     });
  216 |     const camp = await page.evaluate(() => (window as unknown as { __GAME__: GameApi }).__GAME__.campaign());
  217 |     expect(camp.map).toBe(2);
  218 |     expect(camp.owned[1]).toBe(true);
  219 |   });
  220 |
  221 |   test('title CONTINUE resumes after a completed map', async ({ page }) => {
  222 |     await gotoGame(page, BASE);
  223 |     await page.evaluate(() => localStorage.removeItem('seventh-gun.campaign'));
  224 |     await page.evaluate(() => (window as unknown as { __GAME__: GameApi }).__GAME__.startCampaign(1));
  225 |     await page.waitForFunction(() => {
  226 |       return (window as unknown as { __GAME__?: GameApi }).__GAME__?.state()?.phase === 'playing';
  227 |     });
  228 |     await page.evaluate(() => (window as unknown as { __GAME__: GameApi }).__GAME__.completeMap());
  229 |     await page.getByRole('button', { name: 'CONTINUE' }).click();
  230 |     await page.waitForFunction(() => {
  231 |       return (window as unknown as { __GAME__?: GameApi }).__GAME__?.state()?.campaign?.map === 2;
  232 |     });
  233 |     await page.evaluate(() => (window as unknown as { __GAME__: { pause: () => void } }).__GAME__.pause());
  234 |     await page.getByRole('button', { name: 'QUIT TO TITLE' }).click();
  235 |     await expect(page.getByRole('button', { name: 'CAMPAIGN' })).toBeVisible();
  236 |     await page.getByRole('button', { name: 'CAMPAIGN' }).click();
  237 |     await expect(page.getByRole('button', { name: /CONTINUE/ })).toBeVisible();
  238 |     await page.getByRole('button', { name: /CONTINUE/ }).click();
> 239 |     await page.waitForFunction(() => {
      |                ^ Error: page.waitForFunction: Test timeout of 30000ms exceeded.
  240 |       const s = (window as unknown as { __GAME__?: GameApi }).__GAME__?.state();
  241 |       return s?.phase === 'playing' && s.campaign?.map === 2;
  242 |     });
  243 |   });
  244 | });
  245 |
  246 | test.describe('campaign mobile', () => {
  247 |   test('title panel still fits with CAMPAIGN and FIRE is ≥44px', async ({ page }) => {
  248 |     test.skip(!test.info().project.name.startsWith('mobile'), 'mobile-only');
  249 |     await gotoGame(page, BASE);
  250 |     await expect(page.getByRole('button', { name: 'CAMPAIGN' })).toBeVisible();
  251 |     const panel = page.locator('#title-screen .panel');
  252 |     const panelBox = await panel.boundingBox();
  253 |     expect(panelBox).not.toBeNull();
  254 |     expect(panelBox!.width).toBeLessThanOrEqual(390);
  255 |     expect(panelBox!.x + panelBox!.width).toBeLessThanOrEqual(390 + 1);
  256 |     expect(panelBox!.y + panelBox!.height).toBeLessThanOrEqual(844);
  257 |     await page.getByRole('button', { name: 'CAMPAIGN' }).click();
  258 |     await page.getByRole('button', { name: 'BEGIN' }).click();
  259 |     await page.waitForFunction(() => {
  260 |       return (window as unknown as { __GAME__?: GameApi }).__GAME__?.state()?.phase === 'playing';
  261 |     });
  262 |     const fireBox = await page.locator('#btn-fire').boundingBox();
  263 |     expect(fireBox).not.toBeNull();
  264 |     expect(Math.min(fireBox!.width, fireBox!.height)).toBeGreaterThanOrEqual(44);
  265 |   });
  266 | });
  267 |
```
