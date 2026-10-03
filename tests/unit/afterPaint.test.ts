import { describe, expect, it, vi } from 'vitest';
import { afterPaint } from '../../src/app/afterPaint';

function frames() {
  let id = 0;
  const pending = new Map<number, FrameRequestCallback>();
  return {
    request: (callback: FrameRequestCallback) => { pending.set(++id, callback); return id; },
    cancel: (frame: number) => { pending.delete(frame); },
    paint: () => {
      const callbacks = [...pending.values()];
      pending.clear();
      for (const callback of callbacks) callback(0);
    },
  };
}

describe('world preparation paint barrier', () => {
  it('leaves a paint between showing the overlay and blocking preparation, then waits for async readiness', async () => {
    const raf = frames();
    let ready!: () => void;
    const action = vi.fn(() => new Promise<void>((resolve) => { ready = resolve; }));
    const task = afterPaint(action, raf.request, raf.cancel);
    expect(action).not.toHaveBeenCalled();
    raf.paint();
    expect(action).not.toHaveBeenCalled();
    raf.paint();
    expect(action).toHaveBeenCalledOnce();
    let finished = false;
    void task.done.then(() => { finished = true; });
    await Promise.resolve();
    expect(finished).toBe(false);
    ready();
    await expect(task.done).resolves.toBe(true);
  });

  it.each([0, 1])('does not prepare a disposed world after %i frames', async (painted) => {
    const raf = frames();
    const action = vi.fn();
    const task = afterPaint(action, raf.request, raf.cancel);
    for (let i = 0; i < painted; i++) raf.paint();
    task.cancel();
    raf.paint();
    raf.paint();
    expect(action).not.toHaveBeenCalled();
    await expect(task.done).resolves.toBe(false);
  });

  it.each([false, true])('reports preparation failure to the visible UI (async=%s)', async (asyncFailure) => {
    const raf = frames();
    const failure = new Error('Scene preparation failed');
    const task = afterPaint(() => {
      if (asyncFailure) return Promise.reject(failure);
      throw failure;
    }, raf.request, raf.cancel);
    const result = expect(task.done).rejects.toBe(failure);
    raf.paint();
    raf.paint();
    await result;
  });
});
