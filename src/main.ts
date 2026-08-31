import { Game } from './app/game';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const url = new URL(window.location.href);
const e2e = url.searchParams.has('e2e') || url.searchParams.has('test');

const game = new Game(canvas, e2e);
if (e2e) {
  (window as unknown as { __GAME__: unknown }).__GAME__ = game.getDebugApi();
  console.log('[seventh-gun] e2e debug api enabled');
}
