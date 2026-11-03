// Security baseline checked against Chrome's 2026-10-29 desktop release.
// Review this floor when Google publishes new security fixes; it is not an auto-update check.
import { chromium } from 'playwright';

export const minimumChromeVersion = '156.0.8078.79';

/** @param {string} version */
export function assertBrowserVersion(version) {
  const actual = version.split('.').map(Number);
  const minimum = minimumChromeVersion.split('.').map(Number);
  const firstDifference = actual.findIndex((part, index) => part !== minimum[index]);
  if (
    !/^\d+\.\d+\.\d+\.\d+$/.test(version) ||
    (firstDifference !== -1 && actual[firstDifference] < minimum[firstDifference])
  ) {
    throw new Error(
      `Chrome ${version} is below the security baseline ${minimumChromeVersion}. Update Google Chrome Stable before running browser tasks.`
    );
  }
}

export async function launchBrowser() {
  const browser = await chromium.launch({ channel: 'chrome' });
  try {
    assertBrowserVersion(browser.version());
    return browser;
  } catch (error) {
    await browser.close();
    throw error;
  }
}

export default async function checkBrowser() {
  const browser = await launchBrowser();
  console.log(`Browser preflight: Chrome ${browser.version()} (stable channel)`);
  await browser.close();
}
