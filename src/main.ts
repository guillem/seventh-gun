import { Game } from './app/game';
import { preloadModernAssets, MODERN_ASSET_VERSION } from './render/modernAssets';
import { preloadModernAudio } from './audio/samples';
import './ui/modern.css';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const url = new URL(window.location.href);
const e2e = url.searchParams.has('e2e') || url.searchParams.has('test');

const loader = document.createElement('section');
loader.id = 'art-loading';
loader.setAttribute('aria-live', 'polite');
loader.innerHTML = '<div class="boot-mark">VII</div><p class="boot-label">SEVENTH GUN</p><h1>Preparing the Foundry</h1><p class="boot-status">Loading world materials and models…</p><progress max="5" value="0" aria-label="Loading game assets"></progress>';
document.body.appendChild(loader);

async function start(): Promise<void> {
  try {
    await Promise.all([
      preloadModernAssets((loaded, total) => {
        const bar = loader.querySelector('progress');
        if (bar) { bar.max = total; bar.value = loaded; }
      }),
      preloadModernAudio(),
    ]);
    const game = new Game(canvas, e2e);
    loader.remove();
    if (e2e) {
      (window as unknown as { __GAME__: unknown }).__GAME__ = game.getDebugApi();
      (window as unknown as { __ART_PACK__: string }).__ART_PACK__ = MODERN_ASSET_VERSION;
      console.log('[seventh-gun] e2e debug api enabled');
    }
  } catch (error) {
    console.error('[seventh-gun] startup failed', error);
    const status = loader.querySelector('.boot-status');
    if (status) status.textContent = 'Some game resources could not be loaded. Check your connection and retry.';
    loader.querySelector('progress')?.remove();
    const retry = document.createElement('button');
    retry.textContent = 'RETRY';
    retry.addEventListener('click', () => window.location.reload());
    loader.appendChild(retry);
  }
}

void start();
