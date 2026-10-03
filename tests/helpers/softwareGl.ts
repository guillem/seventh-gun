/** Which software rasterizer Chromium uses on a machine with no GPU.
 *
 * Playwright's bundled headless shell renders WebGL through SwiftShader, whose
 * x64 Linux build JIT-compiles shaders with Subzero. For this branch's
 * renderer (24 unrolled lights, 573k triangles and 17 post passes per Foundry
 * frame) that measured, on a GitHub runner, 29 s to start the Foundry and
 * 1.8 s per frame, so no E2E run ever finished. Mesa's llvmpipe runs the same
 * frames about 5x faster and starts the map 4x faster; see docs/TESTING.md.
 *
 * `E2E_GL=llvmpipe` (set by CI) switches to full Chromium in new-headless mode
 * with ANGLE on Mesa's EGL. Unset, launches are unchanged, so local runs keep
 * the bundled default or a hardware browser via PLAYWRIGHT_CHANNEL. */
export interface SoftwareGl {
  channel?: string;
  args: string[];
  /** Substring the WebGL renderer string must contain, or the run is wrong. */
  expectRenderer?: string;
}

export function softwareGl(env: Record<string, string | undefined> = process.env): SoftwareGl {
  const choice = env.E2E_GL;
  if (!choice) return { args: [] };
  if (choice === 'llvmpipe') {
    return {
      channel: 'chromium',
      // Chromium blocklists llvmpipe for WebGL and would silently fall back to
      // SwiftShader without the last flag.
      args: ['--use-gl=angle', '--use-angle=gl-egl', '--ignore-gpu-blocklist'],
      expectRenderer: 'llvmpipe',
    };
  }
  throw new Error(`Unknown E2E_GL "${choice}" (expected "llvmpipe" or unset)`);
}
