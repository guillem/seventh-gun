// DOM screens: title, pause, death-after-lockout (title mode), victory,
// full map overlay, touch controls. All styled in index.html <style>.
import { GEN_VERSION, type Difficulty } from '../sim/types';
import { DIFFICULTIES, DIFFICULTY_ORDER } from '../sim/difficulty';
import { formatRelativeTime, type MapLogEntry } from '../app/mapLog';

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
  private mapLog!: HTMLDivElement;
  private mapLogList!: HTMLDivElement;
  private campaign!: HTMLDivElement;
  private campaignContinueBtn!: HTMLButtonElement;
  private intermission!: HTMLDivElement;
  private campaignWin!: HTMLDivElement;
  private deathNote!: HTMLDivElement;
  private mapOverlay!: HTMLDivElement;
  private mapLogEntries: MapLogEntry[] = [];
  private mapCanvas!: HTMLCanvasElement;
  private miniCanvas!: HTMLCanvasElement;
  private touch!: HTMLDivElement;
  private toast!: HTMLDivElement;
  private toastTimer = 0;

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
  private winCopyBtn!: HTMLButtonElement;
  private winCopyRow!: HTMLDivElement;
  private deathCopyBtn!: HTMLButtonElement;

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
          <div class="row">
            <button id="campaign-btn" class="big">CAMPAIGN</button>
            <button id="maplog-btn" class="big">MAP LOG</button>
          </div>
          <div class="row hidden" id="death-row">
            <button id="retry-btn">RETRY SEED</button>
            <button id="new-maze-btn">NEW MAZE</button>
            <button id="death-copy" class="hidden">COPY LINK</button>
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
          <div class="row hidden" id="win-copy-row">
            <button id="win-copy">COPY LINK</button>
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
    this.mapLog = this.el(`
      <div class="screen hidden" id="maplog-screen">
        <div class="panel" id="maplog-panel">
          <h2>MAP LOG</h2>
          <div id="maplog-list"></div>
          <button id="maplog-back" class="big">BACK</button>
        </div>
      </div>
    `);
    this.campaign = this.el(`
      <div class="screen hidden" id="campaign-screen">
        <div class="panel" id="campaign-panel">
          <h2>CAMPAIGN</h2>
          <div class="hints">Seven maps. The guns stay with you.</div>
          <div class="row">
            <label>SKILL</label>
            <div class="diff-row" id="c-diff-row"></div>
          </div>
          <button id="campaign-begin" class="big">BEGIN</button>
          <div class="row hidden" id="campaign-continue-row">
            <button id="campaign-continue" class="big">CONTINUE</button>
          </div>
          <button id="campaign-back" class="big">BACK</button>
        </div>
      </div>
    `);
    this.intermission = this.el(`
      <div class="screen hidden" id="intermission-screen">
        <div class="panel win">
          <h2 id="intermission-title">THE FOUNDRY</h2>
          <div class="flavor" id="intermission-flavor"></div>
          <button id="intermission-continue" class="big">CONTINUE</button>
        </div>
      </div>
    `);
    this.campaignWin = this.el(`
      <div class="screen hidden" id="campaign-win-screen">
        <div class="panel win">
          <h2 class="gameover" id="campaign-win-title">THE SEVENTH IS SILENT</h2>
          <div class="won" id="campaign-win-body">You ended it.</div>
          <div class="stats" id="campaign-win-stats"></div>
          <button id="campaign-win-title-btn" class="big">TITLE</button>
        </div>
      </div>
    `);
    this.toast = this.el(`<div id="toast" class="hidden"></div>`);

    this.root.append(
      this.title, this.pause, this.victory, this.mapLog, this.campaign,
      this.intermission, this.campaignWin, this.mapOverlay, this.touch, this.toast,
    );
    this.campaignContinueBtn = this.campaign.querySelector('#campaign-continue')!;
    this.mapLogList = this.mapLog.querySelector('#maplog-list')!;

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
    this.winCopyBtn = this.victory.querySelector('#win-copy')!;
    this.winCopyRow = this.victory.querySelector('#win-copy-row')!;
    this.deathCopyBtn = this.title.querySelector('#death-copy')!;
    this.mapCanvas = this.miniCanvas;

    // difficulty selectors (title + pause share logic)
    const diffHosts: [string, HTMLDivElement][] = [
      ['diff-row', this.title.querySelector('#diff-row') as HTMLDivElement],
      ['p-diff-row', this.pause.querySelector('#p-diff-row') as HTMLDivElement],
      ['c-diff-row', this.campaign.querySelector('#c-diff-row') as HTMLDivElement],
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
    if (!show) {
      this.mapLog.classList.add('hidden');
      this.campaign.classList.add('hidden');
    }
    if (show) {
      this.intermission.classList.add('hidden');
      this.campaignWin.classList.add('hidden');
    }
  }

  showMapLog(show: boolean, entries: MapLogEntry[] = []): void {
    if (show) {
      this.title.classList.add('hidden');
      this.campaign.classList.add('hidden');
      this.mapLog.classList.remove('hidden');
      this.renderMapLog(entries);
    } else {
      this.mapLog.classList.add('hidden');
    }
  }

  isMapLogOpen(): boolean {
    return !this.mapLog.classList.contains('hidden');
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
    openMapLog: () => void;
    openCampaign: () => void;
  }): void {
    this.startBtn.addEventListener('click', handlers.start);
    this.retryBtn.addEventListener('click', handlers.retry);
    this.newMazeBtn.addEventListener('click', handlers.newMaze);
    this.muteBtn.addEventListener('click', handlers.mute);
    (this.title.querySelector('#maplog-btn') as HTMLButtonElement)
      .addEventListener('click', handlers.openMapLog);
    (this.title.querySelector('#campaign-btn') as HTMLButtonElement)
      .addEventListener('click', handlers.openCampaign);
    const vs = this.title.querySelector('#volume-slider') as HTMLInputElement;
    vs.addEventListener('input', () => handlers.volume(Number(vs.value) / 100));
  }

  bindMapLog(handlers: {
    back: () => void;
    play: (entry: MapLogEntry) => void;
    copy: (seed: string) => void;
  }): void {
    this.mapLog.querySelector('#maplog-back')!.addEventListener('click', handlers.back);
    this.mapLogList.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      const row = t.closest('.maplog-entry') as HTMLElement | null;
      if (!row) return;
      const i = Number(row.dataset.index);
      const entry = this.mapLogEntries[i];
      if (!entry) return;
      if (t.closest('[data-action="copy"]')) {
        e.stopPropagation();
        handlers.copy(entry.seed);
        return;
      }
      handlers.play(entry);
    });
  }

  showToast(msg: string): void {
    this.toast.textContent = msg;
    this.toast.classList.remove('hidden');
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => {
      this.toast.classList.add('hidden');
    }, 1600);
  }

  private renderMapLog(entries: MapLogEntry[]): void {
    this.mapLogEntries = entries;
    this.mapLogList.replaceChildren();
    if (entries.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'maplog-empty';
      empty.textContent = 'No mazes yet. Enter the maze to start a log.';
      this.mapLogList.appendChild(empty);
      return;
    }
    for (let i = 0; i < entries.length; i++) {
      this.mapLogList.appendChild(this.mapLogRow(entries[i], i));
    }
  }

  private mapLogRow(entry: MapLogEntry, index: number): HTMLDivElement {
    const row = document.createElement('div');
    row.className = 'maplog-entry';
    row.dataset.index = String(index);
    row.dataset.seed = entry.seed;

    const meta = document.createElement('div');
    meta.className = 'maplog-meta';

    const seed = document.createElement('span');
    seed.className = 'maplog-seed';
    seed.textContent = entry.seed;

    const time = document.createElement('span');
    time.className = 'maplog-time';
    time.textContent = formatRelativeTime(entry.startedAt);

    const skill = document.createElement('span');
    skill.className = 'maplog-skill';
    skill.textContent = DIFFICULTIES[entry.difficulty].label;

    const badge = document.createElement('span');
    const outcome = entry.outcome ?? '';
    badge.className = `maplog-badge ${outcome || 'open'}`;
    badge.textContent = outcome ? outcome.toUpperCase() : '—';

    meta.append(seed, time, skill, badge);
    row.appendChild(meta);

    if (entry.genVersion !== GEN_VERSION) {
      const warn = document.createElement('div');
      warn.className = 'maplog-warn';
      warn.textContent = 'generator changed — layout may differ';
      row.appendChild(warn);
    }

    const actions = document.createElement('div');
    actions.className = 'row';
    const play = document.createElement('button');
    play.textContent = 'PLAY';
    play.dataset.action = 'play';
    const copy = document.createElement('button');
    copy.className = 'small';
    copy.textContent = 'copy seed';
    copy.dataset.action = 'copy';
    actions.append(play, copy);
    row.appendChild(actions);
    return row;
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

  bindCopyLink(handler: () => void): void {
    this.deathCopyBtn.addEventListener('click', handler);
    this.winCopyBtn.addEventListener('click', handler);
  }

  setRunKind(kind: 'maze' | 'map' | 'campaign'): void {
    const authored = kind === 'map' || kind === 'campaign';
    this.retryBtn.textContent = authored ? 'RETRY MAP' : 'RETRY SEED';
    this.newMazeBtn.textContent = kind === 'map' ? 'TITLE' : kind === 'campaign' ? 'QUIT TO TITLE' : 'NEW MAZE';
    this.pauseRetryBtn.textContent = authored ? 'RETRY MAP' : 'RESTART SEED';
    this.pauseNewBtn.classList.toggle('hidden', authored);
    this.winRetryBtn.textContent = authored ? 'RETRY MAP' : 'SAME SEED AGAIN';
    this.winNewBtn.textContent = kind === 'map' ? 'TITLE' : kind === 'campaign' ? 'TITLE' : 'NEW MAZE';
    this.deathCopyBtn.classList.toggle('hidden', kind !== 'map');
    this.winCopyRow.classList.toggle('hidden', kind !== 'map');
  }

  showCampaign(show: boolean, opts?: { canContinue?: boolean; nextTitle?: string }): void {
    if (show) {
      this.title.classList.add('hidden');
      this.mapLog.classList.add('hidden');
      this.campaign.classList.remove('hidden');
      const row = this.campaign.querySelector('#campaign-continue-row') as HTMLDivElement;
      row.classList.toggle('hidden', !opts?.canContinue);
      if (opts?.canContinue && opts.nextTitle) {
        this.campaignContinueBtn.textContent = `CONTINUE — ${opts.nextTitle}`;
      } else {
        this.campaignContinueBtn.textContent = 'CONTINUE';
      }
    } else {
      this.campaign.classList.add('hidden');
    }
  }

  isCampaignOpen(): boolean {
    return !this.campaign.classList.contains('hidden');
  }

  bindCampaign(handlers: { begin: () => void; continue: () => void; back: () => void }): void {
    this.campaign.querySelector('#campaign-begin')!.addEventListener('click', handlers.begin);
    this.campaignContinueBtn.addEventListener('click', handlers.continue);
    this.campaign.querySelector('#campaign-back')!.addEventListener('click', handlers.back);
  }

  showIntermission(show: boolean, title = '', lines: string[] = []): void {
    this.intermission.classList.toggle('hidden', !show);
    if (show) {
      (this.intermission.querySelector('#intermission-title') as HTMLElement).textContent = title;
      const flavor = this.intermission.querySelector('#intermission-flavor') as HTMLElement;
      flavor.replaceChildren();
      for (const line of lines) {
        const p = document.createElement('div');
        p.textContent = line;
        flavor.appendChild(p);
      }
    }
  }

  bindIntermission(handler: () => void): void {
    this.intermission.querySelector('#intermission-continue')!.addEventListener('click', handler);
  }

  showCampaignWin(show: boolean, opts?: { title?: string; body?: string; stats?: string }): void {
    this.campaignWin.classList.toggle('hidden', !show);
    if (show) {
      (this.campaignWin.querySelector('#campaign-win-title') as HTMLElement)
        .textContent = opts?.title ?? 'THE SEVENTH IS SILENT';
      (this.campaignWin.querySelector('#campaign-win-body') as HTMLElement)
        .textContent = opts?.body ?? 'You ended it.';
      (this.campaignWin.querySelector('#campaign-win-stats') as HTMLElement)
        .textContent = opts?.stats ?? '';
    }
  }

  bindCampaignWin(handler: () => void): void {
    this.campaignWin.querySelector('#campaign-win-title-btn')!.addEventListener('click', handler);
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
