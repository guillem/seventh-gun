// Game orchestrator: loop, phases (title/playing/paused/dying/dead/won),
// input -> sim stepping, event fan-out to renderer/audio/HUD, debug API.
import * as THREE from 'three';
import { Sim, STEP_DT, emptyInput } from '../sim/sim';
import type { ArenaEvent } from '../sim/arena';
import { ArenaClient } from '../net/client';
import { circleFits, hasLineOfSight } from '../sim/physics';
import { aimDirFromLook, lookPitchFromThree, threePitchFromLook } from '../sim/aim';
import { GEN_VERSION, type SimEvent, type Difficulty, type PlayerLoadout } from '../sim/types';
import { compileBlueprint, mapSeedFromTitle, type MapBlueprint } from '../sim/blueprint';
import { decodeBlueprint } from '../sim/mapcodec';
import { GameRenderer } from '../render/renderer';
import { AudioEngine } from '../audio/audio';
import { Hud, exploredPct } from '../ui/hud';
import { Screens, loadSettings, saveSettings, randomSeed, type Settings } from '../ui/screens';
import { InputManager } from './input';
import {
  loadMapLog,
  prependMapLog,
  patchLatestMapLog,
  shouldLogRun,
  type MapLogEntry,
  type MapLogOutcome,
} from './mapLog';
import {
  copyText,
  decodeShareCode,
  encodeShareCode,
  encodeShareCodeSync,
  parseMapHash,
  shareUrlFromCode,
} from './mapShare';
import { CAMPAIGN, campaignMap, snapshotLoadout } from '../campaign/index';
import { campaignArtIdFromIndex } from '../render/campaignTextures';
import {
  applyMapWin, canContinue, isMapUnlocked, loadCampaignProgress,
  saveCampaignProgress, unlockedThrough,
} from './campaignProgress';
import { EditorView } from '../editor/view';
import { upsertLibrary } from '../editor/library';

type Phase = 'title' | 'playing' | 'paused' | 'map' | 'dead' | 'won' | 'editing';

const ALL_GUNS_LOADOUT: PlayerLoadout = {
  owned: [false, true, true, true, true, true, true, true],
  gun: 1,
  ammo: { bullets: 70, shells: 16, nails: 70, grenades: 8, cores: 10, void: 5 },
};

export class Game {
  private renderer: GameRenderer;
  private audio = new AudioEngine();
  private hud: Hud;
  private screens: Screens;
  private input: InputManager;
  private sim: Sim | null = null;
  private phase: Phase = 'title';
  private settings: Settings;
  private accumulator = 0;
  private lastTime = 0;
  private raf = 0;
  private deathHandled = false;
  private winHandled = false;
  private lastGunCycled = 0;
  seed = '';
  debug = false;
  freeze = false;
  private runKind: 'maze' | 'map' | 'campaign' | 'arena' = 'maze';
  private arenaClient: ArenaClient | null = null;
  private pendingArenaClient: ArenaClient | null = null;
  private arenaJoinToken = 0;
  private arenaMenu = false;
  private arenaScoreboard = false;
  private arenaStatus = '';
  private authoredBlueprint: MapBlueprint | null = null;
  private shareCode: string | null = null;
  private runLog: { seed: string; difficulty: Difficulty; startedAt: number } | null = null;
  private campaignIndex = 1;
  private entryLoadout: PlayerLoadout | null = null;
  private editor: EditorView | null = null;
  private fromEditor = false;
  private playtestAllGuns = false;

  constructor(canvas: HTMLCanvasElement, debug: boolean) {
    this.debug = debug;
    this.renderer = new GameRenderer(canvas, debug);
    this.hud = new Hud();
    this.screens = new Screens();
    document.body.appendChild(this.hud.canvas);
    this.settings = loadSettings();
    this.audio.setVolume(this.settings.volume);
    this.audio.setMuted(this.settings.muted);
    this.input = new InputManager(canvas, this.screens);
    this.input.sensitivity = this.settings.sensitivity;
    this.input.e2eClick = debug;

    this.createMinimapCanvas();
    this.wireUi();
    this.wireInput();

    // ?seed= support
    const url = new URL(window.location.href);
    const urlSeed = url.searchParams.get('seed');
    if (urlSeed) this.screens.seedInput.value = urlSeed;
    else this.screens.seedInput.value = randomSeed();
    this.screens.setVolumeSlider(this.settings.volume);
    this.screens.setSensSlider(this.settings.sensitivity);
    this.screens.setMuteLabel(this.settings.muted);
    this.screens.setDifficulties(this.settings.difficulty, (d, host) => this.onSkillClick(d, host));
    this.screens.setRunKind('maze');

    const hashCode = parseMapHash(window.location.hash);
    if (hashCode) void this.bootFromShare(hashCode);
    else if (url.searchParams.has('edit')) this.openEditor();

    window.addEventListener('resize', () => this.onResize());
    this.onResize();
    this.lastTime = performance.now();
    this.loop(this.lastTime);
  }

  private miniCanvas: HTMLCanvasElement | null = null;

  private createMinimapCanvas(): void {
    const c = document.createElement('canvas');
    c.id = 'minimap';
    this.miniCanvas = c;
    document.body.appendChild(c);
    this.hud.attachMinimap(c);
    this.hud.attachMap(this.screens.fullscreenMapCanvas);
    this.screens.bindMapClose(() => this.toggleMap(false));
  }

  private onResize(): void {
    this.renderer.resize();
    this.hud.resize();
    const size = Math.min(190, Math.max(130, Math.min(window.innerWidth, window.innerHeight) * 0.24));
    const dpr = Math.min(window.devicePixelRatio, 2);
    if (this.miniCanvas) {
      this.miniCanvas.width = size * dpr;
      this.miniCanvas.height = size * dpr;
      this.miniCanvas.style.width = `${size}px`;
      this.miniCanvas.style.height = `${size}px`;
    }
    const mc = this.screens.fullscreenMapCanvas;
    mc.width = Math.min(window.innerWidth * 0.92, 900) * dpr;
    mc.height = Math.min(window.innerHeight * 0.86, 900) * dpr;
    mc.style.width = `${mc.width / dpr}px`;
    mc.style.height = `${mc.height / dpr}px`;
  }

  // ------------------------------------------------------------------ ui wiring
  private wireUi(): void {
    this.screens.bindTitle({
      start: () => this.startRun(this.screens.seedInput.value.trim() || randomSeed()),
      retry: () => this.retryCurrent(),
      newMaze: () => this.secondaryCurrent(),
      volume: (v) => { this.settings.volume = v; this.audio.setVolume(v); saveSettings(this.settings); },
      mute: () => {
        this.settings.muted = !this.settings.muted;
        this.audio.setMuted(this.settings.muted);
        this.screens.setMuteLabel(this.settings.muted);
        saveSettings(this.settings);
      },
      openMapLog: () => this.openMapLog(),
      openCampaign: () => this.openCampaign(),
      openArena: () => this.openArenaPanel(),
    });
    this.screens.bindArenaJoin({
      join: (name) => { void this.joinArena(name); },
      back: () => { this.cancelArenaJoin(); this.screens.showArenaJoin(false); this.screens.showTitle(true); },
    });
    this.screens.bindCampaign({
      begin: () => this.beginCampaign(),
      continue: () => this.continueCampaign(),
      back: () => this.closeCampaign(),
      playMap: (n) => this.playCampaignMap(n),
    });
    this.screens.bindIntermission(() => this.continueFromIntermission());
    this.screens.bindCampaignWin(() => this.toTitle());
    this.screens.bindEditor(() => this.openEditor());
    this.screens.bindMapLog({
      back: () => this.closeMapLog(),
      play: (entry) => this.playFromLog(entry),
      copy: (seed) => this.copySeed(seed),
    });
    this.screens.bindPause({
      resume: () => this.resume(),
      retry: () => this.retryCurrent(),
      newMaze: () => this.secondaryCurrent(),
      quit: () => this.toTitle(),
      leaveArena: () => this.leaveArena(),
      volume: (v) => { this.settings.volume = v; this.audio.setVolume(v); saveSettings(this.settings); },
      sens: (v) => { this.settings.sensitivity = v; this.input.sensitivity = v; saveSettings(this.settings); },
    });
    this.screens.bindVictory({
      retry: () => this.retryCurrent(),
      newMaze: () => this.secondaryCurrent(),
    });
    this.screens.bindCopyLink(() => { void this.copyShareLink(); });
    this.screens.bindSaveLibrary(() => { void this.saveAuthoredToLibrary(); });
    this.screens.bindBackToEditor(() => this.returnToEditor());
    this.screens.setTouchUi({
      fire: (down) => this.input.setFire(down),
      use: () => { if (this.sim) this.sim.tryUse(); },
      map: () => this.toggleMap(!this.screens.isMapOpen()),
      pause: () => this.togglePause(),
    });
    this.screens.seedInput.addEventListener('keydown', (e) => {
      if (e.code === 'Enter') this.startRun(this.screens.seedInput.value.trim() || randomSeed());
      // No stopPropagation(): InputManager's window keydown now ignores any
      // event whose target is an editable element (isEditableTarget in
      // input.ts), so it never reaches the Tab/M/WASD handling below this
      // input in the first place. The old stopPropagation() was the only
      // thing plugging that gap and is redundant now.
    });
  }

  private wireInput(): void {
    this.input.setCallbacks({
      onLook: (dyaw, dpitch) => {
        const cam = this.renderer.camera;
        cam.rotation.order = 'YXZ';
        cam.rotation.y += dyaw;
        cam.rotation.x = Math.max(-1.45, Math.min(1.45, cam.rotation.x + dpitch));
      },
      onPointerLockChange: () => {
        if (!this.input.pointerLocked && this.phase === 'playing' && !this.input.isTouch) {
          if (this.fromEditor) this.returnToEditor();
          else if (this.runKind === 'arena') this.openArenaMenu();
          else this.togglePause();
        }
      },
      onPauseToggle: () => {
        if (this.phase === 'editing') return;
        if (this.runKind === 'arena' && this.arenaScoreboard) {
          this.arenaScoreboard = false;
          return;
        }
        if (this.runKind === 'arena' && (this.phase === 'playing' || this.arenaMenu)) {
          if (this.arenaMenu) this.resume();
          else this.openArenaMenu();
          return;
        }
        if (this.phase === 'playing' && this.fromEditor) {
          this.returnToEditor();
          return;
        }
        if (this.phase === 'playing') this.togglePause();
        else if (this.phase === 'paused') {
          if (this.fromEditor) this.returnToEditor();
          else this.resume();
        }
        else if (this.phase === 'map') this.toggleMap(false);
      },
      // 'm' opens/closes the full map — same key, same behaviour, in every
      // mode (campaign, maze, arena). Arena additionally has Tab for the
      // detailed scoreboard (onScoreboardToggle below); campaign has no
      // scoreboard, so its Tab is wired to this same handler too.
      onMapToggle: () => this.handleMapToggle(),
      onScoreboardToggle: () => {
        if (this.phase === 'editing') return;
        if (this.runKind !== 'arena') { this.handleMapToggle(); return; }
        // Full map (opened via 'm' / touch UI / debug API) closes on Tab
        // too, matching the overlay's own "TAB / M / click to close" hint.
        if (this.phase === 'map') { this.toggleMap(false); return; }
        if (this.phase === 'playing' || this.arenaMenu) {
          this.arenaScoreboard = !this.arenaScoreboard;
        }
      },
    });
    this.canvasClickLock();
  }

  private canvasClickLock(): void {
    const canvas = this.renderer.domElement;
    canvas.addEventListener('click', () => {
      if (this.phase === 'playing' && !this.input.pointerLocked && !this.input.isTouch) {
        this.input.requestLock();
      }
    });
  }

  private get isPlayingLike(): boolean {
    return this.phase === 'playing' || this.phase === 'map';
  }

  /** In-game HUD (HEALTH / ammo / minimap). Title, overlays, editor, dead, won: hide. */
  private get showInGameHud(): boolean {
    return this.phase === 'playing' || this.phase === 'map' || this.phase === 'paused';
  }

  private setMinimapVisible(on: boolean): void {
    if (!this.miniCanvas) return;
    this.miniCanvas.style.display = on ? '' : 'none';
  }

  private applyDifficulty(d: Difficulty): void {
    this.settings.difficulty = d;
    saveSettings(this.settings);
    this.screens.setDifficulties(d, (dd, host) => this.onSkillClick(dd, host));
  }

  /** Title SKILL may rebuild a maze. Campaign SKILL only stores the setting. */
  private onSkillClick(d: Difficulty, host: string): void {
    this.applyDifficulty(d);
    if (host !== 'diff-row') return;
    if (this.phase === 'title' && this.sim && this.runKind === 'maze') {
      this.startRun(this.seed);
    }
  }

  // ------------------------------------------------------------------ run flow
  startRun(seed: string): void {
    this.runKind = 'maze';
    this.authoredBlueprint = null;
    this.shareCode = null;
    this.entryLoadout = null;
    this.fromEditor = false;
    this.playtestAllGuns = false;
    this.editor?.hide();
    this.screens.setRunKind('maze');
    this.screens.setPlaytestMode(false);
    this.seed = seed;
    this.sim = new Sim(seed, this.settings.difficulty);
    const startedAt = Date.now();
    if (shouldLogRun('maze', seed)) {
      this.runLog = { seed, difficulty: this.settings.difficulty, startedAt };
      prependMapLog({
        seed,
        difficulty: this.settings.difficulty,
        startedAt,
        genVersion: GEN_VERSION,
      });
    } else {
      this.runLog = null;
    }
    this.beginPlay('Find the seven guns. The Seventh unseals the arena.');
  }

  private NAME_KEY = 'seventh-gun.arenaName';

  private openArenaPanel(): void {
    let name = 'PLAYER';
    try { name = localStorage.getItem(this.NAME_KEY) || 'PLAYER'; } catch { /* ignore */ }
    this.screens.arenaNameInput.value = name;
    this.screens.showTitle(false);
    this.screens.showArenaJoin(true, this.arenaStatus);
  }

  async joinArena(name?: string): Promise<void> {
    if (this.pendingArenaClient || this.arenaClient) return;
    // Must run synchronously inside the click handler (before any await) so
    // the AudioContext is created/resumed within the user-gesture window.
    void this.audio.unlock();
    const raw = (name ?? this.screens.arenaNameInput.value).trim();
    try { localStorage.setItem(this.NAME_KEY, raw); } catch { /* ignore */ }
    this.screens.setArenaStatus('CONNECTING…');
    this.screens.setArenaJoining(true);
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const envUrl = (import.meta as { env?: { VITE_ARENA_WS_URL?: string } }).env?.VITE_ARENA_WS_URL;
    const url = envUrl ?? `${proto}://${window.location.host}/arena`;
    const client = new ArenaClient();
    const token = ++this.arenaJoinToken;
    this.pendingArenaClient = client;
    try {
      await client.connect(url, raw);
    } catch (err) {
      if (token !== this.arenaJoinToken) return;
      this.pendingArenaClient = null;
      this.screens.setArenaJoining(false);
      const reason = String(err);
      const status = reason === 'full' ? 'ARENA FULL'
        : reason === 'mismatch' ? 'GEN MISMATCH'
          : reason === 'protocol' ? 'UPDATE REQUIRED'
          : 'ARENA OFFLINE';
      this.arenaStatus = status;
      this.screens.setArenaStatus(status);
      return;
    }
    if (token !== this.arenaJoinToken) {
      client.close();
      return;
    }
    this.pendingArenaClient = null;
    this.screens.setArenaJoining(false);
    this.arenaClient = client;
    client.onClose = (r) => {
      this.arenaStatus = r === 'idle' ? 'KICKED: IDLE' : 'DISCONNECTED';
      this.leaveArenaSilent();
      this.phase = 'title';
      this.screens.showPause(false);
      this.screens.showTitle(true);
      this.screens.showArenaJoin(true, this.arenaStatus);
    };
    this.startArena();
  }

  private startArena(): void {
    const client = this.arenaClient;
    const view = client?.worldView();
    if (!client || !view) return;
    this.runKind = 'arena';
    this.sim = null;
    this.seed = client.seed;
    this.screens.setRunKind('arena');
    this.screens.showArenaJoin(false);
    this.screens.showTitle(false);
    this.renderer.setRun(view);
    this.phase = 'playing';
    this.arenaMenu = false;
    this.input.paused = false;
    this.screens.showPause(false);
    this.screens.showTouch(this.input.isTouch);
    this.hud.showMessage('FRAG THEM ALL');
    if (!this.input.isTouch) this.input.requestLock();
  }

  leaveArena(): void {
    this.leaveArenaSilent();
    this.toTitle();
  }

  private leaveArenaSilent(): void {
    this.cancelArenaJoin();
    this.arenaClient?.close();
    this.arenaClient = null;
    this.arenaMenu = false;
    this.arenaScoreboard = false;
  }

  private cancelArenaJoin(): void {
    this.arenaJoinToken++;
    this.pendingArenaClient?.close();
    this.pendingArenaClient = null;
    this.screens.setArenaJoining(false);
  }

  private openArenaMenu(): void {
    this.arenaMenu = true;
    // Don't let the (canvas-drawn) scoreboard keep rendering under the menu.
    this.arenaScoreboard = false;
    // Same handshake the campaign pause does (togglePause): stop feeding input
    // to the sim and give the mouse back. Without releaseLock() the pointer
    // stays captured, so there is no cursor to click RESUME with — and because
    // arena keeps phase==='playing', canvasClickLock would re-grab the lock on
    // any canvas click while the menu is open. closeArenaMenu() already assumes
    // the lock was released: it calls requestLock() on the way out.
    this.input.paused = true;
    this.input.releaseLock();
    this.screens.setRunKind('arena');
    this.screens.showPause(true);
  }

  private closeArenaMenu(): void {
    this.arenaMenu = false;
    // Must mirror openArenaMenu's input.paused = true, or the player resumes
    // into a frozen character that cannot move or shoot.
    this.input.paused = false;
    this.screens.showPause(false);
    if (!this.input.isTouch) this.input.requestLock();
  }

  startMap(input: MapBlueprint | string): void {
    if (typeof input === 'string') this.startFromCode(input);
    else this.startFromBlueprint(input);
  }

  private startFromCode(code: string): void {
    try {
      this.startFromBlueprint(decodeBlueprint(code), code);
    } catch {
      void this.bootFromShare(code);
    }
  }

  private startFromBlueprint(bp: MapBlueprint, code?: string, opts?: { playtest?: boolean; allGuns?: boolean }): void {
    const map = compileBlueprint(bp, { seed: mapSeedFromTitle(bp.title), difficulty: this.settings.difficulty });
    this.runKind = 'map';
    this.authoredBlueprint = bp;
    this.shareCode = code ?? encodeShareCodeSync(bp);
    if (!code) {
      void encodeShareCode(bp).then((c) => {
        if (this.authoredBlueprint === bp) this.shareCode = c;
      });
    }
    this.fromEditor = !!opts?.playtest;
    this.playtestAllGuns = !!opts?.allGuns;
    this.screens.setRunKind('map');
    this.screens.setPlaytestMode(this.fromEditor);
    this.seed = map.seed;
    const loadout = opts?.allGuns ? ALL_GUNS_LOADOUT : undefined;
    this.sim = Sim.fromMap(map, this.settings.difficulty, loadout ? { loadout } : undefined);
    this.runLog = null;
    this.beginPlay(map.title ?? 'Authored map.');
  }

  private async bootFromShare(code: string): Promise<void> {
    try {
      const bp = await decodeShareCode(code);
      this.startFromBlueprint(bp, code);
    } catch {
      this.screens.showToast('could not load map');
      this.screens.showTitle(true);
    }
  }

  private beginPlay(message: string): void {
    if (!this.sim) return;
    this.renderer.setRun(
      this.sim,
      this.runKind === 'campaign' ? campaignArtIdFromIndex(this.campaignIndex) : undefined,
    );
    this.editor?.hide();
    this.screens.showMapLog(false);
    this.screens.showCampaign(false);
    this.screens.showIntermission(false);
    this.screens.showCampaignWin(false);
    this.screens.showTitle(false);
    this.screens.showPause(false);
    this.screens.showVictory(false, '');
    this.screens.showDeathRow(false);
    this.screens.showMap(false);
    this.screens.showTouch(this.input.isTouch);
    this.setMinimapVisible(true);
    this.phase = 'playing';
    this.deathHandled = false;
    this.winHandled = false;
    this.hud.showMessage(message);
    this.audio.unlock().then(() => this.audio.startAmbient());
    this.input.paused = false;
    if (!this.input.isTouch) this.input.requestLock();
    this.pushLookToCamera(this.sim.player.yaw, this.sim.player.pitch);
  }

  /** Mouse look writes the camera; copy that aim into the sim before fire/step. */
  private pullAimFromCamera(sim: Sim): void {
    const cam = this.renderer.camera;
    cam.rotation.order = 'YXZ';
    sim.player.yaw = cam.rotation.y;
    // Three.js +X looks up; sim +pitch looks down.
    sim.player.pitch = lookPitchFromThree(cam.rotation.x);
  }

  private pushLookToCamera(yaw: number, pitch: number): void {
    const cam = this.renderer.camera;
    cam.rotation.order = 'YXZ';
    cam.rotation.y = yaw;
    cam.rotation.x = threePitchFromLook(pitch);
  }

  private lookAimDir(sim: Sim): { dirX: number; dirY: number; dirZ: number } {
    return aimDirFromLook(sim.player.yaw, sim.player.pitch);
  }

  private retryCurrent(): void {
    if (this.runKind === 'campaign') {
      this.startCampaignMap(this.campaignIndex, this.entryLoadout ?? campaignMap(this.campaignIndex)!.incomingLoadout);
      return;
    }
    if (this.runKind === 'map') {
      if (this.authoredBlueprint) {
        this.startFromBlueprint(this.authoredBlueprint, this.shareCode ?? undefined, {
          playtest: this.fromEditor,
          allGuns: this.playtestAllGuns,
        });
      } else if (this.shareCode) this.startFromCode(this.shareCode);
      return;
    }
    this.startRun(this.seed);
  }

  private secondaryCurrent(): void {
    if (this.runKind === 'map' || this.runKind === 'campaign') {
      this.toTitle();
      return;
    }
    this.startRun(randomSeed());
  }

  private async copyShareLink(): Promise<void> {
    const code = this.shareCode;
    if (!code) {
      this.screens.showToast('no link');
      return;
    }
    const url = shareUrlFromCode(code);
    const ok = await copyText(url);
    this.screens.showToast(ok ? 'link copied' : 'could not copy');
  }

  private finishMapLog(outcome: MapLogOutcome): void {
    if (!this.sim || !this.runLog) return;
    patchLatestMapLog(this.runLog, {
      outcome,
      durationSec: Math.round(this.sim.time),
      kills: this.sim.killCount,
    });
  }

  private openMapLog(): void {
    this.screens.showMapLog(true, loadMapLog());
  }

  private closeMapLog(): void {
    this.screens.showMapLog(false);
    this.screens.showTitle(true);
  }

  private openCampaign(): void {
    const progress = loadCampaignProgress();
    const next = progress && canContinue(progress) ? campaignMap(progress.nextMap) : undefined;
    this.screens.showCampaign(true, {
      canContinue: !!next,
      nextTitle: next?.title,
      unlockedThrough: unlockedThrough(progress),
    });
  }

  playCampaignMap(n: number): void {
    const progress = loadCampaignProgress();
    if (!isMapUnlocked(n, progress)) return;
    const cm = campaignMap(n);
    if (!cm) return;
    if (progress) this.applyDifficulty(progress.difficulty);
    this.startCampaignMap(cm.index, cm.incomingLoadout);
  }

  private closeCampaign(): void {
    this.screens.showCampaign(false);
    this.screens.showTitle(true);
  }

  beginCampaign(): void {
    const first = CAMPAIGN[0];
    saveCampaignProgress({
      difficulty: this.settings.difficulty,
      nextMap: 1,
      loadout: first.incomingLoadout,
      unlocked: 1,
    });
    this.startCampaignMap(1, first.incomingLoadout);
  }

  continueCampaign(): void {
    const progress = loadCampaignProgress();
    if (!progress || !canContinue(progress)) {
      this.beginCampaign();
      return;
    }
    this.applyDifficulty(progress.difficulty);
    this.startCampaignMap(progress.nextMap, progress.loadout);
  }

  startCampaign(n = 1): void {
    const cm = campaignMap(n) ?? CAMPAIGN[0];
    this.startCampaignMap(cm.index, cm.incomingLoadout);
  }

  private startCampaignMap(n: number, loadout: PlayerLoadout): void {
    const cm = campaignMap(n);
    if (!cm) return;
    this.runKind = 'campaign';
    this.authoredBlueprint = null;
    this.shareCode = null;
    this.runLog = null;
    this.fromEditor = false;
    this.playtestAllGuns = false;
    this.editor?.hide();
    this.screens.setPlaytestMode(false);
    this.campaignIndex = cm.index;
    this.entryLoadout = snapshotLoadout(loadout);
    this.screens.setRunKind('campaign');
    this.seed = cm.map.seed;
    this.sim = Sim.fromMap(cm.map, this.settings.difficulty, {
      loadout: snapshotLoadout(loadout),
      rngKey: `campaign:${cm.id}`,
    });
    const saved = loadCampaignProgress();
    saveCampaignProgress({
      difficulty: this.settings.difficulty,
      nextMap: saved?.nextMap ?? cm.index,
      loadout: saved?.loadout ?? this.entryLoadout,
      unlocked: unlockedThrough(saved),
      mapStartedAt: Date.now(),
    });
    this.beginPlay(cm.title);
  }

  completeMap(): void {
    const sim = this.sim;
    if (!sim || this.runKind !== 'campaign') return;
    const cm = campaignMap(this.campaignIndex);
    if (!cm) return;
    const sb = cm.map.sealBreak;
    if (sb.type === 'gun') {
      const pk = sim.pickups.find(p => p.kind === 'gun' && p.gun === sb.gun);
      if (pk) {
        pk.taken = false;
        sim.player.owned[sb.gun] = false;
        sim.player.x = pk.x;
        sim.player.z = pk.z;
        sim.step(emptyInput());
      }
    } else {
      const key = sim.pickups.find(p => p.kind === 'key');
      if (key) {
        key.taken = false;
        sim.hasKey = false;
        sim.player.x = key.x;
        sim.player.z = key.z;
        sim.step(emptyInput());
      }
    }
    const arena = sim.map.rooms[sim.map.arenaRoomId];
    sim.player.x = arena.cx;
    sim.player.z = arena.cz;
    for (const e of sim.enemies) {
      if (!e.dead && sim.enemyRoomId(e) === sim.map.arenaRoomId) {
        e.hp = 1;
        sim.damageEnemy(e, 10, 0);
      }
    }
    for (let i = 0; i < 90; i++) sim.step(emptyInput());
    for (const e of sim.takeEvents()) this.handleEvent(e);
    if (sim.phase === 'won' && !this.winHandled) {
      this.winHandled = true;
      this.phase = 'won';
      this.onCampaignMapWon();
    }
  }

  private continueFromIntermission(): void {
    const progress = loadCampaignProgress();
    const n = progress?.nextMap ?? this.campaignIndex + 1;
    const loadout = progress?.loadout ?? snapshotLoadout(this.sim!.player);
    this.startCampaignMap(n, loadout);
  }

  private onCampaignMapWon(): void {
    const sim = this.sim!;
    const cm = campaignMap(this.campaignIndex);
    if (!cm) return;
    this.input.releaseLock();
    this.screens.showTouch(false);
    this.screens.showMapLog(false);
    this.screens.showMap(false);
    const loadout = snapshotLoadout(sim.player);
    saveCampaignProgress(applyMapWin(
      loadCampaignProgress(),
      this.campaignIndex,
      loadout,
      this.settings.difficulty,
    ));
    if (this.campaignIndex >= 7) {
      this.screens.showCampaignWin(true, {
        title: cm.victoryTitle ?? 'THE SEVENTH IS SILENT',
        body: cm.victoryBody ?? 'You ended it.',
        stats: `KILLS ${sim.killCount} · HEALTH ${Math.max(0, Math.ceil(sim.player.hp))}`,
      });
      this.audio.stopLoops();
      return;
    }
    this.screens.showIntermission(true, cm.title, cm.intermission);
    this.audio.stopLoops();
  }

  private playFromLog(entry: MapLogEntry): void {
    this.applyDifficulty(entry.difficulty);
    this.screens.seedInput.value = entry.seed;
    this.screens.showMapLog(false);
    this.startRun(entry.seed);
  }

  private copySeed(seed: string): void {
    const done = () => this.screens.showToast('seed copied');
    const fail = () => this.screens.showToast('could not copy');
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(seed).then(done, () => {
        if (this.copySeedFallback(seed)) done();
        else fail();
      });
      return;
    }
    if (this.copySeedFallback(seed)) done();
    else fail();
  }

  private copySeedFallback(seed: string): boolean {
    try {
      const ta = document.createElement('textarea');
      ta.value = seed;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }

  private toTitle(): void {
    this.leaveArenaSilent();
    this.finishMapLog('quit');
    this.fromEditor = false;
    this.playtestAllGuns = false;
    this.screens.setPlaytestMode(false);
    this.editor?.hide();
    this.phase = 'title';
    this.input.paused = false;
    this.audio.stopLoops();
    this.screens.showPause(false);
    this.screens.showMap(false);
    this.screens.showVictory(false, '');
    this.screens.showMapLog(false);
    this.screens.showCampaign(false);
    this.screens.showIntermission(false);
    this.screens.showCampaignWin(false);
    this.screens.showDeathRow(false);
    this.screens.showArenaJoin(false);
    this.screens.showTitle(true);
    this.screens.showTouch(false);
    this.setMinimapVisible(false);
    this.hud.clear();
    this.input.releaseLock();
  }

  private ensureEditor(): EditorView {
    if (!this.editor) {
      this.editor = new EditorView();
      this.editor.bind({
        playtest: (bp, allGuns) => this.startFromBlueprint(bp, undefined, { playtest: true, allGuns }),
        toTitle: () => this.toTitle(),
        toast: (msg) => this.screens.showToast(msg),
        copyText,
      });
    }
    return this.editor;
  }

  private openEditor(): void {
    const ed = this.ensureEditor();
    this.phase = 'editing';
    this.screens.showTitle(false);
    this.screens.showMapLog(false);
    this.screens.showCampaign(false);
    this.screens.showIntermission(false);
    this.screens.showCampaignWin(false);
    this.screens.showPause(false);
    this.screens.showVictory(false, '');
    this.screens.showDeathRow(false);
    this.screens.showMap(false);
    this.screens.showTouch(false);
    this.setMinimapVisible(false);
    this.hud.clear();
    this.input.releaseLock();
    ed.show();
  }

  private returnToEditor(): void {
    this.fromEditor = false;
    this.screens.setPlaytestMode(false);
    this.audio.stopLoops();
    this.screens.showPause(false);
    this.screens.showVictory(false, '');
    this.screens.showMap(false);
    this.screens.showDeathRow(false);
    this.screens.showTouch(false);
    this.input.releaseLock();
    this.openEditor();
  }

  private async saveAuthoredToLibrary(): Promise<void> {
    if (!this.authoredBlueprint) {
      this.screens.showToast('no map');
      return;
    }
    try {
      const code = this.shareCode ?? await encodeShareCode(this.authoredBlueprint);
      upsertLibrary({ title: this.authoredBlueprint.title ?? 'UNTITLED', code });
      this.screens.showToast('saved');
    } catch {
      this.screens.showToast('could not save');
    }
  }

  private togglePause(): void {
    if (this.phase === 'playing') {
      this.phase = 'paused';
      this.input.paused = true;
      this.screens.showPause(true);
      this.input.releaseLock();
    } else if (this.phase === 'paused') {
      this.resume();
    }
  }

  private resume(): void {
    if (this.arenaMenu) {
      this.closeArenaMenu();
      return;
    }
    if (this.phase !== 'paused') return;
    this.phase = 'playing';
    this.input.paused = false;
    this.screens.showPause(false);
    if (!this.input.isTouch) this.input.requestLock();
  }

  /** The 'm' key (all modes) and Tab (campaign/maze only, arena uses Tab
   *  for the scoreboard): open the full map from 'playing', close it from
   *  'map'. No-op while editing or, in arena, while the pause menu is up
   *  (arena never leaves phase==='playing' for that, unlike campaign's
   *  'paused', so it needs its own check). */
  private handleMapToggle(): void {
    if (this.phase === 'editing') return;
    if (this.runKind === 'arena' && this.arenaMenu) return;
    if (this.phase === 'playing') this.toggleMap(true);
    else if (this.phase === 'map') this.toggleMap(false);
  }

  private toggleMap(open: boolean): void {
    if (open && this.phase === 'playing') {
      this.phase = 'map';
      this.screens.showMap(true);
      this.input.releaseLock();
    } else if (!open && this.phase === 'map') {
      this.phase = 'playing';
      this.screens.showMap(false);
      if (!this.input.isTouch) this.input.requestLock();
    }
  }

  // ------------------------------------------------------------------ loop
  private loop = (now: number): void => {
    this.raf = requestAnimationFrame(this.loop);
    this.tick(now);
  };

  /** One frame of game update + render. Called by rAF and by snapshot(). */
  tick(now: number): void {
    const dtReal = Math.min(0.1, (now - this.lastTime) / 1000);
    this.lastTime = now;
    const sim = this.sim;

    this.hud.update(dtReal);
    this.audio.update(dtReal, sim ? sim.player.hp / sim.player.maxHp : 1);

    if (!sim && this.runKind !== 'arena') {
      this.renderer.render();
      return;
    }

    if (this.runKind === 'arena' && this.arenaClient) {
      this.tickArena(dtReal);
      return;
    }

    if (!sim) {
      this.renderer.render();
      return;
    }

    if (this.isPlayingLike && this.freeze) {
      // Pose freeze: no movement / AI. Aim is the camera (mouse look).
      this.pullAimFromCamera(sim);
      const polled = this.input.poll(sim.player.yaw, sim.player.pitch);
      if (polled.switchGun && sim.player.owned[polled.switchGun]) {
        sim.player.gun = polled.switchGun;
      }
      if (polled.fire) {
        sim.tryFire(this.lookAimDir(sim));
        for (const e of sim.takeEvents()) this.handleEvent(e);
      }
    } else if (this.isPlayingLike && !this.freeze) {
      // Camera is look authority; copy it onto the player before stepping.
      this.pullAimFromCamera(sim);
      // wheel gun cycling
      const polled = this.input.poll(sim.player.yaw, sim.player.pitch);
      if (polled.wheel !== 0) {
        const dir = polled.wheel > 0 ? 1 : -1;
        let g = sim.player.gun;
        for (let i = 0; i < 7; i++) {
          g = ((g - 1 + dir + 7) % 7) + 1;
          if (sim.player.owned[g]) break;
        }
        this.lastGunCycled = g;
      }
      const switchGun = this.lastGunCycled || polled.switchGun;
      this.lastGunCycled = 0;

      const input = {
        moveX: polled.moveX, moveZ: polled.moveZ,
        yaw: sim.player.yaw, pitch: sim.player.pitch,
        fire: polled.fire, use: polled.use, switchGun,
        aimDir: this.lookAimDir(sim),
      };
      this.accumulator += dtReal;
      let steps = 0;
      while (this.accumulator >= STEP_DT && steps < 5) {
        sim.step(input, STEP_DT);
        this.accumulator -= STEP_DT;
        steps++;
      }
      if (steps === 5) this.accumulator = 0;

      const events = sim.takeEvents();
      for (const e of events) this.handleEvent(e);
    }

    // phase transitions from sim
    if (sim.phase === 'dying' && !this.deathHandled) {
      this.deathHandled = true;
      this.hud.died();
    }
    if (sim.phase === 'dead' && this.phase !== 'dead' && this.deathHandled) {
      this.phase = 'dead';
      this.toTitleAfterDeath();
    }
    if (sim.phase === 'won' && !this.winHandled) {
      this.winHandled = true;
      this.phase = 'won';
      if (this.runKind === 'campaign') this.onCampaignMapWon();
      else this.showVictory();
    }

    const moving = Math.abs(sim.player.x - (this.lastPx ?? sim.player.x)) + Math.abs(sim.player.z - (this.lastPz ?? sim.player.z)) > 0.001;
    this.lastPx = sim.player.x; this.lastPz = sim.player.z;

    if (this.showInGameHud) {
      this.renderer.update(dtReal, sim, moving);
      this.hud.draw(sim, { fullMapOpen: this.phase === 'map', paused: this.phase === 'paused' });
      this.setMinimapVisible(true);
      if (this.miniCanvas) this.hud.drawMinimap(sim, 0, false);
      if (this.phase === 'map') this.hud.drawMinimap(sim, 0, true);
    } else {
      this.setMinimapVisible(false);
      this.hud.clear();
      this.renderer.render();
    }
  };

  private lastPx: number | null = null;
  private lastPz: number | null = null;

  private tickArena(dtReal: number): void {
    const client = this.arenaClient;
    if (!client) { this.renderer.render(); return; }
    const cam = this.renderer.camera;
    cam.rotation.order = 'YXZ';
    const lookYaw = cam.rotation.y;
    const lookPitch = lookPitchFromThree(cam.rotation.x);
    const polled = this.input.poll(lookYaw, lookPitch);
    // Full map now opens in arena too (phase 'map'); freeze movement/fire
    // there just like the pause menu, matching campaign's "map pauses
    // combat" behaviour.
    const menu = this.arenaMenu || this.phase === 'map';
    const input = {
      moveX: menu ? 0 : polled.moveX,
      moveZ: menu ? 0 : polled.moveZ,
      yaw: lookYaw,
      pitch: lookPitch,
      fire: menu ? false : polled.fire,
      use: false,
      switchGun: polled.switchGun,
    };
    client.stepLocal(dtReal, input);
    const localShot = client.takeCosmeticShot();
    if (localShot) {
      this.audio.handleEvent({ t: 'shot', gun: localShot.gun, x: localShot.x, z: localShot.z, yaw: localShot.yaw }, 1, true);
      this.renderer.fireVisual(localShot.gun, localShot.yaw, lookPitch, localShot.x, localShot.z);
    }
    const view = client.worldView();
    for (const e of client.takeEvents()) this.handleArenaEvent(e, client.id);
    if (!view) { this.renderer.render(); return; }
    const others = client.others();
    const moving = Math.abs(view.player.x - (this.lastPx ?? view.player.x)) + Math.abs(view.player.z - (this.lastPz ?? view.player.z)) > 0.001;
    this.lastPx = view.player.x; this.lastPz = view.player.z;
    this.renderer.updateArena(dtReal, view, others, moving);
    const fullMapOpen = this.phase === 'map';
    this.hud.draw(view, { fullMapOpen, paused: this.arenaMenu });
    this.hud.drawArenaRoster(client.roster(), client.id, client.roster().length);
    if (this.arenaScoreboard) this.hud.drawArenaScoreboard(client.roster(), client.id, client.rtt);
    this.setMinimapVisible(true);
    if (this.miniCanvas) this.hud.drawMinimap(view, 0, false);
    if (fullMapOpen) this.hud.drawMinimap(view, 0, true);
    this.renderer.render();
  }

  private handleArenaEvent(e: ArenaEvent, selfId: number): void {
    const distGain = (x: number, z: number) => {
      const view = this.arenaClient?.worldView();
      if (!view) return 1;
      const d = Math.hypot(view.player.x - x, view.player.z - z);
      if (d <= 4) return 1;
      if (d >= 40) return 0;
      return 1 - (d - 4) / 36;
    };
    if (e.t === 'shot') {
      if (e.id === selfId && this.arenaClient?.shouldIgnoreEchoShot(e.id, e.spawnCount, e.inputSeq)) {
        // Local muzzle + shot already played; still want tracers from the server.
      } else {
        const gain = e.id === selfId ? 1 : distGain(e.x, e.z);
        this.audio.handleEvent({ t: 'shot', gun: e.gun, x: e.x, z: e.z, yaw: e.yaw }, gain, e.id === selfId);
        if (e.id === selfId) this.renderer.fireVisual(e.gun, e.yaw, e.pitch, e.x, e.z);
      }
    } else if (e.t === 'hitPlayer') {
      this.renderer.fx.blood(e.x, e.y, e.z, e.killed);
    } else if (e.t === 'dryfire' && e.id === selfId) {
      this.audio.handleEvent({ t: 'dryfire', gun: e.gun });
    } else if (e.t === 'explosion') {
      this.audio.handleEvent({ t: 'explosion', x: e.x, y: e.y, z: e.z, radius: e.radius }, distGain(e.x, e.z));
      this.renderer.fx.explosion(e.x, e.y, e.z, e.radius);
    } else if (e.t === 'playerHurt' && e.id === selfId) {
      this.hud.playerHurt(e.damage, e.fromAngle);
      this.audio.handleEvent({ t: 'playerHurt', damage: e.damage, fromAngle: e.fromAngle });
    } else if (e.t === 'playerDie' && e.id === selfId) {
      this.hud.died({ epitaph: '' });
      this.audio.handleEvent({ t: 'playerDie' });
    } else if (e.t === 'frag') {
      const roster = this.arenaClient?.roster() ?? [];
      const killer = roster.find((p) => p.id === e.killerId)?.name ?? '???';
      const victim = roster.find((p) => p.id === e.victimId)?.name ?? '???';
      this.hud.showMessage(e.suicide ? `${victim} ate it` : `${killer} fragged ${victim}`);
      if (e.victimId === selfId && !e.suicide) this.hud.died({ epitaph: `FRAGGED BY ${killer}` });
    } else if (e.t === 'pickup' && e.playerId === selfId) {
      this.audio.handleEvent({ t: 'pickup', kind: e.kind, label: e.label });
      this.hud.showMessage(e.label);
    } else if (e.t === 'tracer') {
      this.renderer.fx.tracer(e.x0, e.y0, e.z0, e.x1, e.y1, e.z1, 'bullets');
    } else if (e.t === 'beam') {
      this.renderer.fx.tracer(e.x0, e.y0, e.z0, e.x1, e.y1, e.z1, 'rail');
    }
  }

  private toTitleAfterDeath(): void {
    this.finishMapLog('died');
    this.screens.showMap(false);
    this.screens.showMapLog(false);
    this.screens.showCampaign(false);
    this.screens.showIntermission(false);
    this.screens.showCampaignWin(false);
    this.screens.showTouch(false);
    if (this.fromEditor) {
      this.screens.showTitle(true);
      this.screens.showDeathRow(true);
      this.screens.setPlaytestMode(true);
    } else {
      this.screens.showTitle(true);
      this.screens.showDeathRow(true);
      this.screens.seedInput.value = this.seed;
    }
    this.input.releaseLock();
    this.audio.stopLoops();
    this.setMinimapVisible(false);
    this.hud.clear();
  }

  private showVictory(): void {
    this.finishMapLog('won');
    const sim = this.sim!;
    this.input.releaseLock();
    this.screens.showTouch(false);
    this.screens.showMapLog(false);
    this.screens.showVictory(true,
      `KILLS ${sim.killCount} · HEALTH ${Math.max(0, Math.ceil(sim.player.hp))} · EXPLORED ${exploredPct(sim)}% · SEED ${this.seed}`);
    this.audio.stopLoops();
  }

  // ------------------------------------------------------------------ events
  private handleEvent(e: SimEvent): void {
    const sim = this.sim!;
    this.audio.handleEvent(e);
    switch (e.t) {
      case 'shot':
        this.renderer.fireVisual(e.gun, e.yaw, sim.player.pitch, e.x, e.z);
        break;
      case 'tracer':
        this.renderer.fx.tracer(e.x0, 1.62, e.z0, e.x1, 1.62, e.z1, 'bullets');
        break;
      case 'beam':
        this.renderer.fx.tracer(e.x0, 1.62, e.z0, e.x1, 1.62, e.z1, 'rail');
        break;
      case 'explosion':
        this.renderer.fx.explosion(e.x, e.y, e.z, e.radius);
        break;
      case 'hitEnemy':
        this.renderer.fx.blood(e.x, e.y, e.z, e.killed);
        if (!e.killed) break;
        this.renderer.fx.gibs(e.x, e.y, e.z);
        break;
      case 'playerHurt':
        this.hud.playerHurt(e.damage, e.fromAngle);
        break;
      case 'pickup':
        this.hud.showMessage(e.label);
        break;
      case 'sealBreak':
        this.renderer.fx.sealBreakFx(sim.map.seal.x, sim.map.seal.z);
        break;
      case 'message':
        this.hud.showMessage(e.text);
        break;
      default:
        break;
    }
  }

  // ------------------------------------------------------------------ debug API
  /** Render one frame and return a JPEG data URL (screenshot pipeline for e2e). */
  snapshotDataUrl(): string {
    const sim = this.sim;
    if (!sim) return '';
    // drive a full frame manually: rAF may be throttled in automation tabs.
    // Clamp the apparent frame gap so short-lived FX (muzzle flashes) survive
    // to be composited.
    this.lastTime = performance.now() - 16;
    this.tick(performance.now());
    const c = document.createElement('canvas');
    c.width = this.renderer.domElement.width;
    c.height = this.renderer.domElement.height;
    const g = c.getContext('2d')!;
    g.drawImage(this.renderer.domElement, 0, 0);
    g.drawImage(this.hud.canvas, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.85);
  }

  getDebugApi(): unknown {
    return {
      version: '1',
      state: () => {
        if (this.phase === 'editing') {
          const bp = this.editor?.getBlueprint();
          return {
            phase: 'editing',
            title: bp?.title ?? '',
            rooms: bp?.rooms.length ?? 0,
            startRoom: !!bp?.rooms.some(r => r.kind === 'start'),
          };
        }
        const sim = this.sim;
        if (!sim) {
          if (this.runKind === 'arena' && this.arenaClient) {
            const v = this.arenaClient.worldView();
            const p = v?.player;
            return {
              phase: this.phase,
              kind: 'arena',
              hp: p?.hp ?? 0,
              gun: p?.gun ?? 1,
              seed: this.arenaClient.seed,
              scoreboard: this.arenaScoreboard,
            };
          }
          return { phase: 'title' };
        }
        const p = sim.player;
        return {
          phase: this.phase,
          simPhase: sim.phase,
          hp: p.hp,
          gun: p.gun,
          owned: p.owned.slice(1, 8),
          ammo: { ...p.ammo },
          pos: { x: +p.x.toFixed(2), z: +p.z.toFixed(2) },
          yaw: +p.yaw.toFixed(3),
          pitch: +p.pitch.toFixed(3),
          camPitch: +this.renderer.camera.rotation.x.toFixed(3),
          camYaw: +this.renderer.camera.rotation.y.toFixed(3),
          seed: this.seed,
          kind: this.runKind,
          difficulty: this.settings.difficulty,
          kills: sim.killCount,
          enemiesAlive: sim.enemies.filter(e => !e.dead).length,
          arenaRemaining: sim.arenaEnemiesRemaining(),
          hasKey: sim.hasKey,
          sealIntact: sim.sealIntact,
          exploredPct: exploredPct(sim),
          secretsFound: sim.secrets.filter(s => s.found).length,
          secretsTotal: sim.secrets.length,
          powerups: {
            ward: +sim.powerups.wardT.toFixed(2),
            damage: sim.powerups.damageKind,
            damageT: +sim.powerups.damageT.toFixed(2),
          },
          mapHash: this.mapHash(),
          campaign: this.runKind === 'campaign' ? {
            map: this.campaignIndex,
            nextMap: loadCampaignProgress()?.nextMap ?? this.campaignIndex,
            unlocked: unlockedThrough(loadCampaignProgress()),
            owned: p.owned.slice(1, 8),
            artId: campaignArtIdFromIndex(this.campaignIndex),
          } : null,
        };
      },
      startRun: (seed?: string, difficulty?: Difficulty) => {
        if (difficulty) this.applyDifficulty(difficulty);
        this.startRun(seed ?? randomSeed());
      },
      startMap: (input: MapBlueprint | string) => {
        this.startMap(input);
      },
      startCampaign: (n?: number) => {
        this.startCampaign(n ?? 1);
      },
      completeMap: () => {
        this.completeMap();
      },
      campaign: () => {
        const progress = loadCampaignProgress();
        return {
          map: this.runKind === 'campaign' ? this.campaignIndex : 0,
          nextMap: progress?.nextMap ?? 1,
          unlocked: unlockedThrough(progress),
          owned: this.sim ? this.sim.player.owned.slice(1, 8) : [],
        };
      },
      loadBlueprint: (bp: MapBlueprint) => {
        this.ensureEditor().loadBlueprint(bp);
        this.openEditor();
      },
      editorShare: () => this.editor?.sharePayload() ?? null,
      stampEditorRoom: (opts: { x: number; z: number; w: number; h: number }) => {
        const ed = this.ensureEditor();
        const room = ed.doc.stampRoom({ x: opts.x, z: opts.z, w: opts.w, h: opts.h, kind: 'spine' });
        ed.paint();
        return room ? { id: room.id, kind: room.kind } : null;
      },
      openEditor: () => this.openEditor(),
      give: (gun: number) => { this.sim?.giveGun(gun); },
      fire: (hold = true) => { this.input.setFire(hold); },
      /** One posed shot along the current camera forward (works while frozen). */
      shoot: () => {
        const sim = this.sim;
        if (!sim || this.phase !== 'playing') return { ok: false };
        const bullets = sim.player.ammo.bullets;
        this.pullAimFromCamera(sim);
        sim.tryFire(this.lookAimDir(sim));
        const evs = sim.takeEvents();
        for (const e of evs) this.handleEvent(e);
        return {
          ok: true,
          spent: sim.player.ammo.bullets < bullets,
          hit: evs.some(e => e.t === 'hitEnemy'),
          killed: evs.some(e => e.t === 'hitEnemy' && e.killed),
          kills: sim.killCount,
        };
      },
      inputKey: (code: string, down: boolean) => {
        if (down) this.input['keys'].add(code);
        else this.input['keys'].delete(code);
      },
      teleport: (x: number, z: number) => {
        if (!this.sim) return;
        this.sim.player.x = x; this.sim.player.z = z;
      },
      warpTo: (target: string) => {
        const sim = this.sim;
        if (!sim) return;
        const p = sim.player;
        if (target === 'arena') {
          const a = sim.map.rooms[sim.map.arenaRoomId];
          p.x = a.cx; p.z = a.cz;
        } else if (target === 'antechamber') {
          const a = sim.map.rooms[sim.map.antechamberId];
          p.x = a.cx; p.z = a.cz;
        } else if (target.startsWith('gun')) {
          const n = Number(target.slice(3));
          const pk = sim.pickups.find(pp => pp.kind === 'gun' && pp.gun === n);
          if (pk) { p.x = pk.x; p.z = pk.z; }
        } else if (target === 'key') {
          const pk = sim.pickups.find(pp => pp.kind === 'key');
          if (pk) { p.x = pk.x; p.z = pk.z; }
        } else if (target === 'enemy') {
          const e = sim.enemies.find(en => !en.dead);
          if (e) { p.x = e.x + 4; p.z = e.z; }
        }
      },
      killPlayer: () => {
        const sim = this.sim;
        if (sim) sim.damagePlayer(9999, sim.player.x + 1, sim.player.z);
      },
      clearArena: () => {
        const sim = this.sim;
        if (!sim) return;
        for (const e of sim.enemies) {
          if (!e.dead && sim.enemyRoomId(e) === sim.map.arenaRoomId) { e.hp = 1; sim.damageEnemy(e, 10, 0); }
        }
      },
      killSome: (n = 1) => {
        const sim = this.sim;
        if (!sim) return;
        let k = 0;
        for (const e of sim.enemies) {
          if (k >= n) break;
          if (!e.dead) { e.hp = 1; sim.damageEnemy(e, 10, 0); k++; }
        }
      },
      hurt: (n: number) => {
        const sim = this.sim;
        if (sim) sim.damagePlayer(n, sim.player.x + 1, sim.player.z);
      },
      step: (n: number) => {
        const sim = this.sim;
        if (!sim) return;
        const yaw = sim.player.yaw, pitch = sim.player.pitch;
        for (let i = 0; i < n; i++) sim.step({ ...emptyInput(), yaw, pitch });
        for (const e of sim.takeEvents()) this.handleEvent(e);
      },
      mapHash: () => this.mapHash(),
      look: (yawDeg: number, pitchDeg = 0) => {
        const sim = this.sim;
        if (!sim) return;
        const yaw = (yawDeg * Math.PI) / 180;
        // Positive pitchDeg is look-DOWN (look(0, 22) → +0.384, ray y≈0.5 at 3.2u).
        const pitch = (pitchDeg * Math.PI) / 180;
        sim.player.yaw = yaw;
        sim.player.pitch = pitch;
        this.pushLookToCamera(yaw, pitch);
      },
      /** Set camera pitch only (player.pitch unchanged). Proves fire reads the camera. */
      setCameraPitch: (pitchDeg: number) => {
        const cam = this.renderer.camera;
        cam.rotation.order = 'YXZ';
        cam.rotation.x = (pitchDeg * Math.PI) / 180;
      },
      tickNow: () => { this.tick(performance.now()); },
      /** InputManager fire + one tick (not G.shoot / look). */
      inputFire: () => {
        const sim = this.sim;
        if (!sim || this.phase !== 'playing') return { ok: false };
        const bullets = sim.player.ammo.bullets;
        const kills = sim.killCount;
        const hpSum = sim.enemies.reduce((s, e) => s + Math.max(0, e.hp), 0);
        this.input.setFire(true);
        this.tick(performance.now());
        this.input.setFire(false);
        const hpAfter = sim.enemies.reduce((s, e) => s + Math.max(0, e.hp), 0);
        return {
          ok: true,
          spent: sim.player.ammo.bullets < bullets,
          hit: hpAfter < hpSum || sim.killCount > kills,
          killed: sim.killCount > kills,
          kills: sim.killCount,
        };
      },
      pause: () => this.togglePause(),
      toggleMap: () => this.toggleMap(!this.screens.isMapOpen()),
      pose: (opts: { gun?: number; fire?: boolean; enemy?: string; yaw?: number; pitch?: number; dist?: number }): unknown => {
        // screenshot helper: freeze a composition
        const sim = this.sim;
        if (!sim) return 'no-sim';
        const p = sim.player;
        if (opts.gun) sim.giveGun(opts.gun);
        if (opts.yaw !== undefined) p.yaw = (opts.yaw * Math.PI) / 180;
        if (opts.pitch !== undefined) p.pitch = (opts.pitch * Math.PI) / 180;
        this.pushLookToCamera(p.yaw, p.pitch);
        if (opts.fire) this.renderer.fireVisual(p.gun, p.yaw, p.pitch, p.x, p.z);
        let placed: { id: number; type: string; x: number; z: number } | null = null;
        if (opts.enemy) {
          const e = sim.enemies.find(en => en.type === opts.enemy && !en.dead) ?? sim.enemies.find(en => !en.dead);
          if (e) {
            const want = opts.dist ?? 5;
            // Prefer a floor cell with LOS so the posed body is not behind a
            // wall the hitscan would eat (tight start-room corners).
            let d = want;
            for (const tryD of [want, want + 0.8, want - 0.5, 2.6, 4.0]) {
              if (tryD < 1.2) continue;
              const x = p.x - Math.sin(p.yaw) * tryD;
              const z = p.z - Math.cos(p.yaw) * tryD;
              if (circleFits(sim, x, z, e.def.radius) && hasLineOfSight(sim, p.x, p.z, x, z)) {
                d = tryD;
                e.x = x; e.z = z;
                break;
              }
              e.x = x; e.z = z;
            }
            e.yaw = p.yaw; // face the camera (rig local +z is forward; see sim.ts:757)
            e.state = 'idle';
            e.awakened = false;
            placed = { id: e.id, type: e.type, x: +e.x.toFixed(1), z: +e.z.toFixed(1), dist: +d.toFixed(2) } as { id: number; type: string; x: number; z: number };
          }
        }
        this.freeze = true;
        return {
          player: {
            x: +p.x.toFixed(1), z: +p.z.toFixed(1),
            yaw: +p.yaw.toFixed(2), pitch: +p.pitch.toFixed(3),
          },
          placed,
        };
      },
      unfreeze: () => { this.freeze = false; },
      snapshot: () => this.snapshotDataUrl(),
      debugInfo: () => ({
        rigs: this.renderer.enemyRigInfo.slice(0, 8),
        muzzle: this.renderer.muzzleState,
        updateCount: this.renderer.enemyUpdateCount,
        simEnemies: this.sim ? this.sim.enemies.slice(0, 8).map(e => ({
          id: e.id, type: e.type, x: +e.x.toFixed(1), z: +e.z.toFixed(1),
          dead: e.dead, hp: +e.hp.toFixed(1),
        })) : [],
        playerPos: { x: +this.sim!.player.x.toFixed(1), z: +this.sim!.player.z.toFixed(1), yaw: +this.sim!.player.yaw.toFixed(2), pitch: +this.sim!.player.pitch.toFixed(3) },
        camera: { yaw: +this.renderer.camera.rotation.y.toFixed(3), pitch: +this.renderer.camera.rotation.x.toFixed(3) },
        lastAimDir: this.sim ? this.sim.lastAimDir : null,
      }),
      showAllEnemies: (v: boolean) => { this.renderer.showAllEnemies = v; },
      setTouch: (v: boolean) => {
        this.input.isTouch = v;
        this.screens.showTouch(v && this.isPlayingLike);
      },
      joinArena: (name?: string) => this.joinArena(name),
      leaveArena: () => this.leaveArena(),
      arena: () => this.arenaClient?.debugState() ?? null,
      warps: () => {
        const sim = this.sim;
        if (!sim) return {};
        return {
          doors: sim.map.doors.map(d => ({ id: d.id, x: d.x, z: d.z, axis: d.axis, locked: d.locked })),
          pickups: sim.pickups.filter(p => !p.taken).map(p => ({ kind: p.kind, gun: p.gun ?? null, x: p.x, z: p.z })),
          decors: sim.map.decors.map(dc => ({ kind: dc.kind, x: dc.x, z: dc.z, y: dc.y, facing: dc.facing })),
          seal: { x: sim.map.seal.x, z: sim.map.seal.z },
        };
      },
    };
  }

  private mapHash(): string {
    const sim = this.sim;
    if (!sim) return '';
    let h = 5381;
    const s = [...sim.map.grid].join('');
    for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
    return h.toString(16);
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
  }
}
