/** Optional Linux software rasterizer for stable Chrome. Browser selection
 * stays in the Playwright config and shared Chrome launcher; this helper only
 * selects GPU arguments and the renderer that global setup must verify. */
export interface SoftwareGl {
  args: string[];
  /** Substring the WebGL renderer string must contain, or the run is wrong. */
  expectRenderer?: string;
}

export function softwareGl(env: Record<string, string | undefined> = process.env): SoftwareGl {
  const choice = env.E2E_GL;
  if (!choice) return { args: [] };
  if (choice === 'llvmpipe') {
    return {
      // Chromium blocklists llvmpipe for WebGL and would silently fall back to
      // SwiftShader without the last flag.
      args: ['--use-gl=angle', '--use-angle=gl-egl', '--ignore-gpu-blocklist'],
      expectRenderer: 'llvmpipe',
    };
  }
  throw new Error(`Unknown E2E_GL "${choice}" (expected "llvmpipe" or unset)`);
}
