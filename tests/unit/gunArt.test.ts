// Each gun's one hot element must wear that gun's muzzle-flash colour (the
// rule written at the top of viewmodels.ts). That held only by hand until the
// colours lived in two places and drifted — the Sunlance wore yellow rings
// while flashing cyan, and the yellow collided with the slab's accent hue.
// GUN_FLASH is now the single source of truth; these tests keep it that way.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { GUN_FLASH } from '../../src/render/gunArt';

const src = (p: string): string =>
  readFileSync(resolve(__dirname, '../../src/render', p), 'utf8');

describe('gun flash colours are single-sourced', () => {
  it('covers all seven guns with distinct colours', () => {
    expect(GUN_FLASH).toHaveLength(7);
    expect(new Set(GUN_FLASH).size, 'two guns share a flash colour').toBe(7);
  });

  it('renderer paints the flash from GUN_FLASH, not its own list', () => {
    const r = src('renderer.ts');
    expect(r).toContain('GUN_FLASH');
    // the old inline duplicate: a bracketed run of 7 hex literals
    expect(
      /const colors\s*=\s*\[\s*0x[0-9a-f]{6}\s*,/.test(r),
      'renderer.ts has re-inlined its own flash colour list',
    ).toBe(false);
  });

  it('no viewmodel hardcodes a flash colour instead of indexing GUN_FLASH', () => {
    const vm = src('viewmodels.ts');
    // Strip comments so the documented hexes in the header do not count.
    const code = vm.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const c of GUN_FLASH) {
      const hex = `0x${c.toString(16).padStart(6, '0')}`;
      expect(
        code.includes(hex),
        `viewmodels.ts hardcodes ${hex}; use GUN_FLASH instead so it tracks the flash`,
      ).toBe(false);
    }
  });

  it('the sunlance is cyan, not the slab enemy\'s molten yellow', () => {
    // Regression on the specific collision found in review.
    expect(GUN_FLASH[5]).toBe(0x9ff4ff);
    expect(GUN_FLASH[5]).not.toBe(0xffd23a);
  });
});
