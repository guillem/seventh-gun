import { describe, it, expect } from 'vitest';
import { hudPanelLayout, HUD_HEALTH_SLOT_GAP } from '../../src/ui/hud';

describe('HUD panel layout', () => {
  it('health bar never reaches gun slot 1 across panel widths', () => {
    for (const panelW of [360, 480, 640, 860, 1200]) {
      const { barX, barW, slotX0, slotSize } = hudPanelLayout(panelW, 0);
      expect(barW, `bar visible at ${panelW}`).toBeGreaterThan(20);
      expect(barX + barW, `bar vs slot 1 at ${panelW}`).toBeLessThanOrEqual(slotX0 - HUD_HEALTH_SLOT_GAP);
      expect(slotSize, `slots readable at ${panelW}`).toBeGreaterThan(16);
    }
  });

  it('old 0.2-width bar from barX would overlap slot 1 (the playtest bug)', () => {
    const panelW = 860;
    const layout = hudPanelLayout(panelW);
    const oldBarW = panelW * 0.2;
    expect(layout.barX + oldBarW).toBeGreaterThan(layout.slotX0);
    expect(layout.barX + layout.barW).toBeLessThan(layout.slotX0);
  });
});
