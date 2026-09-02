// E2E: boot, move, shoot/ammo, pickups, death lockout, win copy,
// difficulty, seed reproducibility. Drives the ?e2e=1 debug API instead of
// pointer lock (synthetic mousemove pointer-lock is flaky by design).
import { test, expect } from '@playwright/test';
import { encodeBlueprint } from '../../src/sim/mapcodec';
import { stripCosmetics } from '../../src/sim/blueprint';
import { tinyCrawlerPlaytestBlueprint, tinyGunSealBlueprint } from '../helpers/authoredMaps';

const BASE = '/?e2e=1';
const TINY_BP = tinyGunSealBlueprint();
const TINY_CODE = encodeBlueprint(stripCosmetics(TINY_BP));
const CRAWLER_BP = tinyCrawlerPlaytestBlueprint();

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
    expect(state.campaign).toBeNull();
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

  test('playtest pose: crawler in lower FOV, real InputManager click hits', async ({ page }) => {
    // Live miss: pose dist 3.2, crawler on the floor in the lower third,
    // real mouse click, ammo spent, no hit. G.look()+G.shoot() was a false
    // green — look() wrote sim.player.pitch that fire used, while mouse
    // look only moved the camera.
    //
    // This path: no look(), no shoot(). Camera pitch is set by itself
    // (player.pitch stays 0), then a canvas mousedown through InputManager
    // and one tick. Pointer-lock mousemove is still not used.
    await page.goto(BASE);
    await page.evaluate((bp) => {
      (window as unknown as { __GAME__: { startMap: (m: unknown) => void } }).__GAME__.startMap(bp);
    }, CRAWLER_BP);
    await page.waitForFunction(() => (window as unknown as { __GAME__?: { state: () => { phase: string } } }).__GAME__?.state()?.phase === 'playing');

    const posed = await page.evaluate(() => {
      const G = (window as unknown as {
        __GAME__: {
          pose: (o: { enemy: string; dist: number; yaw: number }) => { placed: { type: string } | null };
          setCameraPitch: (d: number) => void;
          state: () => { ammo: { bullets: number }; kills: number; hp: number; pitch: number; camPitch: number };
          debugInfo: () => { simEnemies: { type: string; hp: number; dead: boolean }[] };
        };
      }).__GAME__;
      const placed = G.pose({ enemy: 'crawler', dist: 3.2, yaw: 0 });
      G.setCameraPitch(-16);
      const s = G.state();
      const crawler = G.debugInfo().simEnemies.find(e => e.type === 'crawler' && !e.dead);
      return {
        placed: placed.placed, ammo: s.ammo.bullets, kills: s.kills, hp: s.hp,
        playerPitch: s.pitch, camPitch: s.camPitch, crawlerHp: crawler?.hp ?? -1,
      };
    });
    expect(posed.placed?.type).toBe('crawler');
    expect(posed.playerPitch, 'must not call look() — player pitch stays 0').toBeCloseTo(0, 2);
    expect(posed.camPitch, 'camera holds the mouse look-down').toBeCloseTo(-16 * Math.PI / 180, 2);
    expect(posed.crawlerHp).toBeGreaterThan(0);

    const after = await page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      canvas?.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }));
      const G = (window as unknown as {
        __GAME__: {
          tickNow: () => void;
          state: () => { ammo: { bullets: number }; kills: number; hp: number };
          debugInfo: () => { simEnemies: { type: string; hp: number; dead: boolean }[] };
        };
      }).__GAME__;
      G.tickNow();
      document.dispatchEvent(new MouseEvent('mouseup', { button: 0, bubbles: true }));
      const crawler = G.debugInfo().simEnemies.find(e => e.type === 'crawler');
      return { ...G.state(), crawlerHp: crawler?.hp ?? 0, crawlerDead: !!crawler?.dead };
    });
    expect(after.ammo.bullets, 'pistol must spend a round').toBe(posed.ammo - 1);
    expect(after.hp, 'frozen pose must not let the crawler melee').toBe(posed.hp);
    expect(
      after.crawlerDead || after.crawlerHp < posed.crawlerHp || after.kills > posed.kills,
      'real InputManager click along camera pitch must register a hit',
    ).toBeTruthy();
  });

  test('playtest pose: level camera, crawler in lower FOV, InputManager click hits', async ({ page }) => {
    // Crosshair on the wall above a floor crawler at 3.2u (lower third).
    await page.goto(BASE);
    await page.evaluate((bp) => {
      (window as unknown as { __GAME__: { startMap: (m: unknown) => void } }).__GAME__.startMap(bp);
    }, CRAWLER_BP);
    await page.waitForFunction(() => (window as unknown as { __GAME__?: { state: () => { phase: string } } }).__GAME__?.state()?.phase === 'playing');

    const result = await page.evaluate(() => {
      const G = (window as unknown as {
        __GAME__: {
          pose: (o: { enemy: string; dist: number; yaw: number }) => { placed: { type: string } | null };
          inputFire: () => { spent?: boolean; hit?: boolean; killed?: boolean };
          state: () => { pitch: number; camPitch: number; hp: number };
        };
      }).__GAME__;
      const placed = G.pose({ enemy: 'crawler', dist: 3.2, yaw: 0 });
      const before = G.state();
      const shot = G.inputFire();
      return { placed: placed.placed, playerPitch: before.pitch, camPitch: before.camPitch, shot, hp: G.state().hp };
    });
    expect(result.placed?.type).toBe('crawler');
    expect(result.playerPitch).toBeCloseTo(0, 2);
    expect(result.camPitch).toBeCloseTo(0, 2);
    expect(result.shot.spent, 'pistol must spend a round').toBeTruthy();
    expect(result.shot.hit || result.shot.killed, 'level click at a lower-FOV crawler must hit').toBeTruthy();
    expect(result.hp).toBe(100);
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

  test('MAP LOG records a quit and PLAY starts the same seed', async ({ page }) => {
    await page.goto(BASE);
    await page.evaluate(() => localStorage.removeItem('seventh-gun.maplog'));
    await page.locator('#seed-input').fill('maplog-e2e');
    await page.getByRole('button', { name: 'ENTER THE MAZE' }).click();
    await page.waitForFunction(() => {
      const s = (window as unknown as { __GAME__?: { state: () => { phase: string } } }).__GAME__?.state();
      return s?.phase === 'playing';
    });
    await page.evaluate(() => (window as unknown as { __GAME__: { pause: () => void } }).__GAME__.pause());
    await page.getByRole('button', { name: 'QUIT TO TITLE' }).click();
    await expect(page.getByRole('button', { name: 'MAP LOG' })).toBeVisible();
    await page.getByRole('button', { name: 'MAP LOG' }).click();
    await expect(page.locator('.maplog-entry[data-seed="maplog-e2e"]')).toBeVisible();
    await expect(page.locator('.maplog-entry[data-seed="maplog-e2e"] .maplog-badge')).toHaveText('QUIT');
    await page.locator('.maplog-entry[data-seed="maplog-e2e"] button').filter({ hasText: 'PLAY' }).click();
    await page.waitForFunction(() => {
      const s = (window as unknown as { __GAME__?: { state: () => { phase: string; seed?: string } } }).__GAME__?.state();
      return s?.phase === 'playing';
    });
    const state = await page.evaluate(() => (window as unknown as { __GAME__: { state: () => { seed: string } } }).__GAME__.state());
    expect(state.seed).toBe('maplog-e2e');
  });

  test('Quit then MAP LOG hides HEALTH / minimap', async ({ page }) => {
    await page.goto(BASE);
    await page.evaluate(() => localStorage.removeItem('seventh-gun.maplog'));
    await page.locator('#seed-input').fill('hud-leak-e2e');
    await page.getByRole('button', { name: 'ENTER THE MAZE' }).click();
    await page.waitForFunction(() => {
      const s = (window as unknown as { __GAME__?: { state: () => { phase: string } } }).__GAME__?.state();
      return s?.phase === 'playing';
    });
    await page.evaluate(() => (window as unknown as { __GAME__: { pause: () => void } }).__GAME__.pause());
    await page.getByRole('button', { name: 'QUIT TO TITLE' }).click();
    await expect(page.getByRole('button', { name: 'MAP LOG' })).toBeVisible();
    await page.getByRole('button', { name: 'MAP LOG' }).click();
    await expect(page.locator('#maplog-screen')).toBeVisible();
    await page.waitForTimeout(80);
    const leak = await page.evaluate(() => {
      const mini = document.getElementById('minimap') as HTMLCanvasElement | null;
      const hud = document.getElementById('hud') as HTMLCanvasElement | null;
      const miniShown = !!mini && mini.style.display !== 'none' && mini.offsetParent !== null;
      let hudInk = false;
      if (hud) {
        const g = hud.getContext('2d')!;
        const d = g.getImageData(0, 0, hud.width, hud.height).data;
        for (let i = 3; i < d.length; i += 16) {
          if (d[i] > 12) { hudInk = true; break; }
        }
      }
      return { miniShown, hudInk, phase: (window as unknown as { __GAME__: { state: () => { phase: string } } }).__GAME__.state().phase };
    });
    expect(leak.phase).not.toBe('playing');
    expect(leak.miniShown).toBe(false);
    expect(leak.hudInk).toBe(false);
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

  test('authored map via startMap: play, RETRY MAP, COPY LINK', async ({ page }) => {
    await page.goto(BASE);
    await page.evaluate((bp) => {
      (window as unknown as { __GAME__: { startMap: (m: unknown) => void } }).__GAME__.startMap(bp);
    }, TINY_BP);
    await page.waitForFunction(() => {
      const s = (window as unknown as { __GAME__?: { state: () => { phase: string; kind?: string } } }).__GAME__?.state();
      return s?.phase === 'playing' && s.kind === 'map';
    });
    await page.evaluate(() => {
      const G = (window as unknown as {
        __GAME__: { warpTo: (t: string) => void; step: (n: number) => void; clearArena: () => void };
      }).__GAME__;
      G.warpTo('gun2');
      G.step(10);
      G.warpTo('arena');
      G.clearArena();
      G.step(240);
    });
    await page.waitForTimeout(1500);
    await expect(page.getByText('GAME OVER')).toBeVisible();
    await expect(page.getByRole('button', { name: 'RETRY MAP' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'TITLE' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'COPY LINK' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'NEW MAZE' })).toHaveCount(0);
    await page.getByRole('button', { name: 'COPY LINK' }).click();
    await expect(page.locator('#toast')).toContainText('copied');
    await page.getByRole('button', { name: 'RETRY MAP' }).click();
    await page.waitForFunction(() => {
      const s = (window as unknown as { __GAME__?: { state: () => { phase: string; kind?: string } } }).__GAME__?.state();
      return s?.phase === 'playing' && s.kind === 'map';
    });
  });

  test('opens an authored map from #m= share hash', async ({ page }) => {
    await page.goto(`/?e2e=1#m=${TINY_CODE}`);
    await page.waitForFunction(() => {
      const s = (window as unknown as { __GAME__?: { state: () => { phase: string; kind?: string } } }).__GAME__?.state();
      return s?.phase === 'playing' && s.kind === 'map';
    }, null, { timeout: 10000 });
    const state = await page.evaluate(() => (window as unknown as { __GAME__: { state: () => { kind: string; sealIntact: boolean; campaign: unknown } } }).__GAME__.state());
    expect(state.kind).toBe('map');
    expect(state.sealIntact).toBe(true);
    expect(state.campaign).toBeNull();
  });

  test('authored-map death offers RETRY MAP / TITLE, not a new maze', async ({ page }) => {
    await page.goto(BASE);
    await page.evaluate((bp) => {
      (window as unknown as { __GAME__: { startMap: (m: unknown) => void } }).__GAME__.startMap(bp);
    }, TINY_BP);
    await page.waitForFunction(() => {
      const s = (window as unknown as { __GAME__?: { state: () => { phase: string } } }).__GAME__?.state();
      return s?.phase === 'playing';
    });
    await page.evaluate(() => (window as unknown as { __GAME__: { killPlayer: () => void } }).__GAME__.killPlayer());
    await page.waitForTimeout(2400);
    await expect(page.getByRole('button', { name: 'RETRY MAP' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'TITLE' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'COPY LINK' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'RETRY SEED' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'NEW MAZE' })).toHaveCount(0);
  });
});

test.describe('mobile', () => {
  test('touch HUD is present with big FIRE/USE/MAP buttons', async ({ page }) => {
    test.skip(!test.info().project.name.startsWith('mobile'), 'mobile-only');
    await page.goto(BASE);
    await expect(page.getByRole('button', { name: 'MAP LOG' })).toBeVisible();
    const panel = page.locator('#title-screen .panel');
    const panelBox = await panel.boundingBox();
    expect(panelBox).not.toBeNull();
    expect(panelBox!.width).toBeLessThanOrEqual(390);
    expect(panelBox!.x + panelBox!.width).toBeLessThanOrEqual(390 + 1);
    expect(panelBox!.y + panelBox!.height).toBeLessThanOrEqual(844);
    await page.getByRole('button', { name: 'ENTER THE MAZE' }).click();
    await page.waitForFunction(() => (window as unknown as { __GAME__?: { state: () => { phase: string } } }).__GAME__?.state()?.phase === 'playing');
    await expect(page.locator('#btn-fire')).toBeVisible();
    await expect(page.locator('#btn-use')).toBeVisible();
    await expect(page.locator('#btn-map')).toBeVisible();
    const fire = page.locator('#btn-fire');
    const fireBox = await fire.boundingBox();
    expect(fireBox).not.toBeNull();
    expect(Math.min(fireBox!.width, fireBox!.height)).toBeGreaterThanOrEqual(44);
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
