import { describe, it, expect } from 'vitest';
import { hudPanelLayout, HUD_HEALTH_SLOT_GAP, sortArenaRoster } from '../../src/ui/hud';

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

  it('arena roster sorts by frags desc then deaths asc', () => {
    const sorted = sortArenaRoster([
      { id: 1, name: 'A', colorIndex: 0, frags: 2, deaths: 4, alive: true },
      { id: 2, name: 'B', colorIndex: 1, frags: 5, deaths: 1, alive: true },
      { id: 3, name: 'C', colorIndex: 2, frags: 5, deaths: 0, alive: true },
    ]);
    expect(sorted.map((r) => r.name)).toEqual(['C', 'B', 'A']);
  });
});
