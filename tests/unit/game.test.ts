// Game orchestrator regression tests for the arena bug fixes (resume / pickup
// filtering). `Game` needs a real <canvas> + WebGLRenderer to construct, so
// these tests never call `new Game(...)`; instead they build a bare object
// on `Game.prototype` (TS `private` is compile-time only) and exercise the
// exact methods that own the fixed logic, same trick enemyArt.test.ts uses
// for canvas-less painting. Import happens after a minimal window/document
// stub is installed so the module graph (screens.ts, hud.ts, input.ts, ...)
// loads without throwing at import time.
import { describe, it, expect, beforeAll } from 'vitest';
import type { Game as GameClass } from '../../src/app/game';
import type { ArenaEvent } from '../../src/sim/arena';

function elStub(): Record<string, unknown> {
  return {
    id: '', style: {}, className: '',
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    addEventListener() {}, removeEventListener() {},
    appendChild() {}, querySelector() { return elStub(); }, querySelectorAll() { return []; },
    getContext() { return {}; },
    width: 0, height: 0, value: '',
    setAttribute() {}, select() {}, remove() {},
    textContent: '',
  };
}

function installBrowserStub(): void {
  if (typeof window !== 'undefined') return;
  (globalThis as unknown as { window: unknown }).window = {
    location: { href: 'http://localhost/', hash: '', search: '', protocol: 'http:', host: 'localhost' },
    innerWidth: 800, innerHeight: 600, devicePixelRatio: 1,
    addEventListener() {}, removeEventListener() {},
    requestAnimationFrame: () => 0, cancelAnimationFrame() {},
    AudioContext: class {},
  };
  (globalThis as unknown as { document: unknown }).document = {
    createElement: elStub,
    body: { appendChild() {} },
    addEventListener() {}, removeEventListener() {},
  };
  (globalThis as unknown as { localStorage: unknown }).localStorage = {
    getItem() { return null; }, setItem() {}, removeItem() {},
  };
}

let Game: typeof GameClass;

beforeAll(async () => {
  installBrowserStub();
  ({ Game } = await import('../../src/app/game'));
});

/** A bare instance riding Game.prototype — real methods, fake fields. */
function bareGame(): GameClass {
  return Object.create(Game.prototype) as GameClass;
}

describe('resume() — bug 2 (arena pause menu Resume button)', () => {
  it('clears the arena menu and hides pause when resuming from the arena menu', () => {
    const g = bareGame() as unknown as {
      arenaMenu: boolean;
      phase: string;
      screens: { showPause: (v: boolean) => void };
      input: { isTouch: boolean; requestLock: () => void; paused?: boolean };
      resume: () => void;
    };
    g.arenaMenu = true;
    g.phase = 'playing'; // arena never sets phase to 'paused'
    let pauseShown: boolean | null = null;
    let relocked = false;
    g.screens = { showPause: (v) => { pauseShown = v; } };
    g.input = { isTouch: false, requestLock: () => { relocked = true; } };

    g.resume();

    expect(g.arenaMenu).toBe(false);
    expect(pauseShown).toBe(false);
    expect(relocked).toBe(true);
  });

  it('still no-ops when not paused and not in the arena menu (campaign path unaffected)', () => {
    const g = bareGame() as unknown as {
      arenaMenu: boolean;
      phase: string;
      resume: () => void;
    };
    g.arenaMenu = false;
    g.phase = 'playing';
    expect(() => g.resume()).not.toThrow();
    expect(g.phase).toBe('playing');
  });
});

describe('openArenaMenu() — pause menu cannot be occluded by the scoreboard', () => {
  it('dismisses an open scoreboard when the arena pause menu opens', () => {
    const g = bareGame() as unknown as {
      arenaMenu: boolean;
      arenaScoreboard: boolean;
      screens: { setRunKind: (k: string) => void; showPause: (v: boolean) => void };
      input: { paused: boolean; isTouch: boolean; releaseLock: () => void; requestLock: () => void };
      openArenaMenu: () => void;
      closeArenaMenu: () => void;
    };
    g.arenaMenu = false;
    g.arenaScoreboard = true; // scoreboard was left open from a previous Tab/M press
    g.screens = { setRunKind: () => {}, showPause: () => {} };
    let released = 0;
    let requested = 0;
    g.input = {
      paused: false, isTouch: false,
      releaseLock: () => { released++; },
      requestLock: () => { requested++; },
    };

    g.openArenaMenu();

    expect(g.arenaMenu).toBe(true);
    expect(g.arenaScoreboard).toBe(false);
    // The arena menu must do the same handshake as the campaign pause: without
    // releaseLock() the pointer stays captured and there is no cursor to click
    // RESUME with — the real cause of "the resume button does nothing".
    expect(released, 'openArenaMenu must release pointer lock').toBe(1);
    expect(g.input.paused, 'openArenaMenu must stop feeding input to the sim').toBe(true);

    // ...and closing must undo both, or the player resumes into a frozen body.
    g.closeArenaMenu();
    expect(g.input.paused, 'closeArenaMenu must un-pause input').toBe(false);
    expect(requested, 'closeArenaMenu re-grabs pointer lock').toBe(1);
  });
});

describe('arena join lifecycle', () => {
  it('does not start a second connection while one is pending', async () => {
    const g = bareGame() as unknown as {
      pendingArenaClient: unknown;
      arenaClient: unknown;
      audio: { unlock: () => Promise<void> };
      joinArena: () => Promise<void>;
    };
    let unlocked = false;
    g.pendingArenaClient = {};
    g.arenaClient = null;
    g.audio = { unlock: async () => { unlocked = true; } };
    await g.joinArena();
    expect(unlocked).toBe(false);
  });

  it('cancels the pending socket and invalidates its late completion', () => {
    const g = bareGame() as unknown as {
      arenaJoinToken: number;
      pendingArenaClient: { close: () => void } | null;
      screens: { setArenaJoining: (joining: boolean) => void };
      cancelArenaJoin: () => void;
    };
    let closed = 0;
    let joining: boolean | null = null;
    g.arenaJoinToken = 4;
    g.pendingArenaClient = { close: () => { closed++; } };
    g.screens = { setArenaJoining: (v) => { joining = v; } };
    g.cancelArenaJoin();
    expect(closed).toBe(1);
    expect(g.pendingArenaClient).toBeNull();
    expect(g.arenaJoinToken).toBe(5);
    expect(joining).toBe(false);
  });
});

describe('handleArenaEvent pickup — bug 4 (cross-player pickup messages)', () => {
  function harness() {
    const messages: string[] = [];
    const audioEvents: unknown[] = [];
    const g = bareGame() as unknown as {
      hud: { showMessage: (m: string) => void };
      audio: { handleEvent: (e: unknown) => void };
      arenaClient: { worldView: () => null; roster: () => [] };
      renderer: { fx: Record<string, never> };
      handleArenaEvent: (e: ArenaEvent, selfId: number) => void;
    };
    g.hud = { showMessage: (m) => messages.push(m) };
    g.audio = { handleEvent: (e) => audioEvents.push(e) };
    g.arenaClient = { worldView: () => null, roster: () => [] };
    g.renderer = { fx: {} };
    return { g, messages, audioEvents };
  }

  it('does not show a HUD message or play a sound for another player\'s pickup', () => {
    const { g, messages, audioEvents } = harness();
    g.handleArenaEvent({ t: 'pickup', id: 7, kind: 'ammo', label: '+10 NAILS' }, /* selfId */ 3);
    expect(messages).toEqual([]);
    expect(audioEvents).toEqual([]);
  });

  it('does show the HUD message and play the sound for the local player\'s own pickup', () => {
    const { g, messages, audioEvents } = harness();
    g.handleArenaEvent({ t: 'pickup', id: 3, kind: 'ammo', label: '+10 NAILS' }, /* selfId */ 3);
    expect(messages).toEqual(['+10 NAILS']);
    expect(audioEvents).toEqual([{ t: 'pickup', kind: 'ammo', label: '+10 NAILS' }]);
  });
});
