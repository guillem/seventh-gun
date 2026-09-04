// The self-host adapter layer: the only code the Node target adds on top of
// ArenaRoom. The room itself is covered by room.test.ts.
import { describe, it, expect } from 'vitest';
import type { IncomingMessage } from 'node:http';
import { originAllowed, toRoomSocket } from '../../server/node/main';

const req = (headers: Record<string, string>) => ({ headers }) as unknown as IncomingMessage;

describe('originAllowed (node)', () => {
  it('allows a request with no Origin at all (curl, native clients)', () => {
    expect(originAllowed(req({ host: 'box.local:8080' }), [])).toBe(true);
  });

  it('allows same-host, which is what makes LAN play work with no config', () => {
    expect(originAllowed(req({ origin: 'http://box.local:8080', host: 'box.local:8080' }), [])).toBe(true);
    expect(originAllowed(req({ origin: 'http://192.168.1.14:8080', host: '192.168.1.14:8080' }), [])).toBe(true);
  });

  it('rejects a cross-origin request that is not on the allow list', () => {
    expect(originAllowed(req({ origin: 'https://evil.example', host: 'box.local:8080' }), [])).toBe(false);
  });

  it('accepts a cross-origin request that is on the allow list', () => {
    const allowed = ['https://seventh-gun.netlify.app'];
    expect(originAllowed(req({ origin: 'https://seventh-gun.netlify.app', host: 'box:8080' }), allowed)).toBe(true);
    expect(originAllowed(req({ origin: 'https://other.example', host: 'box:8080' }), allowed)).toBe(false);
  });

  it('rejects a malformed Origin rather than throwing', () => {
    expect(originAllowed(req({ origin: ':://nonsense', host: 'box:8080' }), [])).toBe(false);
  });
});

describe('toRoomSocket', () => {
  const fakeWs = (readyState: number) => {
    const calls: { sent: string[]; closed: [number | undefined, string | undefined][]; terminated: number } = {
      sent: [], closed: [], terminated: 0,
    };
    const ws = {
      OPEN: 1,
      readyState,
      send: (t: string) => calls.sent.push(t),
      close: (c?: number, r?: string) => calls.closed.push([c, r]),
      terminate: () => { calls.terminated++; },
    };
    return { ws, calls };
  };

  it('forwards sends while the socket is open', () => {
    const { ws, calls } = fakeWs(1);
    toRoomSocket(ws as never).send('hello');
    expect(calls.sent).toEqual(['hello']);
  });

  it('drops sends on a socket that is closing, instead of throwing', () => {
    const { ws, calls } = fakeWs(2);
    expect(() => toRoomSocket(ws as never).send('hello')).not.toThrow();
    expect(calls.sent).toEqual([]);
  });

  it('passes the room close code and reason straight through', () => {
    const { ws, calls } = fakeWs(1);
    toRoomSocket(ws as never).close(4000, 'idle');
    expect(calls.closed).toEqual([[4000, 'idle']]);
  });

  it('falls back to terminate when close throws', () => {
    const { ws, calls } = fakeWs(1);
    ws.close = () => { throw new Error('already gone'); };
    toRoomSocket(ws as never).close(4000, 'protocol');
    expect(calls.terminated).toBe(1);
  });
});
