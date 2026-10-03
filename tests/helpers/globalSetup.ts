import { chromium } from '@playwright/test';
import { softwareGl } from './softwareGl';

/** Print the WebGL renderer every run, and refuse to start when E2E_GL asked
 * for a rasterizer the browser did not give us. A silent fallback to
 * SwiftShader does not fail anything directly: it shows up twenty minutes
 * later as a cancelled job full of timeouts. */
export default async function globalSetup(): Promise<void> {
  const gl = softwareGl();
  const browser = await chromium.launch({
    channel: process.env.PLAYWRIGHT_CHANNEL || gl.channel,
    args: gl.args,
  });
  try {
    const page = await browser.newPage();
    const renderer = await page.evaluate(() => {
      const context = document.createElement('canvas').getContext('webgl2');
      const info = context?.getExtension('WEBGL_debug_renderer_info');
      return context && info ? String(context.getParameter(info.UNMASKED_RENDERER_WEBGL)) : 'unavailable';
    });
    console.log(`[e2e] WebGL renderer: ${renderer}`);
    if (gl.expectRenderer && !renderer.includes(gl.expectRenderer)) {
      throw new Error(
        `E2E_GL=${process.env.E2E_GL} expected a "${gl.expectRenderer}" WebGL renderer but Chromium reported "${renderer}". ` +
        'E2E_GL is for Linux with Mesa EGL installed (Ubuntu: libegl1 libegl-mesa0 libgl1-mesa-dri); unset it elsewhere.',
      );
    }
  } finally {
    await browser.close();
  }
}
