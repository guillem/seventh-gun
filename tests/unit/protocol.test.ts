import { describe, it, expect } from 'vitest';
import { decodeClient, isClientMessage, isServerMessage } from '../../src/net/protocol';

describe('protocol guards', () => {
  it('accepts valid client frames', () => {
    expect(isClientMessage({ v: 1, t: 'join', name: 'TEST' })).toBe(true);
    expect(isClientMessage({
      v: 1, t: 'input', seq: 1,
      inputs: [{ moveX: 0, moveZ: 1, yaw: 0, pitch: 0, fire: false }],
    })).toBe(true);
    expect(isClientMessage({ v: 1, t: 'ping', at: 1 })).toBe(true);
  });

  it('rejects bad v', () => {
    expect(decodeClient(JSON.stringify({ v: 2, t: 'join', name: 'X' }))).toBe('bad-v');
  });

  it('ignores unknown t', () => {
    expect(decodeClient(JSON.stringify({ v: 1, t: 'chat', text: 'hi' }))).toBe('unknown');
  });

  it('caps inputs per message at 8', () => {
    const inputs = Array.from({ length: 9 }, () => ({
      moveX: 0, moveZ: 0, yaw: 0, pitch: 0, fire: false,
    }));
    expect(isClientMessage({ v: 1, t: 'input', seq: 1, inputs })).toBe(false);
    inputs.pop();
    expect(isClientMessage({ v: 1, t: 'input', seq: 1, inputs })).toBe(true);
  });

  it('accepts valid server frames', () => {
    expect(isServerMessage({ v: 1, t: 'full' })).toBe(true);
    expect(isServerMessage({ v: 1, t: 'kicked', reason: 'idle' })).toBe(true);
  });
});
