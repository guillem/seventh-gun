// Shared Playwright `test` for every E2E spec.
//
// Pointer lock is stubbed in every page. With the installed Chrome on macOS
// (PLAYWRIGHT_CHANNEL=chrome), a page's requestPointerLock() captures and
// recentres the developer's real cursor even in headless mode, so a local run
// made the desktop cursor jump around. No test asserts a real lock: the game
// works unlocked (debug API / synthetic input), as it does on CI runners.
import { test as base, expect, type Browser, type BrowserContext } from '@playwright/test';

function noPointerLock(): void {
  const resolved = function (): Promise<void> { return Promise.resolve(); };
  Element.prototype.requestPointerLock = resolved as typeof Element.prototype.requestPointerLock;
}

async function guard(context: BrowserContext): Promise<BrowserContext> {
  await context.addInitScript(noPointerLock);
  return context;
}

export const test = base.extend<object, { browser: Browser }>({
  // Contexts a spec creates itself (two-client arena tests) are guarded too.
  browser: [async ({ browser }, use) => {
    const newContext = browser.newContext.bind(browser);
    browser.newContext = async (...args: Parameters<Browser['newContext']>) => guard(await newContext(...args));
    await use(browser);
  }, { scope: 'worker' }],
  context: async ({ context }, use) => {
    await use(await guard(context));
  },
});

export { expect };
