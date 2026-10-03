import { describe, expect, it, vi } from 'vitest';
import { AudioEngine } from '../../src/audio/audio';
import { MODERN_SAMPLE_IDS } from '../../src/audio/samples';
import type { EnemyType, SimEvent } from '../../src/sim/types';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

describe('arena audio admission', () => {
  it('rejects inaudible events before allocating voices and reserves feedback for local play', () => {
    let allocations = 0;
    const audio = new AudioEngine() as unknown as {
      ctx: { currentTime: number; createBufferSource: () => never; createBiquadFilter: () => never; createGain: () => never };
      eventGain: number;
      eventPriority: boolean;
      canPlay: (duration: number, count?: number) => boolean;
      handleEvent: (event: { t: 'shot'; gun: number; x: number; z: number; yaw: number }, gain: number) => void;
    };
    audio.ctx = {
      currentTime: 0,
      createBufferSource: () => { allocations++; throw new Error('inaudible sound allocated'); },
      createBiquadFilter: () => { allocations++; throw new Error('inaudible sound allocated'); },
      createGain: () => { allocations++; throw new Error('inaudible sound allocated'); },
    };

    audio.handleEvent({ t: 'shot', gun: 1, x: 0, z: 0, yaw: 0 }, 0);
    expect(allocations).toBe(0);

    // Six seconds of crowded remote calls remain bounded by active lifetime,
    // while the local reserve still admits immediate weapon feedback.
    audio.eventGain = 1;
    audio.eventPriority = false;
    for (let ms = 0; ms < 6000; ms += 20) {
      audio.ctx.currentTime = ms / 1000;
      audio.canPlay(0.5, 2);
    }
    audio.ctx.currentTime = 7;
    audio.eventGain = 1;
    audio.eventPriority = false;
    for (let i = 0; i < 13; i++) expect(audio.canPlay(1, 2)).toBe(true);
    expect(audio.canPlay(1, 1)).toBe(false);
    audio.eventPriority = true;
    expect(audio.canPlay(0.1, 1)).toBe(true);
  });
});

function sampledAudio() {
  const sources: { buffer: unknown; loop: boolean; playbackRate: { value: number }; start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }[] = [];
  const gains: { gain: { value: number }; connect: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }[] = [];
  const ctx = {
    currentTime: 0,
    destination: {},
    createBufferSource: () => {
      const src = { buffer: null, loop: false, playbackRate: { value: 1 }, start: vi.fn(), stop: vi.fn(), connect: vi.fn(), disconnect: vi.fn(), onended: null };
      sources.push(src);
      return src;
    },
    createGain: () => {
      const gain = { gain: { value: 1 }, connect: vi.fn(), disconnect: vi.fn() };
      gains.push(gain);
      return gain;
    },
  };
  const audio = new AudioEngine();
  Object.assign(audio, {
    ctx,
    samples: new Map([
      ['pistol-a', { duration: 1 }], ['pistol-b', { duration: 1 }],
      ['industrial-ambient', { duration: 7.75 }],
    ]),
  });
  return { audio, ctx, sources, gains };
}

describe('generated audio playback', () => {
  it('uses recordings for every gun, creature event and feedback cue without allocating a synth', () => {
    const { audio, ctx, sources } = sampledAudio();
    Object.assign(audio, { samples: new Map(MODERN_SAMPLE_IDS.map(id => [id, { duration: .5, id }])) });
    const events: SimEvent[] = [];
    for (let gun = 1; gun <= 7; gun++) events.push({ t: 'shot', gun, x: 0, z: 0, yaw: 0 });
    for (const type of ['husk', 'crawler', 'slab', 'wisp', 'hierophant', 'fiend'] as EnemyType[]) {
      for (const t of ['enemyAlert', 'enemyPain', 'enemyDeath'] as const) events.push({ t, type, id: 1, x: 0, z: 0 });
      events.push({ t: 'enemyShoot', type, x: 0, y: 1, z: 0 });
    }
    for (const kind of ['gun', 'ammo', 'medikit', 'key', 'powerup'] as const) events.push({ t: 'pickup', kind, label: '' });
    events.push({ t: 'dryfire', gun: 1 }, { t: 'explosion', radius: 4, x: 0, y: 0, z: 0 },
      { t: 'playerHurt', damage: 1, fromAngle: 0 }, { t: 'playerShielded', fromAngle: 0 },
      { t: 'doorOpen', id: 0 }, { t: 'doorDenied' }, { t: 'secretFound', id: 0 },
      { t: 'sealBreak' }, { t: 'arenaEnter' }, { t: 'won' }, { t: 'playerDie' });
    for (const t of ['powerupStart', 'powerupWarn', 'powerupEnd'] as const) events.push({ t, kind: 'ward' });
    for (const event of events) {
      ctx.currentTime += 10;
      const count = sources.length;
      // The mock has no createOscillator/createBiquadFilter. An accidental
      // synth path fails here instead of silently passing a routing assertion.
      audio.handleEvent(event);
      expect(sources.length, event.t).toBe(count + 1);
    }
    ctx.currentTime += 10;
    audio.heartbeat();
    expect((sources.at(-1)!.buffer as { id: string }).id).toBe('heartbeat');
    audio.setMuted(true);
    const beforeMuted = sources.length;
    for (const event of events) audio.handleEvent(event);
    expect(sources).toHaveLength(beforeMuted);
  });

  it('ships every registered recording with its retained source and verified runtime checksum', () => {
    const first = JSON.parse(readFileSync(new URL('../../art/modern/audio-processing.json', import.meta.url), 'utf8'));
    const roster = JSON.parse(readFileSync(new URL('../../art/modern/roster/audio/processing.json', import.meta.url), 'utf8'));
    const entries = new Map([...first, ...roster].map(row => [row.id, row]));
    const hashes = new Set<string>();
    for (const id of MODERN_SAMPLE_IDS) {
      const entry = entries.get(id)!;
      expect(entry, id).toBeDefined();
      const bytes = readFileSync(new URL(`../../public/modern/audio/${id}.mp3`, import.meta.url));
      const hash = createHash('sha256').update(bytes).digest('hex');
      expect(hash).toBe(entry.runtimeSha256);
      hashes.add(hash);
      const source = entry.source ?? `art/modern/audio-sources/${id}.mp3`;
      expect(createHash('sha256').update(readFileSync(new URL(`../../${source}`, import.meta.url))).digest('hex')).toBe(entry.sourceSha256);
      expect(entry.duration).toBeGreaterThan(.1);
    }
    expect(hashes.size).toBe(MODERN_SAMPLE_IDS.length);
  });

  it('applies distance gain before output and preserves local voice capacity when samples crowd the arena', () => {
    const { audio, ctx, sources, gains } = sampledAudio();
    const event = { t: 'shot', gun: 1, x: 0, z: 0, yaw: 0 } as const;
    audio.handleEvent(event, 0, false);
    expect(sources).toHaveLength(0);
    for (let i = 0; i < 40; i++) audio.handleEvent(event, 0.4, false);
    expect(sources).toHaveLength(26);
    expect(gains[0].gain.value).toBeCloseTo(0.4 * 0.85);
    audio.handleEvent(event, 1, true);
    expect(sources).toHaveLength(27);
    ctx.currentTime = 2;
    audio.handleEvent(event, 1, false);
    expect(sources).toHaveLength(28);
  });

  it('keeps only one ambient loop and disconnects it before restart', () => {
    const { audio, sources, gains } = sampledAudio();
    audio.startAmbient();
    audio.startAmbient();
    expect(sources).toHaveLength(1);
    expect(sources[0].loop).toBe(true);
    audio.stopLoops();
    audio.stopLoops();
    expect(sources[0].stop).toHaveBeenCalledTimes(1);
    expect(sources[0].disconnect).toHaveBeenCalledTimes(1);
    expect(gains[0].disconnect).toHaveBeenCalledTimes(1);
    audio.startAmbient();
    expect(sources).toHaveLength(2);
    expect(sources[1].start).toHaveBeenCalledTimes(1);
  });
});

describe('saved audio preload', () => {
  it('reports missing files and retries without refetching successful assets', async () => {
    vi.resetModules();
    const { preloadModernAudio, MODERN_SAMPLE_IDS } = await import('../../src/audio/samples');
    let missing = true;
    const fetcher = vi.fn(async (url: string) => ({
      ok: !(missing && url.endsWith('/pistol-a.mp3')),
      status: missing && url.endsWith('/pistol-a.mp3') ? 404 : 200,
      arrayBuffer: async () => new ArrayBuffer(32),
    }));
    vi.stubGlobal('fetch', fetcher);
    try {
      await expect(preloadModernAudio()).rejects.toThrow('Audio asset pistol-a: HTTP 404');
      missing = false;
      await preloadModernAudio();
      expect(fetcher).toHaveBeenCalledTimes(MODERN_SAMPLE_IDS.length + 1);
      await preloadModernAudio();
      expect(fetcher).toHaveBeenCalledTimes(MODERN_SAMPLE_IDS.length + 1);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
