/** Saved generated recordings for the experimental art slice. No AudioContext
 * is created until the player's first gesture; startup only downloads bytes. */
export const MODERN_SAMPLE_IDS = [
  'pistol-a', 'pistol-b', 'shotgun', 'door-open', 'metal-impact',
  'husk-alert', 'husk-pain', 'industrial-ambient',
  'chaingun', 'spiker', 'bile', 'sunlance', 'seventh',
  'crawler-voice', 'crawler-pain', 'crawler-death',
  'slab-voice', 'slab-pain', 'slab-death',
  'wisp-voice', 'wisp-pain', 'wisp-death',
  'hierophant-voice', 'hierophant-pain', 'hierophant-death',
  'fiend-voice', 'fiend-pain', 'fiend-death', 'husk-death',
  'explosion', 'dryfire', 'pickup', 'medical', 'key', 'powerup',
  'hurt', 'seal', 'heartbeat', 'success', 'failure',
] as const;

export type ModernSampleId = typeof MODERN_SAMPLE_IDS[number];
const encoded = new Map<ModernSampleId, ArrayBuffer>();
let preload: Promise<void> | null = null;
const baseUrl = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';

export function preloadModernAudio(): Promise<void> {
  if (!preload) {
    preload = Promise.all(MODERN_SAMPLE_IDS.map(async (id) => {
      if (encoded.has(id)) return;
      const response = await fetch(`${baseUrl}modern/audio/${id}.mp3`, {
        signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) throw new Error(`Audio asset ${id}: HTTP ${response.status}`);
      const bytes = await response.arrayBuffer();
      if (!bytes.byteLength) throw new Error(`Audio asset ${id} is empty`);
      encoded.set(id, bytes);
    })).then(() => undefined).catch((error: unknown) => {
      preload = null;
      throw error;
    });
  }
  return preload;
}

/** A codec failure is recoverable: that sound uses the existing synth. */
export async function decodeModernAudio(ctx: AudioContext): Promise<Map<ModernSampleId, AudioBuffer>> {
  const decoded = new Map<ModernSampleId, AudioBuffer>();
  await Promise.all([...encoded].map(async ([id, bytes]) => {
    try {
      // decodeAudioData detaches the input on some browsers. Keep source bytes
      // for another context (or a resumed/restarted game).
      const buffer = await ctx.decodeAudioData(bytes.slice(0));
      decoded.set(id, buffer);
    } catch {
      console.warn(`Could not decode audio asset ${id}; using synthesized fallback.`);
    }
  }));
  return decoded;
}
