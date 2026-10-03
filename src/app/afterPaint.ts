/** Yield a painted frame before synchronous preparation can block the UI. */
export function afterPaint(
  action: () => void | Promise<void>,
  requestFrame = requestAnimationFrame,
  cancelFrame = cancelAnimationFrame,
): { done: Promise<boolean>; cancel: () => void } {
  let frame = 0;
  let cancelled = false;
  let resolveDone: (completed: boolean) => void;
  const done = new Promise<boolean>((resolve, reject) => {
    resolveDone = resolve;
    frame = requestFrame(() => {
      frame = requestFrame(() => {
        if (cancelled) return;
        try {
          Promise.resolve(action()).then(() => resolve(!cancelled), reject);
        } catch (error) {
          reject(error);
        }
      });
    });
  });
  return {
    done,
    cancel: () => {
      cancelled = true;
      cancelFrame(frame);
      resolveDone(false);
    },
  };
}
