import { describe, expect, it, vi } from 'vitest';
import { AudioEngine } from '../../src/audio/audio';

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
