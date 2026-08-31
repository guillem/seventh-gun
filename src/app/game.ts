// Game orchestrator: loop, phases (title/playing/paused/dying/dead/won),
// input -> sim stepping, event fan-out to renderer/audio/HUD, debug API.
import * as THREE from 'three';
import { Sim, STEP_DT, emptyInput } from '../sim/sim';
import type { SimEvent, Difficulty } from '../sim/types';
import { weapon, WEAPONS } from '../sim/weapons';
import { GameRenderer } from '../render/renderer';
import { AudioEngine } from '../audio/audio';
import { Hud, exploredPct } from '../ui/hud';
import { Screens, loadSettings, saveSettings, randomSeed, type Settings } from '../ui/screens';
import { InputManager } from './input';

type Phase = 'title' | 'playing' | 'paused' | 'map' | 'dead' | 'won';

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
    this.screens.setDifficulties(this.settings.difficulty, (d) => this.setDifficulty(d));

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
      retry: () => this.startRun(this.seed),
      newMaze: () => this.startRun(randomSeed()),
      volume: (v) => { this.settings.volume = v; this.audio.setVolume(v); saveSettings(this.settings); },
      mute: () => {
        this.settings.muted = !this.settings.muted;
        this.audio.setMuted(this.settings.muted);
        this.screens.setMuteLabel(this.settings.muted);
        saveSettings(this.settings);
      },
    });
    this.screens.bindPause({
      resume: () => this.resume(),
      retry: () => this.startRun(this.seed),
      newMaze: () => this.startRun(randomSeed()),
      quit: () => this.toTitle(),
      volume: (v) => { this.settings.volume = v; this.audio.setVolume(v); saveSettings(this.settings); },
      sens: (v) => { this.settings.sensitivity = v; this.input.sensitivity = v; saveSettings(this.settings); },
    });
    this.screens.bindVictory({
      retry: () => this.startRun(this.seed),
      newMaze: () => this.startRun(randomSeed()),
    });
    this.screens.setTouchUi({
      fire: (down) => this.input.setFire(down),
      use: () => { if (this.sim) this.sim.tryUse(); },
      map: () => this.toggleMap(!this.screens.isMapOpen()),
      pause: () => this.togglePause(),
    });
    this.screens.seedInput.addEventListener('keydown', (e) => {
      if (e.code === 'Enter') this.startRun(this.screens.seedInput.value.trim() || randomSeed());
      e.stopPropagation();
    });
  }

  private wireInput(): void {
    this.input.setCallbacks({
      onPointerLockChange: () => {
        if (!this.input.pointerLocked && this.phase === 'playing' && !this.input.isTouch) {
          // Esc or click-out releases the lock -> pause
          this.togglePause();
        }
      },
      onPauseToggle: () => {
        if (this.phase === 'playing') this.togglePause();
        else if (this.phase === 'paused') this.resume();
        else if (this.phase === 'map') this.toggleMap(false);
      },
      onMapToggle: () => {
        if (this.phase === 'playing') this.toggleMap(true);
        else if (this.phase === 'map') this.toggleMap(false);
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

  private setDifficulty(d: Difficulty): void {
    this.settings.difficulty = d;
    saveSettings(this.settings);
    this.screens.setDifficulties(d, (dd) => this.setDifficulty(dd));
    if (this.phase === 'title' && this.sim) this.startRun(this.seed); // rebuild economy
  }

  // ------------------------------------------------------------------ run flow
  startRun(seed: string): void {
    this.seed = seed;
    this.sim = new Sim(seed, this.settings.difficulty);
    this.renderer.setRun(this.sim);
    this.screens.showTitle(false);
    this.screens.showPause(false);
    this.screens.showVictory(false, '');
    this.screens.showDeathRow(false);
    this.screens.showMap(false);
    this.screens.showTouch(this.input.isTouch);
    this.phase = 'playing';
    this.deathHandled = false;
    this.winHandled = false;
    this.hud.showMessage('Find the seven guns. The Seventh unseals the arena.');
    this.audio.unlock().then(() => this.audio.startAmbient());
    if (!this.input.isTouch) this.input.requestLock();
  }

  private toTitle(): void {
    this.phase = 'title';
    this.audio.stopLoops();
    this.screens.showPause(false);
    this.screens.showMap(false);
    this.screens.showVictory(false, '');
    this.screens.showTitle(true);
    this.screens.showTouch(false);
    this.input.releaseLock();
  }

  private togglePause(): void {
    if (this.phase === 'playing') {
      this.phase = 'paused';
      this.screens.showPause(true);
      this.input.releaseLock();
    } else if (this.phase === 'paused') {
      this.resume();
    }
  }

  private resume(): void {
    if (this.phase !== 'paused') return;
    this.phase = 'playing';
    this.screens.showPause(false);
    if (!this.input.isTouch) this.input.requestLock();
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

    if (!sim) {
      this.renderer.render();
      return;
    }

    if (this.isPlayingLike && !this.freeze) {
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
        yaw: polled.yaw, pitch: polled.pitch,
        fire: polled.fire, use: polled.use, switchGun,
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
      this.showVictory();
    }

    const moving = Math.abs(sim.player.x - (this.lastPx ?? sim.player.x)) + Math.abs(sim.player.z - (this.lastPz ?? sim.player.z)) > 0.001;
    this.lastPx = sim.player.x; this.lastPz = sim.player.z;

    this.renderer.update(dtReal, sim, moving, { onEvent: () => { /* handled centrally */ } });
    this.hud.draw(sim, { fullMapOpen: this.phase === 'map', paused: this.phase === 'paused' });
    if (this.miniCanvas && this.phase !== 'title') {
      this.hud.drawMinimap(sim, 0, false);
    }
    if (this.phase === 'map') {
      this.hud.drawMinimap(sim, 0, true);
    }
  };

  private lastPx: number | null = null;
  private lastPz: number | null = null;

  private toTitleAfterDeath(): void {
    this.screens.showMap(false);
    this.screens.showTouch(false);
    this.screens.showTitle(true);
    this.screens.showDeathRow(true);
    this.screens.seedInput.value = this.seed;
    this.input.releaseLock();
    this.audio.stopLoops();
  }

  private showVictory(): void {
    const sim = this.sim!;
    this.input.releaseLock();
    this.screens.showTouch(false);
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
        this.renderer.fx.tracer(e.x0, 1.62, e.z0, e.x1, e.z1, 'bullets');
        break;
      case 'beam':
        this.renderer.fx.tracer(e.x0, 1.62, e.z0, e.x1, e.z1, 'rail');
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
        const sim = this.sim;
        if (!sim) return { phase: 'title' };
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
          seed: this.seed,
          difficulty: this.settings.difficulty,
          kills: sim.killCount,
          enemiesAlive: sim.enemies.filter(e => !e.dead).length,
          arenaRemaining: sim.arenaEnemiesRemaining(),
          hasKey: sim.hasKey,
          sealIntact: sim.sealIntact,
          exploredPct: exploredPct(sim),
          mapHash: this.mapHash(),
        };
      },
      startRun: (seed?: string, difficulty?: Difficulty) => {
        if (difficulty) this.setDifficulty(difficulty);
        this.startRun(seed ?? randomSeed());
      },
      give: (gun: number) => { this.sim?.giveGun(gun); },
      fire: (hold = true) => { this.input.setFire(hold); },
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
      hurt: (n: number) => {
        const sim = this.sim;
        if (sim) sim.damagePlayer(n, sim.player.x + 1, sim.player.z);
      },
      step: (n: number) => {
        const sim = this.sim;
        if (!sim) return;
        for (let i = 0; i < n; i++) sim.step(emptyInput());
        for (const e of sim.takeEvents()) this.handleEvent(e);
      },
      mapHash: () => this.mapHash(),
      look: (yawDeg: number, pitchDeg = 0) => {
        const sim = this.sim;
        if (!sim) return;
        sim.player.yaw = (yawDeg * Math.PI) / 180;
        sim.player.pitch = (pitchDeg * Math.PI) / 180;
      },
      pause: () => this.togglePause(),
      toggleMap: () => this.toggleMap(!this.screens.isMapOpen()),
      pose: (opts: { gun?: number; fire?: boolean; enemy?: string; yaw?: number; dist?: number }): unknown => {
        // screenshot helper: freeze a composition
        const sim = this.sim;
        if (!sim) return 'no-sim';
        const p = sim.player;
        if (opts.gun) sim.giveGun(opts.gun);
        if (opts.yaw !== undefined) p.yaw = (opts.yaw * Math.PI) / 180;
        if (opts.fire) this.renderer.fireVisual(p.gun, p.yaw, p.pitch, p.x, p.z);
        let placed: { id: number; type: string; x: number; z: number } | null = null;
        if (opts.enemy) {
          const e = sim.enemies.find(en => en.type === opts.enemy && !en.dead) ?? sim.enemies.find(en => !en.dead);
          if (e) {
            const d = opts.dist ?? 5;
            // teleport the ENEMY in front of the player (player may sit in a
            // safe corner; moving them breaks the composition)
            e.x = p.x - Math.sin(p.yaw) * d;
            e.z = p.z - Math.cos(p.yaw) * d;
            e.yaw = p.yaw + Math.PI; // face the camera
            e.state = 'idle';
            e.awakened = false;
            placed = { id: e.id, type: e.type, x: +e.x.toFixed(1), z: +e.z.toFixed(1) };
          }
        }
        this.freeze = true;
        return { player: { x: +p.x.toFixed(1), z: +p.z.toFixed(1), yaw: +p.yaw.toFixed(2) }, placed };
      },
      unfreeze: () => { this.freeze = false; },
      snapshot: () => this.snapshotDataUrl(),
      debugInfo: () => ({
        rigs: this.renderer.enemyRigInfo.slice(0, 8),
        muzzle: this.renderer.muzzleState,
        updateCount: this.renderer.enemyUpdateCount,
        simEnemies: this.sim ? this.sim.enemies.slice(0, 5).map(e => ({ id: e.id, x: +e.x.toFixed(1), z: +e.z.toFixed(1), dead: e.dead })) : [],
        playerPos: { x: +this.sim!.player.x.toFixed(1), z: +this.sim!.player.z.toFixed(1), yaw: +this.sim!.player.yaw.toFixed(2) },
      }),
      showAllEnemies: (v: boolean) => { this.renderer.showAllEnemies = v; },
      setTouch: (v: boolean) => {
        this.input.isTouch = v;
        this.screens.showTouch(v && this.isPlayingLike);
      },
      warps: () => {
        const sim = this.sim;
        if (!sim) return {};
        return {
          doors: sim.map.doors.map(d => ({ id: d.id, x: d.x, z: d.z, axis: d.axis, locked: d.locked })),
          pickups: sim.pickups.filter(p => !p.taken).map(p => ({ kind: p.kind, gun: p.gun ?? null, x: p.x, z: p.z })),
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
