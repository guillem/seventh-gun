// DOM screens: title, pause, death-after-lockout (title mode), victory,
// full map overlay, touch controls. All styled in index.html <style>.
import type { Difficulty } from '../sim/types';
import { DIFFICULTIES, DIFFICULTY_ORDER } from '../sim/difficulty';

export interface Settings {
  volume: number;
  muted: boolean;
  sensitivity: number;
  difficulty: Difficulty;
}

const DEFAULT_SETTINGS: Settings = {
  volume: 0.8, muted: false, sensitivity: 1, difficulty: 'normal',
};

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem('seventh-gun.settings');
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch { /* private mode etc */ }
  return { ...DEFAULT_SETTINGS };
}

export function saveSettings(s: Settings): void {
  try { localStorage.setItem('seventh-gun.settings', JSON.stringify(s)); } catch { /* ignore */ }
}

export class Screens {
  root: HTMLDivElement;
  private title!: HTMLDivElement;
  private pause!: HTMLDivElement;
  private victory!: HTMLDivElement;
  private deathNote!: HTMLDivElement;
  private mapOverlay!: HTMLDivElement;
  private mapCanvas!: HTMLCanvasElement;
  private miniCanvas!: HTMLCanvasElement;
  private touch!: HTMLDivElement;
  private toast!: HTMLDivElement;

  // title controls
  seedInput!: HTMLInputElement;
  private diffButtons: Record<string, HTMLButtonElement> = {};
  private startBtn!: HTMLButtonElement;
  private retryBtn!: HTMLButtonElement;
  private newMazeBtn!: HTMLButtonElement;

  // pause controls
  private resumeBtn!: HTMLButtonElement;
  private pauseRetryBtn!: HTMLButtonElement;
  private pauseNewBtn!: HTMLButtonElement;
  private volumeSlider!: HTMLInputElement;
  private sensSlider!: HTMLInputElement;
  private muteBtn!: HTMLButtonElement;

  // victory controls
  private winRetryBtn!: HTMLButtonElement;
  private winNewBtn!: HTMLButtonElement;

  onSettingsChanged: ((s: Settings) => void) | null = null;

  constructor() {
    this.root = document.createElement('div');
    this.root.id = 'screens';
    document.body.appendChild(this.root);
    this.build();
  }

  private el(html: string): HTMLDivElement {
    const d = document.createElement('div');
    d.innerHTML = html.trim();
    return d.firstElementChild as HTMLDivElement;
  }

  private build(): void {
    this.title = this.el(`
      <div class="screen" id="title-screen">
        <div class="title-art">
          <h1>SEVENTH<span class="accent">GUN</span></h1>
          <div class="subtitle">a nightmare maze of flesh and steel</div>
        </div>
        <div class="panel">
          <div class="row">
            <label>SEED</label>
            <input id="seed-input" maxlength="24" autocomplete="off" spellcheck="false"/>
            <button id="seed-random" class="small" title="random seed">RND</button>
          </div>
          <div class="row">
            <label>SKILL</label>
            <div class="diff-row" id="diff-row"></div>
          </div>
          <button id="start-btn" class="big">ENTER THE MAZE</button>
          <div class="row hidden" id="death-row">
            <button id="retry-btn">RETRY SEED</button>
            <button id="new-maze-btn">NEW MAZE</button>
          </div>
          <div class="hints">
            WASD move · mouse look · click fire · E use · 1-7 / wheel guns · TAB map · ESC pause<br/>
            Find all seven guns. The Seventh unseals the arena. Clear it to win.
          </div>
        </div>
        <div class="volume-row">
          <button id="mute-btn" class="small">SOUND: ON</button>
          <input id="volume-slider" type="range" min="0" max="100" value="80"/>
        </div>
      </div>
    `);
    this.pause = this.el(`
      <div class="screen hidden" id="pause-screen">
        <div class="panel">
          <h2>PAUSED</h2>
          <div class="row"><label>VOLUME</label><input id="p-volume" type="range" min="0" max="100" value="80"/></div>
          <div class="row"><label>SENSITIVITY</label><input id="p-sens" type="range" min="20" max="300" value="100"/></div>
          <div class="row">
            <label>SKILL</label>
            <div class="diff-row" id="p-diff-row"></div>
          </div>
          <button id="resume-btn" class="big">RESUME</button>
          <div class="row">
            <button id="p-retry">RESTART SEED</button>
            <button id="p-new">NEW MAZE</button>
            <button id="p-quit">QUIT TO TITLE</button>
          </div>
          <div class="hints">TAB map · E use doors · the key opens the vault, never the arena</div>
        </div>
      </div>
    `);
    this.victory = this.el(`
      <div class="screen hidden" id="victory-screen">
        <div class="panel win">
          <h2 class="gameover">GAME OVER</h2>
          <div class="won">You won</div>
          <div class="stats" id="win-stats"></div>
          <div class="row">
            <button id="win-retry">SAME SEED AGAIN</button>
            <button id="win-new">NEW MAZE</button>
          </div>
        </div>
      </div>
    `);
    this.mapOverlay = this.el(`
      <div class="screen hidden" id="map-overlay">
        <canvas id="fullmap-canvas"></canvas>
        <div class="map-hint">TAB / M / click to close — combat is paused</div>
      </div>
    `);
    this.miniCanvas = this.mapOverlay.querySelector('#fullmap-canvas') as HTMLCanvasElement;
    this.touch = this.el(`
      <div id="touch-ui" class="hidden">
        <div id="stick-zone"></div>
        <div id="stick-base" class="hidden"><div id="stick-nub"></div></div>
        <div class="touch-buttons">
          <button id="btn-use" class="tbtn">USE</button>
          <button id="btn-map" class="tbtn">MAP</button>
          <button id="btn-pause" class="tbtn">| |</button>
          <button id="btn-fire" class="tbtn fire">FIRE</button>
        </div>
      </div>
    `);
    this.toast = this.el(`<div id="toast" class="hidden"></div>`);

    this.root.append(this.title, this.pause, this.victory, this.mapOverlay, this.touch, this.toast);

    // wire refs
    this.seedInput = this.title.querySelector('#seed-input')!;
    this.startBtn = this.title.querySelector('#start-btn')!;
    this.retryBtn = this.title.querySelector('#retry-btn')!;
    this.newMazeBtn = this.title.querySelector('#new-maze-btn')!;
    this.deathNote = this.title.querySelector('#death-row')!;
    this.resumeBtn = this.pause.querySelector('#resume-btn')!;
    this.pauseRetryBtn = this.pause.querySelector('#p-retry')!;
    this.pauseNewBtn = this.pause.querySelector('#p-new')!;
    this.volumeSlider = this.pause.querySelector('#p-volume')!;
    this.sensSlider = this.pause.querySelector('#p-sens')!;
    this.muteBtn = this.title.querySelector('#mute-btn')!;
    this.winRetryBtn = this.victory.querySelector('#win-retry')!;
    this.winNewBtn = this.victory.querySelector('#win-new')!;
    this.mapCanvas = this.miniCanvas;

    // difficulty selectors (title + pause share logic)
    const diffHosts: [string, HTMLDivElement][] = [
      ['diff-row', this.title.querySelector('#diff-row') as HTMLDivElement],
      ['p-diff-row', this.pause.querySelector('#p-diff-row') as HTMLDivElement],
    ];
    for (const [hostId, host] of diffHosts) {
      for (const d of DIFFICULTY_ORDER) {
        const b = document.createElement('button');
        b.className = 'small diff';
        b.textContent = DIFFICULTIES[d].label;
        b.dataset.diff = d;
        host.appendChild(b);
        this.diffButtons[`${hostId}:${d}`] = b;
      }
    }

    const rnd = this.title.querySelector('#seed-random') as HTMLButtonElement;
    rnd.addEventListener('click', () => {
      this.seedInput.value = randomSeed();
    });
  }

  setDifficulties(current: Difficulty, cb: (d: Difficulty) => void): void {
    for (const key of Object.keys(this.diffButtons)) {
      const b = this.diffButtons[key];
      const on = b.dataset.diff === current;
      b.classList.toggle('active', on);
      b.onclick = () => cb(b.dataset.diff as Difficulty);
    }
  }

  showDeathRow(show: boolean): void {
    this.deathNote.classList.toggle('hidden', !show);
  }

  showTitle(show: boolean): void {
    this.title.classList.toggle('hidden', !show);
  }

  showPause(show: boolean): void {
    this.pause.classList.toggle('hidden', !show);
  }

  showVictory(show: boolean, stats: string): void {
    this.victory.classList.toggle('hidden', !show);
    if (show) (this.victory.querySelector('#win-stats') as HTMLDivElement).textContent = stats;
  }

  showMap(show: boolean): void {
    this.mapOverlay.classList.toggle('hidden', !show);
  }

  isMapOpen(): boolean {
    return !this.mapOverlay.classList.contains('hidden');
  }

  showTouch(show: boolean): void {
    this.touch.classList.toggle('hidden', !show);
  }

  get fullscreenMapCanvas(): HTMLCanvasElement {
    return this.mapCanvas;
  }

  setTouchUi(
    handlers: {
      fire: (down: boolean) => void;
      use: () => void;
      map: () => void;
      pause: () => void;
    },
  ): void {
    const fire = this.touch.querySelector('#btn-fire') as HTMLButtonElement;
    const use = this.touch.querySelector('#btn-use') as HTMLButtonElement;
    const map = this.touch.querySelector('#btn-map') as HTMLButtonElement;
    const pause = this.touch.querySelector('#btn-pause') as HTMLButtonElement;
    fire.addEventListener('touchstart', (e) => { e.preventDefault(); handlers.fire(true); }, { passive: false });
    fire.addEventListener('touchend', (e) => { e.preventDefault(); handlers.fire(false); }, { passive: false });
    fire.addEventListener('touchcancel', () => handlers.fire(false));
    for (const [b, fn] of [[use, handlers.use], [map, handlers.map], [pause, handlers.pause]] as [HTMLButtonElement, () => void][]) {
      b.addEventListener('touchstart', (e) => { e.preventDefault(); fn(); }, { passive: false });
    }
  }

  bindTitle(handlers: {
    start: () => void;
    retry: () => void;
    newMaze: () => void;
    volume: (v: number) => void;
    mute: () => void;
  }): void {
    this.startBtn.addEventListener('click', handlers.start);
    this.retryBtn.addEventListener('click', handlers.retry);
    this.newMazeBtn.addEventListener('click', handlers.newMaze);
    this.muteBtn.addEventListener('click', handlers.mute);
    const vs = this.title.querySelector('#volume-slider') as HTMLInputElement;
    vs.addEventListener('input', () => handlers.volume(Number(vs.value) / 100));
  }

  bindPause(handlers: {
    resume: () => void;
    retry: () => void;
    newMaze: () => void;
    quit: () => void;
    volume: (v: number) => void;
    sens: (v: number) => void;
  }): void {
    this.resumeBtn.addEventListener('click', handlers.resume);
    this.pauseRetryBtn.addEventListener('click', handlers.retry);
    this.pauseNewBtn.addEventListener('click', handlers.newMaze);
    this.pause.querySelector('#p-quit')!.addEventListener('click', handlers.quit);
    this.volumeSlider.addEventListener('input', () => handlers.volume(Number(this.volumeSlider.value) / 100));
    this.sensSlider.addEventListener('input', () => handlers.sens(Number(this.sensSlider.value) / 100));
  }

  bindVictory(handlers: { retry: () => void; newMaze: () => void }): void {
    this.winRetryBtn.addEventListener('click', handlers.retry);
    this.winNewBtn.addEventListener('click', handlers.newMaze);
  }

  bindMapClose(handler: () => void): void {
    this.mapOverlay.addEventListener('click', handler);
  }

  setMuteLabel(muted: boolean): void {
    this.muteBtn.textContent = muted ? 'SOUND: OFF' : 'SOUND: ON';
  }

  setVolumeSlider(v: number): void {
    this.volumeSlider.value = String(Math.round(v * 100));
    (this.title.querySelector('#volume-slider') as HTMLInputElement).value = String(Math.round(v * 100));
  }

  setSensSlider(v: number): void {
    this.sensSlider.value = String(Math.round(v * 100));
  }
}

export function randomSeed(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let s = '';
  for (let i = 0; i < 8; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}
