// Screens can't be instantiated in a node test (its `el()` helper parses HTML
// via `innerHTML`, which needs a real DOM/jsdom — not a project dependency).
// The regression this file guards is structural, so it's asserted against
// the source text, the same trick enemyArt.test.ts uses for the rules a
// canvas stub can't see.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SCREENS_PATH = join(process.cwd(), 'src', 'ui', 'screens.ts');
const GAME_PATH = join(process.cwd(), 'src', 'app', 'game.ts');
const HUD_PATH = join(process.cwd(), 'src', 'ui', 'hud.ts');
const INDEX_HTML_PATH = join(process.cwd(), 'index.html');
const screens = readFileSync(SCREENS_PATH, 'utf8');
const game = readFileSync(GAME_PATH, 'utf8');
const hud = readFileSync(HUD_PATH, 'utf8');
const indexHtml = readFileSync(INDEX_HTML_PATH, 'utf8');

describe('arena scoreboard has no opaque/interactive DOM overlay', () => {
  it('does not create a #scoreboard-screen div (that was an empty, opaque, pointer-events:auto .screen)', () => {
    expect(screens).not.toContain('scoreboard-screen');
  });

  it('does not expose Screens.showScoreboard (the div-toggling method) anymore', () => {
    expect(screens).not.toMatch(/showScoreboard\s*\(/);
  });

  it('game.ts never calls screens.showScoreboard', () => {
    expect(game).not.toContain('showScoreboard');
  });

  it('the scoreboard is drawn on the (pointer-events:none) HUD canvas, gated on the arenaScoreboard flag', () => {
    expect(hud).toContain('drawArenaScoreboard');
    expect(game).toMatch(/if \(this\.arenaScoreboard\) this\.hud\.drawArenaScoreboard/);
    // #hud is pointer-events:none, so canvas-drawn content can never swallow clicks.
    expect(indexHtml).toMatch(/#hud\s*\{[^}]*pointer-events:\s*none/);
  });

  it('opening the arena pause menu clears the scoreboard flag so it cannot render under the menu', () => {
    const openArenaMenu = game.slice(
      game.indexOf('private openArenaMenu()'),
      game.indexOf('private closeArenaMenu()'),
    );
    expect(openArenaMenu).toMatch(/this\.arenaScoreboard\s*=\s*false/);
  });
});
