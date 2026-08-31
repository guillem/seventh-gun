// Fully synthesized audio: per-gun SFX, enemy voices, pickups, doors,
// stings, ambient drone. WebAudio, unlocked on first gesture. iOS: request
// playback audio session so the silent switch doesn't mute us.
import type { SimEvent, EnemyType } from '../sim/types';

type Ctx = AudioContext;

export class AudioEngine {
  private ctx: Ctx | null = null;
  private master: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private ambientGain: GainNode | null = null;
  private ambientNodes: OscillatorNode[] = [];
  private chaingunLoop: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
  private voices = 0;
  private lastVoiceTime = 0;
  muted = false;
  volume = 0.8;
  private heartTimer = 0;

  async unlock(): Promise<void> {
    if (!this.ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC({ latencyHint: 'interactive' });
      this.compressor = this.ctx.createDynamicsCompressor();
      this.compressor.threshold.value = -18;
      this.compressor.ratio.value = 6;
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : this.volume;
      this.compressor.connect(this.master);
      this.master.connect(this.ctx.destination);
      // iOS 17+: mark as playback so the hardware silent switch doesn't mute SFX
      try {
        const nav = navigator as unknown as { audioSession?: { type: string; preferredSampleRate?: number } };
        if (nav.audioSession) nav.audioSession.type = 'playback';
      } catch { /* older browsers */ }
    }
    if (this.ctx.state === 'suspended') {
      try { await this.ctx.resume(); } catch { /* ignore */ }
    }
  }

  setVolume(v: number): void {
    this.volume = v;
    if (this.master) this.master.gain.value = this.muted ? 0 : v;
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : this.volume;
  }

  private now(): number {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  /** Simple voice cap to avoid clipping the mix. */
  private canPlay(): boolean {
    if (!this.ctx || this.muted) return false;
    const t = this.now();
    if (t - this.lastVoiceTime > 0.05) this.voices = Math.max(0, this.voices - 8);
    this.lastVoiceTime = t;
    if (this.voices > 26) return false;
    this.voices++;
    return true;
  }

  private out(): AudioNode {
    return this.compressor ?? (this.ctx as Ctx).destination;
  }

  private noiseBuffer: AudioBuffer | null = null;
  private getNoise(): AudioBuffer {
    if (this.noiseBuffer || !this.ctx) return this.noiseBuffer!;
    const len = this.ctx.sampleRate * 1.2;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    let seed = 1234567;
    for (let i = 0; i < len; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      d[i] = (seed / 0x3fffffff) - 1;
    }
    this.noiseBuffer = buf;
    return buf;
  }

  private noise(dur: number, gain: number, filterType: BiquadFilterType, freq: number, q = 1, freqEnd?: number): void {
    if (!this.canPlay()) return;
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.getNoise();
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter();
    f.type = filterType;
    f.frequency.value = freq;
    f.Q.value = q;
    if (freqEnd !== undefined) {
      f.frequency.setValueAtTime(freq, this.now());
      f.frequency.exponentialRampToValueAtTime(Math.max(30, freqEnd), this.now() + dur);
    }
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, this.now());
    g.gain.exponentialRampToValueAtTime(0.001, this.now() + dur);
    src.connect(f); f.connect(g); g.connect(this.out());
    src.start();
    src.stop(this.now() + dur + 0.02);
  }

  private tone(
    type: OscillatorType, f0: number, f1: number, dur: number, gain: number,
    harmonics = 0,
  ): void {
    if (!this.canPlay()) return;
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, this.now());
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), this.now() + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, this.now());
    g.gain.exponentialRampToValueAtTime(gain, this.now() + 0.008);
    g.gain.exponentialRampToValueAtTime(0.001, this.now() + dur);
    osc.connect(g); g.connect(this.out());
    osc.start();
    osc.stop(this.now() + dur + 0.02);
    for (let h = 1; h <= harmonics; h++) {
      const o2 = ctx.createOscillator();
      o2.type = type;
      o2.frequency.setValueAtTime(f0 * (h * 2), this.now());
      o2.frequency.exponentialRampToValueAtTime(Math.max(20, f1 * (h * 2)), this.now() + dur);
      const g2 = ctx.createGain();
      g2.gain.setValueAtTime(gain / (h * 2.5), this.now());
      g2.gain.exponentialRampToValueAtTime(0.001, this.now() + dur);
      o2.connect(g2); g2.connect(this.out());
      o2.start(); o2.stop(this.now() + dur + 0.02);
    }
  }

  // ------------------------------------------------------------- guns
  gunSound(id: number): void {
    switch (id) {
      case 1: // pistol: snappy crack
        this.noise(0.09, 0.5, 'bandpass', 2400, 0.8);
        this.tone('square', 900, 120, 0.07, 0.25);
        break;
      case 2: // shotgun: huge boom
        this.noise(0.34, 0.9, 'lowpass', 1800, 0.6, 260);
        this.tone('sine', 130, 38, 0.28, 0.65, 1);
        this.noise(0.12, 0.4, 'highpass', 1500, 0.5);
        break;
      case 3: // chaingun: rapid bark
        this.noise(0.06, 0.42, 'bandpass', 1900, 1.2);
        this.tone('sawtooth', 480, 140, 0.05, 0.2);
        break;
      case 4: // spiker: pneumatic thunk + zip
        this.tone('triangle', 220, 70, 0.08, 0.4);
        this.noise(0.1, 0.25, 'bandpass', 3400, 2, 5200);
        break;
      case 5: // bile launcher: wet thoonk
        this.tone('sine', 180, 50, 0.2, 0.5, 1);
        this.noise(0.16, 0.3, 'lowpass', 700, 1, 200);
        break;
      case 6: // sunlance: movie laser pew
        this.tone('sawtooth', 2400, 180, 0.34, 0.4, 2);
        this.tone('sine', 3600, 900, 0.2, 0.22);
        this.noise(0.08, 0.15, 'highpass', 4000, 1);
        break;
      case 7: // the seventh: deep charge-fire
        this.tone('sine', 60, 24, 0.5, 0.7, 2);
        this.tone('sawtooth', 300, 40, 0.42, 0.3, 1);
        this.noise(0.4, 0.35, 'lowpass', 900, 0.8, 120);
        break;
    }
  }

  dryFire(): void {
    this.tone('square', 320, 240, 0.03, 0.12);
    this.noise(0.03, 0.12, 'highpass', 3000, 1);
  }

  explosion(radius: number): void {
    const k = Math.min(1.4, radius / 6);
    this.noise(0.6 * k, 0.9, 'lowpass', 900, 0.7, 90);
    this.tone('sine', 110, 28, 0.5 * k, 0.8, 1);
    this.noise(0.2, 0.3, 'highpass', 2500, 0.6);
  }

  // ------------------------------------------------------------- enemies
  private voice(type: EnemyType, kind: 'alert' | 'pain' | 'death'): void {
    // each species has a distinct pitch band + waveform character
    const spec: Record<EnemyType, { f: number; type: OscillatorType; grit: number }> = {
      husk: { f: 210, type: 'sawtooth', grit: 0.3 },
      crawler: { f: 640, type: 'square', grit: 0.5 },
      slab: { f: 90, type: 'sawtooth', grit: 0.35 },
      wisp: { f: 820, type: 'sine', grit: 0.15 },
      hierophant: { f: 130, type: 'square', grit: 0.4 },
    };
    const s = spec[type];
    if (kind === 'alert') {
      this.tone(s.type, s.f * 0.7, s.f * 1.35, 0.28, 0.3, 1);
      if (s.grit > 0.25) this.noise(0.18, 0.18 * s.grit, 'bandpass', s.f * 3, 2);
    } else if (kind === 'pain') {
      this.tone(s.type, s.f * 1.15, s.f * 0.6, 0.18, 0.26, 1);
      this.noise(0.1, 0.2, 'bandpass', s.f * 2.4, 2.5);
    } else {
      // death scream: downward sweep + rattle
      this.tone(s.type, s.f * 1.4, s.f * 0.22, 0.75, 0.34, 2);
      this.noise(0.55, 0.3, 'lowpass', 1400, 0.8, 180);
    }
  }

  enemyShoot(type: EnemyType): void {
    switch (type) {
      case 'husk': this.tone('triangle', 700, 220, 0.12, 0.2); break;
      case 'crawler': this.tone('square', 950, 500, 0.07, 0.14); break;
      case 'slab': this.tone('sine', 160, 60, 0.22, 0.4, 1); this.noise(0.15, 0.2, 'lowpass', 600, 1, 150); break;
      case 'wisp': this.tone('sine', 1500, 700, 0.09, 0.15); break;
      case 'hierophant': this.tone('sawtooth', 420, 160, 0.18, 0.25, 1); break;
    }
  }

  // ------------------------------------------------------------- events
  pickup(kind: 'gun' | 'ammo' | 'medikit' | 'key'): void {
    if (kind === 'gun') {
      this.tone('square', 420, 420, 0.07, 0.25);
      setTimeout(() => this.tone('square', 630, 630, 0.07, 0.25), 70);
      setTimeout(() => this.tone('square', 840, 840, 0.12, 0.28), 140);
    } else if (kind === 'medikit') {
      this.tone('sine', 520, 780, 0.16, 0.3, 1);
    } else if (kind === 'key') {
      this.tone('triangle', 1200, 1600, 0.1, 0.22);
      setTimeout(() => this.tone('triangle', 1600, 2100, 0.14, 0.2), 90);
    } else {
      this.tone('square', 260, 380, 0.06, 0.18);
    }
  }

  playerHurt(): void {
    this.tone('sawtooth', 300, 110, 0.16, 0.32, 1);
    this.noise(0.12, 0.28, 'bandpass', 500, 1.5);
  }

  door(open: boolean): void {
    if (open) {
      this.noise(0.7, 0.3, 'lowpass', 900, 0.8, 300);
      this.tone('sine', 90, 140, 0.6, 0.18);
    } else {
      this.tone('square', 180, 160, 0.12, 0.2);
      this.tone('square', 150, 130, 0.12, 0.2);
    }
  }

  sealBreak(): void {
    this.tone('sawtooth', 1800, 60, 0.9, 0.45, 2);
    this.noise(0.8, 0.6, 'bandpass', 2200, 0.7, 200);
    this.tone('sine', 55, 26, 1.1, 0.7, 1);
  }

  roar(): void {
    this.tone('sawtooth', 70, 180, 1.1, 0.5, 2);
    this.noise(0.9, 0.4, 'lowpass', 500, 0.8, 120);
  }

  winSting(): void {
    const notes = [262, 330, 392, 523, 659];
    notes.forEach((f, i) => setTimeout(() => this.tone('square', f, f, 0.24, 0.22, 1), i * 110));
    setTimeout(() => this.tone('sawtooth', 659, 659, 0.7, 0.2, 2), notes.length * 110);
  }

  loseSting(): void {
    const notes = [330, 277, 220, 165];
    notes.forEach((f, i) => setTimeout(() => this.tone('sawtooth', f, f * 0.96, 0.34, 0.24, 1), i * 190));
    setTimeout(() => this.tone('sine', 82, 40, 1.4, 0.5, 1), 700);
  }

  heartbeat(): void {
    this.tone('sine', 58, 40, 0.14, 0.5);
    setTimeout(() => this.tone('sine', 52, 36, 0.12, 0.4), 180);
  }

  // ------------------------------------------------------------- loops
  startAmbient(): void {
    if (!this.ctx || this.ambientNodes.length) return;
    const g = this.ctx.createGain();
    g.gain.value = 0.05;
    g.connect(this.out());
    this.ambientGain = g;
    for (const [f, det] of [[46, 0], [46.4, 3], [69, -2]] as [number, number][]) {
      const o = this.ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.detune.value = det;
      const og = this.ctx.createGain();
      og.gain.value = 0.33;
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 220;
      o.connect(og); og.connect(lp); lp.connect(g);
      o.start();
      this.ambientNodes.push(o);
    }
    // slow LFO on the drone
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 0.08;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 0.02;
    lfo.connect(lfoGain);
    lfoGain.connect(g.gain);
    lfo.start();
    this.ambientNodes.push(lfo);
  }

  stopAmbient(): void {
    for (const o of this.ambientNodes) { try { o.stop(); } catch { /* already stopped */ } }
    this.ambientNodes = [];
    this.ambientGain = null;
  }

  stopLoops(): void {
    this.stopAmbient();
    this.stopChaingun();
  }

  private stopChaingun(): void {
    if (this.chaingunLoop) {
      try { this.chaingunLoop.src.stop(); } catch { /* already stopped */ }
      this.chaingunLoop = null;
    }
  }

  update(dt: number, hpFrac: number): void {
    if (hpFrac < 0.25 && hpFrac > 0) {
      this.heartTimer -= dt;
      if (this.heartTimer <= 0) {
        this.heartTimer = 1.1;
        this.heartbeat();
      }
    }
  }

  // ------------------------------------------------------------- dispatch
  handleEvent(e: SimEvent): void {
    switch (e.t) {
      case 'shot': this.gunSound(e.gun); break;
      case 'dryfire': this.dryFire(); break;
      case 'explosion': this.explosion(e.radius); break;
      case 'enemyAlert': this.voice(e.type, 'alert'); break;
      case 'enemyPain': this.voice(e.type, 'pain'); break;
      case 'enemyDeath': this.voice(e.type, 'death'); break;
      case 'enemyShoot': this.enemyShoot(e.type); break;
      case 'pickup': this.pickup(e.kind); break;
      case 'playerHurt': this.playerHurt(); break;
      case 'doorDenied': this.door(false); break;
      case 'doorOpen': this.door(true); break;
      case 'sealBreak': this.sealBreak(); break;
      case 'arenaEnter': this.roar(); break;
      case 'playerDie': this.loseSting(); this.stopLoops(); break;
      case 'won': this.winSting(); this.stopLoops(); break;
      default: break;
    }
  }
}
