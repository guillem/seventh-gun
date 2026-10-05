import { describe, it, expect } from 'vitest';
import { deflateRaw, inflateRaw } from '../../src/app/mapShare';

// The browser helpers go through CompressionStream, which the zlib-hooked
// codec tests never touch. Incompressible input fills the stream's output
// buffers, so a writer that waits before anyone reads stalls forever.
describe('share compression streams', () => {
  it('round-trips a large incompressible payload without stalling', async () => {
    const data = new Uint8Array(256 * 1024);
    let x = 0x2545f491;
    for (let i = 0; i < data.length; i++) {
      x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
      data[i] = x & 0xff;
    }
    const packed = await deflateRaw(data);
    expect(packed.length).toBeGreaterThan(data.length / 2);
    expect(await inflateRaw(packed)).toEqual(data);
  }, 5000);

  it('rejects corrupt input instead of hanging', async () => {
    await expect(inflateRaw(new Uint8Array([0xff, 0xff, 0xff, 0xff]))).rejects.toThrow();
  }, 5000);
});
