import type { TickScheduler } from './room';

// Plain setInterval/setTimeout. Standard in both workerd and Node, so the
// Worker entry and the self-host entry share this unchanged.
export function intervalScheduler(): TickScheduler {
  let handle: ReturnType<typeof setInterval> | null = null;
  return {
    start(fn, hz) {
      if (handle) return;
      handle = setInterval(fn, 1000 / hz);
    },
    stop() {
      if (handle) clearInterval(handle);
      handle = null;
    },
    timeout(fn, ms) {
      const id = setTimeout(fn, ms);
      return () => clearTimeout(id);
    },
  };
}
