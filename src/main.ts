import { Game } from './app/game';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const url = new URL(window.location.href);
const e2e = url.searchParams.has('e2e') || url.searchParams.has('test');

const game = new Game(canvas, e2e);

// index.html ships a server-rendered intro (title, pitch, links to the text
// pages) for readers that never run this bundle. Game's constructor has built
// its own title screen by now, so the placeholder has done its job. It sits one
// z-index below #screens, so a failure to remove it cannot cover the game.
document.getElementById('intro')?.remove();

if (e2e) {
  (window as unknown as { __GAME__: unknown }).__GAME__ = game.getDebugApi();
  console.log('[seventh-gun] e2e debug api enabled');
}
