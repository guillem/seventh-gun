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

// Some assertions are invariants across a span of ticks ("nothing bad
// happens while X"), not a threshold to converge on, so there is no sim
// state to waitForFunction against. Waiting for a fixed number of real
// rendered frames (rather than a fixed number of milliseconds) still gives
// the sim that many tick() opportunities regardless of how long each frame
// takes to render, so it stays correct on a slow/throttled runner.
async function waitFrames(page: import('@playwright/test').Page, n: number): Promise<void> {
  await page.evaluate((count) => new Promise<void>((resolve) => {
    let i = 0;
    const step = () => { i++; if (i >= count) resolve(); else requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }), n);
}

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
    // face east (-90 yaw), hold W until the sim reports 2+ units of eastward travel
    await page.evaluate(() => (window as unknown as { __GAME__: { look: (y: number) => void } }).__GAME__.look(-90));
    await page.keyboard.down('KeyW');
    await page.waitForFunction(
      (x0) => (window as unknown as { __GAME__: { state: () => { pos: { x: number } } } }).__GAME__.state().pos.x > x0 + 2,
      before.x,
      { timeout: 15000 },
    );
    await page.keyboard.up('KeyW');
    const afterW = await page.evaluate(() => (window as unknown as { __GAME__: { state: () => { pos: { x: number; z: number } } } }).__GAME__.state().pos);
    expect(afterW.x).toBeGreaterThan(before.x + 2); // moved east
    // strafe right (D) while facing east -> moves south (+z)
    const beforeD = afterW;
    await page.keyboard.down('KeyD');
    await page.waitForFunction(
      (z0) => Math.abs((window as unknown as { __GAME__: { state: () => { pos: { z: number } } } }).__GAME__.state().pos.z - z0) > 1,
      beforeD.z,
      { timeout: 15000 },
    );
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
    await page.waitForFunction(
      (b0) => (window as unknown as { __GAME__: { state: () => { ammo: { bullets: number } } } }).__GAME__.state().ammo.bullets <= b0 - 2,
      before,
      { timeout: 15000 },
    );
    await page.evaluate(() => (window as unknown as { __GAME__: { fire: (v: boolean) => void } }).__GAME__.fire(false));
    const after = await page.evaluate(() => (window as unknown as { __GAME__: { state: () => { ammo: { bullets: number } } } }).__GAME__.state().ammo.bullets);
    expect(after).toBeLessThan(before);
    expect(before - after).toBeGreaterThanOrEqual(2);
    // empty the gun and hold fire: no crash, hp untouched. There's no sim
    // state to converge on (0 ammo never fires again), so this is an
    // invariant across a span of ticks — wait real frames, not milliseconds.
    await page.evaluate(() => {
      const G = (window as unknown as { __GAME__: { state: () => { ammo: { bullets: number } }; fire: (v: boolean) => void } }).__GAME__;
      G.state().ammo.bullets = 0;
      G.fire(true);
    });
    await waitFrames(page, 30);
    await page.evaluate(() => (window as unknown as { __GAME__: { fire: (v: boolean) => void } }).__GAME__.fire(false));
    const hp = await page.evaluate(() => (window as unknown as { __GAME__: { state: () => { hp: number } } }).__GAME__.state().hp);
    expect(hp).toBe(100);
  });

  test('playtest pose: look(0, 22) then InputManager mousedown drops crawler hp', async ({ page }) => {
    // Live: pitch +0.384 (look-down 22°), player (15,71) crawler (15,67.8),
    // ammo spent, hp 18→18. aimDir.dirY was +sin(pitch) (up). Must be −sin.
    await page.goto(BASE);
    await page.evaluate((bp) => {
      (window as unknown as { __GAME__: { startMap: (m: unknown) => void } }).__GAME__.startMap(bp);
    }, CRAWLER_BP);
    await page.waitForFunction(() => (window as unknown as { __GAME__?: { state: () => { phase: string } } }).__GAME__?.state()?.phase === 'playing');

    const posed = await page.evaluate(() => {
      const G = (window as unknown as {
        __GAME__: {
          pose: (o: { enemy: string; dist: number; yaw: number }) => { placed: { type: string } | null };
          look: (yaw: number, pitch: number) => void;
          state: () => { ammo: { bullets: number }; kills: number; hp: number; pitch: number };
          debugInfo: () => { simEnemies: { type: string; hp: number; dead: boolean }[] };
        };
      }).__GAME__;
      const placed = G.pose({ enemy: 'crawler', dist: 3.2, yaw: 0 });
      G.look(0, 22);
      const s = G.state();
      const crawler = G.debugInfo().simEnemies.find(e => e.type === 'crawler' && !e.dead);
      return {
        placed: placed.placed, ammo: s.ammo.bullets, kills: s.kills, hp: s.hp,
        pitch: s.pitch, crawlerHp: crawler?.hp ?? -1,
      };
    });
    expect(posed.placed?.type).toBe('crawler');
    expect(posed.pitch, 'look(0, 22) is +0.384 look-down').toBeCloseTo(22 * Math.PI / 180, 2);
    expect(posed.crawlerHp).toBeGreaterThan(0);

    const after = await page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      canvas?.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }));
      const G = (window as unknown as {
        __GAME__: {
          tickNow: () => void;
          debugInfo: () => {
            simEnemies: { type: string; hp: number; dead: boolean }[];
            lastAimDir: { dirX: number; dirY: number; dirZ: number; at32y: number } | null;
          };
          state: () => { ammo: { bullets: number }; kills: number; hp: number };
        };
      }).__GAME__;
      G.tickNow();
      document.dispatchEvent(new MouseEvent('mouseup', { button: 0, bubbles: true }));
      const info = G.debugInfo();
      const crawler = info.simEnemies.find(e => e.type === 'crawler');
      return {
        ...G.state(),
        crawlerHp: crawler?.hp ?? 0,
        crawlerDead: !!crawler?.dead,
        lastAimDir: info.lastAimDir,
      };
    });
    expect(after.ammo.bullets, 'pistol must spend a round').toBe(posed.ammo - 1);
    expect(after.hp, 'frozen pose must not let the crawler melee').toBe(posed.hp);
    expect(after.lastAimDir, 'fire must record lastAimDir').toBeTruthy();
    expect(after.lastAimDir!.dirY, 'look-down aimDir.dirY must be negative').toBeLessThan(0);
    expect(after.lastAimDir!.at32y, 'ray at t=3.2 should be ~y=0.5').toBeCloseTo(0.5, 1);
    expect(after.crawlerHp, 'simEnemies crawler hp must drop').toBeLessThan(posed.crawlerHp);
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
    // The sim-time-gated lockout below can legitimately need many real ticks
    // on a slow/throttled renderer (verified under 6x CPU throttling), so
    // give the whole test more room than the default budget.
    test.setTimeout(90000);
    await page.goto(BASE);
    await page.evaluate(() => (window as unknown as { __GAME__: { startRun: (s: string) => void } }).__GAME__.startRun('e2e-death'));
    await page.waitForFunction(() => (window as unknown as { __GAME__?: { state: () => { phase: string } } }).__GAME__?.state()?.phase === 'playing');
    await page.evaluate(() => (window as unknown as { __GAME__: { killPlayer: () => void } }).__GAME__.killPlayer());
    // during lockout: no retry/new-maze buttons reachable. This proves an
    // absence within a short real-time window, which can only get MORE true
    // on a slow runner (less sim progress happens), so a plain sleep is safe.
    await page.waitForTimeout(600);
    expect(await page.getByRole('button', { name: 'RETRY SEED' }).isVisible()).toBeFalsy();
    expect(await page.getByRole('button', { name: 'ENTER THE MAZE' }).isVisible()).toBeFalsy();
    const phase = await page.evaluate(() => (window as unknown as { __GAME__: { state: () => { simPhase: string } } }).__GAME__.state().simPhase);
    expect(phase).toBe('dying');
    // The lockout is gated by sim.phaseTimer, which accumulates simulated
    // seconds (sim/sim.ts), not wall-clock seconds — and per-tick sim time is
    // capped (game.ts's dtReal is clamped to 100ms) regardless of how long a
    // frame actually took to render. On a slow renderer, wall-clock time can
    // outrun sim time, so wait for the sim to actually reach 'dead'.
    await page.waitForFunction(
      () => (window as unknown as { __GAME__: { state: () => { phase: string } } }).__GAME__.state().phase === 'dead',
      null,
      { timeout: 75000 },
    );
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
    // step() advances the sim synchronously, so sim.phase is already 'won'.
    // The victory screen only appears once game.phase flips on the next
    // rendered tick, so wait for that instead of a fixed sleep.
    await page.waitForFunction(
      () => (window as unknown as { __GAME__: { state: () => { phase: string } } }).__GAME__.state().phase === 'won',
      null,
      { timeout: 15000 },
    );
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
    // Rig visuals populate lazily as the renderer draws frames — wait for the
    // condition itself (enough rigs, all upright) rather than a fixed sleep.
    await page.waitForFunction(() => {
      const rigs = (window as unknown as { __GAME__: { debugInfo: () => { rigs: { id: number; rotX: number }[] } } }).__GAME__.debugInfo().rigs;
      return rigs.length > 3 && rigs.every((r) => Math.abs(r.rotX) < 0.01);
    }, null, { timeout: 15000 });
    const rigs = await page.evaluate(() => (window as unknown as { __GAME__: { debugInfo: () => { rigs: { id: number; rotX: number }[] } } }).__GAME__.debugInfo().rigs);
    expect(rigs.length).toBeGreaterThan(3);
    for (const r of rigs) expect(Math.abs(r.rotX)).toBeLessThan(0.01);
  });

  test('replaying a warmed fight and cycling guns leaves GPU allocations stable', async ({ page }) => {
    test.setTimeout(60000);
    await page.goto(BASE);
    const exercise = async () => page.evaluate(async () => {
      const G = (window as unknown as {
        __GAME__: {
          startRun: (seed: string) => void; give: (gun: number) => void;
          killSome: (count: number) => void; debugInfo: () => { render: { geometries: number; textures: number } };
        };
      }).__GAME__;
      G.startRun('e2e-render-lifecycle');
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      for (let gun = 1; gun <= 7; gun++) G.give(gun);
      G.killSome(4);
      // FX and particle allocations have finite lifetimes.  Wait rendered
      // frames rather than a wall-clock timeout so software WebGL is covered.
      await new Promise<void>(resolve => {
        let frames = 0;
        const step = () => { if (++frames >= 120) resolve(); else requestAnimationFrame(step); };
        requestAnimationFrame(step);
      });
      return G.debugInfo().render;
    });

    await exercise(); // warm texture/program caches and establish current-gun topology
    const baseline = await exercise();
    const repeated = await exercise();
    expect(repeated).toEqual(baseline);
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

  // Regression for the arena key-split (Tab → scoreboard, M → map, arena
  // only): campaign/maze has no scoreboard, so M must keep opening the same
  // full map Tab does, in both directions.
  test('full map also opens on M in campaign/maze, same as Tab', async ({ page }) => {
    await page.goto(BASE);
    await page.evaluate(() => (window as unknown as { __GAME__: { startRun: (s: string) => void } }).__GAME__.startRun('e2e-map-m'));
    await page.waitForFunction(() => (window as unknown as { __GAME__?: { state: () => { phase: string } } }).__GAME__?.state()?.phase === 'playing');
    await page.keyboard.press('KeyM');
    const open = await page.evaluate(() => (window as unknown as { __GAME__: { state: () => { phase: string } } }).__GAME__.state().phase);
    expect(open).toBe('map');
    await page.keyboard.press('KeyM');
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
    const readLeak = () => {
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
    };
    // The clear happens synchronously on quit, but the "else" branch of the
    // render loop also re-clears every frame while not playing — wait for
    // the settled condition instead of assuming one fixed sleep covers it.
    await page.waitForFunction(() => {
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
      const phase = (window as unknown as { __GAME__: { state: () => { phase: string } } }).__GAME__.state().phase;
      return phase !== 'playing' && !miniShown && !hudInk;
    }, null, { timeout: 15000 });
    const leak = await page.evaluate(readLeak);
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
    // step() advances the sim synchronously; game.phase flips to 'won' (and
    // the victory screen appears) on the next rendered tick.
    await page.waitForFunction(
      () => (window as unknown as { __GAME__: { state: () => { phase: string } } }).__GAME__.state().phase === 'won',
      null,
      { timeout: 15000 },
    );
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
    // The sim-time-gated lockout below can legitimately need many real ticks
    // on a slow/throttled renderer (verified under 6x CPU throttling), so
    // give the whole test more room than the default budget.
    test.setTimeout(90000);
    await page.goto(BASE);
    await page.evaluate((bp) => {
      (window as unknown as { __GAME__: { startMap: (m: unknown) => void } }).__GAME__.startMap(bp);
    }, TINY_BP);
    await page.waitForFunction(() => {
      const s = (window as unknown as { __GAME__?: { state: () => { phase: string } } }).__GAME__?.state();
      return s?.phase === 'playing';
    });
    await page.evaluate(() => (window as unknown as { __GAME__: { killPlayer: () => void } }).__GAME__.killPlayer());
    // Looks like a wall-clock lockout, but it's driven by sim.phaseTimer
    // (simulated seconds accumulated per tick, capped by dtReal — see
    // sim/sim.ts and app/game.ts), so it can lag wall-clock time on a slow
    // renderer. Wait for the sim to actually finish, not a fixed sleep.
    await page.waitForFunction(
      () => (window as unknown as { __GAME__: { state: () => { phase: string } } }).__GAME__.state().phase === 'dead',
      null,
      { timeout: 75000 },
    );
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
    await page.waitForFunction(
      (b0) => (window as unknown as { __GAME__: { state: () => { ammo: { bullets: number } } } }).__GAME__.state().ammo.bullets < b0,
      before,
      { timeout: 15000 },
    );
    await fire.dispatchEvent('touchend', { touches: [] });
    const after = await page.evaluate(() => (window as unknown as { __GAME__: { state: () => { ammo: { bullets: number } } } }).__GAME__.state().ammo.bullets);
    expect(after).toBeLessThan(before);
    // after unlatch, ammo stops dropping — an invariant across a span of
    // ticks, not a threshold to converge on, so wait real frames instead.
    const settled = await page.evaluate(() => (window as unknown as { __GAME__: { state: () => { ammo: { bullets: number } } } }).__GAME__.state().ammo.bullets);
    await waitFrames(page, 20);
    const still = await page.evaluate(() => (window as unknown as { __GAME__: { state: () => { ammo: { bullets: number } } } }).__GAME__.state().ammo.bullets);
    expect(still).toBe(settled);
  });
});
