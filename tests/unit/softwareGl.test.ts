import { describe, expect, it } from 'vitest';
import { softwareGl } from '../helpers/softwareGl';

describe('E2E software rasterizer selection', () => {
  it('leaves local launches unchanged when E2E_GL is unset', () => {
    expect(softwareGl({})).toEqual({ args: [] });
  });

  it('selects new-headless Chromium on Mesa llvmpipe and names the renderer to verify', () => {
    const gl = softwareGl({ E2E_GL: 'llvmpipe' });
    expect(gl.channel).toBe('chromium');
    expect(gl.args).toEqual(['--use-gl=angle', '--use-angle=gl-egl', '--ignore-gpu-blocklist']);
    expect(gl.expectRenderer).toBe('llvmpipe');
  });

  it('rejects an unknown rasterizer instead of silently using the default', () => {
    expect(() => softwareGl({ E2E_GL: 'swiftshader-fast' })).toThrow(/Unknown E2E_GL/);
  });
});
