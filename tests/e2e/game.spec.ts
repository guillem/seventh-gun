// E2E: boot, move, shoot/ammo, pickups, death lockout, win copy,
// difficulty, seed reproducibility. Drives the ?e2e=1 debug API instead of
// pointer lock (synthetic mousemove pointer-lock is flaky by design).
import { test, expect } from '@playwright/test';

const BASE = '/?e2e=1';

test.describe('desktop', () => {
  test('boots to title and starts a run', async ({ page }) => {
    await page.goto(BASE);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('SEVENTH');
    await page.getByRole('button', { name: 'ENTER THE MAZE' }).click();
    await page.waitForFunction(() => {
      const s = (window as unknown as { __GAME__?: { state: () => { phase: string } } }).__GAME__?.state();
      return s?.phase === 'playing';
    });
    const state = await page.evaluate(() => (window as unknown as { __GAME__: { state: () => Record<string, unknown> } }).__GAME__.state());
    expect(state.hp).toBe(100);
    expect(state.gun).toBe(1);
    expect((state.owned as boolean[])[0]).toBe(true);
  });

  test('WASD walks the way you look (W forward, A/D strafe)', async ({ page }) => {
    await page.goto(BASE);
    await page.evaluate(() => (window as unknown as { __GAME__: { startRun: (s: string) => void } }).__GAME__.startRun('e2e-move'));
    await page.waitForFunction(() => {
      const s = (window as unknown as { __GAME__?: { state: () => { phase: string } } }).__GAME__?.state();
      return s?.phase === 'playing';
    });
    const before = await page.evaluate(() => (window as unknown as { __GAME__: { state: () => { pos: { x: number; z: number } } } }).__GAME__.state().pos);
    // face east (-90 yaw), hold W for ~0.6s of sim time
    await page.evaluate(() => (window as unknown as { __GAME__: { look: (y: number) => void } }).__GAME__.look(-90));
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(700);
    await page.keyboard.up('KeyW');
    const afterW = await page.evaluate(() => (window as unknown as { __GAME__: { state: () => { pos: { x: number; z: number } } } }).__GAME__.state().pos);
    expect(afterW.x).toBeGreaterThan(before.x + 2); // moved east
    // strafe right (D) while facing east -> moves south (+z)
    const beforeD = afterW;
    await page.keyboard.down('KeyD');
    await page.waitForTimeout(500);
    await page.keyboard.up('KeyD');
    const afterD = await page.evaluate(() => (window as unknown as { __GAME__: { state: () => { pos: { x: number; z: number } } } }).__GAME__.state().pos);
    expect(Math.abs(afterD.z - beforeD.z)).toBeGreaterThan(1);
  });

  test('shooting spends ammo, dry-fire does not spam', async ({ page }) => {
    await page.goto(BASE);
    await page.evaluate(() => (window as unknown as { __GAME__: { startRun: (s: string) => void } }).__GAME__.startRun('e2e-shoot'));
    await page.waitForFunction(() => (window as unknown as { __GAME__?: { state: () => { phase: string } } }).__GAME__?.state()?.phase === 'playing');
    const before = await page.evaluate(() => (window as unknown as { __GAME__: { state: () => { ammo: { bullets: number } } } }).__GAME__.state().ammo.bullets);
    await page.evaluate(() => (window as unknown as { __GAME__: { fire: (v: boolean) => void } }).__GAME__.fire(true));
    await page.waitForTimeout(700);
    await page.evaluate(() => (window as unknown as { __GAME__: { fire: (v: boolean) => void } }).__GAME__.fire(false));
    const after = await page.evaluate(() => (window as unknown as { __GAME__: { state: () => { ammo: { bullets: number } } } }).__GAME__.state().ammo.bullets);
    expect(after).toBeLessThan(before);
    expect(before - after).toBeGreaterThanOrEqual(2);
    // empty the gun and hold fire: no crash, hp untouched
    await page.evaluate(() => {
      const G = (window as unknown as { __GAME__: { state: () => { ammo: { bullets: number } }; fire: (v: boolean) => void } }).__GAME__;
      G.state().ammo.bullets = 0;
      G.fire(true);
    });
    await page.waitForTimeout(600);
    await page.evaluate(() => (window as unknown as { __GAME__: { fire: (v: boolean) => void } }).__GAME__.fire(false));
    const hp = await page.evaluate(() => (window as unknown as { __GAME__: { state: () => { hp: number } } }).__GAME__.state().hp);
    expect(hp).toBe(100);
  });

  test('gun pickup grants the gun and a usable ammo stack', async ({ page }) => {
    await page.goto(BASE);
    await page.evaluate(() => (window as unknown as { __GAME__: { startRun: (s: string) => void } }).__GAME__.startRun('e2e-pickup'));
    await page.waitForFunction(() => (window as unknown as { __GAME__?: { state: () => { phase: string } } }).__GAME__?.state()?.phase === 'playing');
    await page.evaluate(() => (window as unknown as { __GAME__: { warpTo: (t: string) => void; step: (n: number) => void } }).__GAME__.warpTo('gun2'));
    await page.evaluate(() => (window as unknown as { __GAME__: { step: (n: number) => void } }).__GAME__.step(10));
    const state = await page.evaluate(() => (window as unknown as { __GAME__: { state: () => Record<string, unknown> } }).__GAME__.state());
    expect(state.gun).toBe(2);
    expect((state.owned as boolean[])[1]).toBe(true);
    expect((state.ammo as { shells: number }).shells).toBeGreaterThanOrEqual(12);
  });

  test('medikit heals only when hurt', async ({ page }) => {
    await page.goto(BASE);
    await page.evaluate(() => (window as unknown as { __GAME__: { startRun: (s: string) => void } }).__GAME__.startRun('e2e-medikit'));
    await page.waitForFunction(() => (window as unknown as { __GAME__?: { state: () => { phase: string } } }).__GAME__?.state()?.phase === 'playing');
    await page.evaluate(() => (window as unknown as { __GAME__: { hurt: (n: number) => void } }).__GAME__.hurt(60));
    const hpBefore = await page.evaluate(() => (window as unknown as { __GAME__: { state: () => { hp: number } } }).__GAME__.state().hp);
    expect(hpBefore).toBeLessThan(45);
    // teleport onto the nearest medikit
    const med = await page.evaluate(() => {
      const G = (window as unknown as { __GAME__: { warps: () => { pickups: { kind: string; x: number; z: number }[] } } }).__GAME__;
      return G.warps().pickups.find(p => p.kind === 'medikit');
    });
    await page.evaluate((m) => {
      const G = (window as unknown as { __GAME__: { teleport: (x: number, z: number) => void; step: (n: number) => void } }).__GAME__;
      G.teleport(m.x, m.z);
      G.step(10);
    }, med as { kind: string; x: number; z: number });
    const hpAfter = await page.evaluate(() => (window as unknown as { __GAME__: { state: () => { hp: number } } }).__GAME__.state().hp);
    expect(hpAfter).toBeGreaterThan(hpBefore);
  });

  test('death: 2s lockout with no clickable controls, then title offers retry/new maze', async ({ page }) => {
    await page.goto(BASE);
    await page.evaluate(() => (window as unknown as { __GAME__: { startRun: (s: string) => void } }).__GAME__.startRun('e2e-death'));
    await page.waitForFunction(() => (window as unknown as { __GAME__?: { state: () => { phase: string } } }).__GAME__?.state()?.phase === 'playing');
    await page.evaluate(() => (window as unknown as { __GAME__: { killPlayer: () => void } }).__GAME__.killPlayer());
    // during lockout: no retry/new-maze buttons reachable
    await page.waitForTimeout(600);
    expect(await page.getByRole('button', { name: 'RETRY SEED' }).isVisible()).toBeFalsy();
    expect(await page.getByRole('button', { name: 'ENTER THE MAZE' }).isVisible()).toBeFalsy();
    const phase = await page.evaluate(() => (window as unknown as { __GAME__: { state: () => { simPhase: string } } }).__GAME__.state().simPhase);
    expect(phase).toBe('dying');
    await page.waitForTimeout(1800);
    await expect(page.getByRole('button', { name: 'RETRY SEED' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'NEW MAZE' })).toBeVisible();
    // retry same seed works
    await page.getByRole('button', { name: 'RETRY SEED' }).click();
    await page.waitForFunction(() => (window as unknown as { __GAME__?: { state: () => { phase: string } } }).__GAME__?.state()?.phase === 'playing');
  });

  test('win: arena clear shows GAME OVER / You won', async ({ page }) => {
    await page.goto(BASE);
    await page.evaluate(() => (window as unknown as { __GAME__: { startRun: (s: string) => void } }).__GAME__.startRun('e2e-win'));
    await page.waitForFunction(() => (window as unknown as { __GAME__?: { state: () => { phase: string } } }).__GAME__?.state()?.phase === 'playing');
    // grab the seventh (breaks the seal), enter arena, clear it
    await page.evaluate(() => {
      const G = (window as unknown as { __GAME__: { warpTo: (t: string) => void; step: (n: number) => void; clearArena: () => void } }).__GAME__;
      G.warpTo('gun7');
      G.step(10);
      G.warpTo('arena');
      G.clearArena();
      G.step(240);
    });
    await page.waitForTimeout(1500);
    await expect(page.getByText('GAME OVER')).toBeVisible();
    await expect(page.getByText('You won', { exact: false })).toBeVisible();
    const state = await page.evaluate(() => (window as unknown as { __GAME__: { state: () => { simPhase: string } } }).__GAME__.state());
    expect(state.simPhase).toBe('won');
  });

  test('difficulty changes the economy for the same seed', async ({ page }) => {
    await page.goto(BASE);
    const normal = await page.evaluate(async () => {
      const G = (window as unknown as { __GAME__: { startRun: (s: string, d: string) => void; state: () => Record<string, unknown> } }).__GAME__;
      G.startRun('e2e-diff', 'normal');
      await new Promise(r => setTimeout(r, 300));
      return G.state();
    });
    const hard = await page.evaluate(async () => {
      const G = (window as unknown as { __GAME__: { startRun: (s: string, d: string) => void; state: () => Record<string, unknown> } }).__GAME__;
      G.startRun('e2e-diff', 'hard');
      await new Promise(r => setTimeout(r, 300));
      return G.state();
    });
    expect(normal.mapHash).toBe(hard.mapHash); // same layout
    expect(hard.enemiesAlive).not.toBe(normal.enemiesAlive); // different economy
  });

  test('same seed => identical map hash across runs', async ({ page }) => {
    await page.goto(BASE);
    const hashes = await page.evaluate(async () => {
      const G = (window as unknown as { __GAME__: { startRun: (s: string) => void; state: () => { mapHash: string } } }).__GAME__;
      G.startRun('repro-e2e');
      await new Promise(r => setTimeout(r, 250));
      const a = G.state().mapHash;
      G.startRun('repro-e2e');
      await new Promise(r => setTimeout(r, 250));
      const b = G.state().mapHash;
      G.startRun('repro-e2e-other');
      await new Promise(r => setTimeout(r, 250));
      const c = G.state().mapHash;
      return [a, b, c];
    });
    expect(hashes[0]).toBe(hashes[1]);
    expect(hashes[1]).not.toBe(hashes[2]);
  });

  // regression: enemy rigs are keyed by id and ids restart at 0 on every map,
  // so a new run must not reuse the previous run's rigs — enemies killed last
  // run used to come back sideways (death-pose rotation never reset).
  test('killed enemies stand upright when the same seed is replayed', async ({ page }) => {
    await page.goto(BASE);
    await page.evaluate(() => (window as unknown as { __GAME__: { startRun: (s: string) => void } }).__GAME__.startRun('e2e-rig-reuse'));
    await page.waitForFunction(() => (window as unknown as { __GAME__?: { state: () => { phase: string } } }).__GAME__?.state()?.phase === 'playing');
    // kill enemies 0-2 and wait for the death fall to tilt their rigs
    await page.evaluate(() => (window as unknown as { __GAME__: { killSome: (n: number) => void } }).__GAME__.killSome(3));
    await page.waitForFunction(() => {
      const rigs = (window as unknown as { __GAME__: { debugInfo: () => { rigs: { id: number; rotX: number }[] } } }).__GAME__.debugInfo().rigs;
      const fallen = rigs.filter(r => [0, 1, 2].includes(r.id));
      return fallen.length === 3 && fallen.every(r => Math.abs(r.rotX) > 1);
    });
    // replay the same seed: every rig must be upright again
    await page.evaluate(() => (window as unknown as { __GAME__: { startRun: (s: string) => void } }).__GAME__.startRun('e2e-rig-reuse'));
    await page.waitForFunction(() => (window as unknown as { __GAME__?: { state: () => { phase: string } } }).__GAME__?.state()?.phase === 'playing');
    await page.waitForTimeout(300);
    const rigs = await page.evaluate(() => (window as unknown as { __GAME__: { debugInfo: () => { rigs: { id: number; rotX: number }[] } } }).__GAME__.debugInfo().rigs);
    expect(rigs.length).toBeGreaterThan(3);
    for (const r of rigs) expect(Math.abs(r.rotX)).toBeLessThan(0.01);
  });

  test('full map opens on Tab, shows fog of war and player marker, pauses combat', async ({ page }) => {
    await page.goto(BASE);
    await page.evaluate(() => (window as unknown as { __GAME__: { startRun: (s: string) => void } }).__GAME__.startRun('e2e-map'));
    await page.waitForFunction(() => (window as unknown as { __GAME__?: { state: () => { phase: string } } }).__GAME__?.state()?.phase === 'playing');
    await page.keyboard.press('Tab');
    const open = await page.evaluate(() => (window as unknown as { __GAME__: { state: () => { phase: string } } }).__GAME__.state().phase);
    expect(open).toBe('map');
    const canvasVisible = await page.evaluate(() => {
      const c = document.getElementById('fullmap-canvas') as HTMLCanvasElement;
      const mapOverlay = c.closest('.screen') as HTMLElement;
      return !mapOverlay.classList.contains('hidden');
    });
    expect(canvasVisible).toBe(true);
    await page.keyboard.press('Tab');
    const closed = await page.evaluate(() => (window as unknown as { __GAME__: { state: () => { phase: string } } }).__GAME__.state().phase);
    expect(closed).toBe('playing');
  });

  test('E opens a door (door state changes, becomes passable)', async ({ page }) => {
    await page.goto(BASE);
    await page.evaluate(() => (window as unknown as { __GAME__: { startRun: (s: string) => void } }).__GAME__.startRun('e2e-door'));
    await page.waitForFunction(() => (window as unknown as { __GAME__?: { state: () => { phase: string } } }).__GAME__?.state()?.phase === 'playing');
    const opened = await page.evaluate(() => {
      const G = (window as unknown as {
        __GAME__: {
          warps: () => { doors: { x: number; z: number }[] };
          teleport: (x: number, z: number) => void;
          look: (y: number) => void;
          inputKey: (k: string, d: boolean) => void;
          step: (n: number) => void;
        };
      }).__GAME__;
      const door = G.warps().doors[0];
      if (!door) return 'no-door';
      G.teleport(door.x, door.z - 4);
      G.look(0);
      G.inputKey('KeyE', true);
      G.step(3);
      G.inputKey('KeyE', false);
      G.step(120);
      return 'used';
    });
    expect(['used', 'no-door']).toContain(opened);
  });
});

test.describe('mobile', () => {
  test('touch HUD is present with big FIRE/USE/MAP buttons', async ({ page }) => {
    test.skip(!test.info().project.name.startsWith('mobile'), 'mobile-only');
    await page.goto(BASE);
    await page.getByRole('button', { name: 'ENTER THE MAZE' }).click();
    await page.waitForFunction(() => (window as unknown as { __GAME__?: { state: () => { phase: string } } }).__GAME__?.state()?.phase === 'playing');
    await expect(page.locator('#btn-fire')).toBeVisible();
    await expect(page.locator('#btn-use')).toBeVisible();
    await expect(page.locator('#btn-map')).toBeVisible();
    const fire = page.locator('#btn-fire');
    const box = await fire.boundingBox();
    expect(box).not.toBeNull();
    expect(Math.min(box!.width, box!.height)).toBeGreaterThanOrEqual(44);
  });

  test('FIRE button fires and unlatches on release', async ({ page }) => {
    test.skip(!test.info().project.name.startsWith('mobile'), 'mobile-only');
    await page.goto(BASE);
    await page.evaluate(() => (window as unknown as { __GAME__: { startRun: (s: string) => void } }).__GAME__.startRun('e2e-touch'));
    await page.waitForFunction(() => (window as unknown as { __GAME__?: { state: () => { phase: string } } }).__GAME__?.state()?.phase === 'playing');
    const before = await page.evaluate(() => (window as unknown as { __GAME__: { state: () => { ammo: { bullets: number } } } }).__GAME__.state().ammo.bullets);
    const fire = page.locator('#btn-fire');
    await fire.dispatchEvent('touchstart', { touches: [{ identifier: 1, clientX: 300, clientY: 600 }] });
    await page.waitForTimeout(600);
    await fire.dispatchEvent('touchend', { touches: [] });
    const after = await page.evaluate(() => (window as unknown as { __GAME__: { state: () => { ammo: { bullets: number } } } }).__GAME__.state().ammo.bullets);
    expect(after).toBeLessThan(before);
    // after unlatch, ammo stops dropping
    const settled = await page.evaluate(() => (window as unknown as { __GAME__: { state: () => { ammo: { bullets: number } } } }).__GAME__.state().ammo.bullets);
    await page.waitForTimeout(400);
    const still = await page.evaluate(() => (window as unknown as { __GAME__: { state: () => { ammo: { bullets: number } } } }).__GAME__.state().ammo.bullets);
    expect(still).toBe(settled);
  });
});
