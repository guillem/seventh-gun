import { describe, expect, it } from 'vitest';
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
