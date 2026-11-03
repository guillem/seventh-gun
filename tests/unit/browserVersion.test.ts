import { describe, expect, it } from 'vitest';
import { assertBrowserVersion, minimumChromeVersion } from '../../scripts/browser.mjs';

describe('Chrome security baseline', () => {
  it('accepts the baseline and later stable builds', () => {
    for (const version of [minimumChromeVersion, '156.0.8078.80', '157.0.0.0']) {
      expect(() => assertBrowserVersion(version)).not.toThrow();
    }
  });
  it('rejects the retained old Chromium and a build before the security patch', () => {
    for (const version of ['151.0.7922.34', '156.0.8078.78']) {
      expect(() => assertBrowserVersion(version)).toThrow(/security baseline/);
    }
  });
  it('rejects unrecognised version strings', () => {
    for (const version of ['', 'unknown', '156.0', '156.0.8078.80-beta']) {
      expect(() => assertBrowserVersion(version)).toThrow(/security baseline/);
    }
  });
});
